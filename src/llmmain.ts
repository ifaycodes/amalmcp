import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { OpenAI } from 'openai/client.js';
import { withRetry } from './llmgenerator.ts';
import type { ChatCompletionTool } from 'openai/resources.js';

const ai = new OpenAI({ 
    baseURL: 'https://api.tokenfactory.nebius.com/v1/',
    apiKey: process.env.NEBIUS_API_KEY,
});

const mcp = new Client({ name: 'TutorTots', version: '1.0.0 '});
await mcp.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3001/mcp')));

const { tools } = await mcp.listTools();
const toolDeclarations: ChatCompletionTool[] = tools.map(t => ({
    type: 'function',
    function: {name: t.name, description: t.description, parameters: t.inputSchema as Record<string, unknown>,}
}));

const SYSTEM_PROMPT = `
    You are a friendly voice assistant in a family home, helping children learn
    while their parent is busy. You do not teach by yourself. You use tools.

    Speak to the child by name, in short, warm sentences suitable for the
    youngest child present.

    Rules:
    - If a child asks to learn something, call tool generate_lesson.
    - If a child says they don't understand, call tool explain_concept.
    - When generate_lesson returns, it includes sections tagged with an index (0, 1, 2 ...).
      Read ONLY the section with index 0 to the child, then ask "Does that make sense?"
      Do NOT read any other section yet. Wait for the child's reply.
      When the child says yes, okay, next, or anything agreeable, speak the next index.
      Work through sections one index at a time, always waiting for a response before moving on.
    - After the last section, offer a quiz and use tools get_next_question and check_answer.
    - If a parent asks how a child is doing, call tool get_progress.
    - If the request is unrelated to learning, say kindly that you are here for
    lessons, and offer one.
    - Never ask for or repeat personal details such as addresses or phone numbers.
    - If you don’t know which child is speaking, ask
    - Always pass their name when starting a lesson.
    - No emojis. Reading them out are awkward
    `

const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ "role": 'system', "content": SYSTEM_PROMPT, }];

let lastQuestion: { question: string, options: string[] } | null = null;

export async function* handleUtterance(text: string): AsyncGenerator< {type: 'chunk'; text: string} | {type: 'done'; question: typeof lastQuestion}> {
    messages.push({ role: 'user', content: text });

    for (let step = 0; step < 6; step++) {
        console.log(`[step ${step}] calling LLM...`);
        const stream = await withRetry(() => ai.chat.completions.create({
            model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
            messages,
            tools: toolDeclarations,
            stream: true
        }));
        let textContent = '';
        let toolId = '';
        let toolName = '';
        let toolArgs = '';
        let isToolCall = false;

        console.log(`[step ${step}] stream opened, reading chunks...`);
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;
            console.log("DELTA RECEIVED:", JSON.stringify(delta));
            if (delta.tool_calls?.length) {
                isToolCall = true;
                const tc = delta.tool_calls[0];
                if (tc.id) toolId += tc.id;
                if (tc.function?.name) toolName += tc.function.name;
                if (tc.function?.arguments) toolArgs += tc.function.arguments;
            }

            if (delta.content) {
                textContent += delta.content;
                if (!isToolCall) yield { type: 'chunk', text: delta.content };
            }
        }
        console.log(`[step ${step}] stream done, isToolCall:`, isToolCall);

        if (!isToolCall) {
            console.log(`[step ${step}] stream done here's message, isToolCall:`, isToolCall);
            messages.push({ role: 'assistant', content: textContent });
            yield { type: 'done', question: lastQuestion };
            return;
        }

        messages.push({ role: 'assistant', content: null, tool_calls: [{
            id: toolId, type: 'function', function: {name: toolName, arguments: toolArgs}
        }]});

        const args = JSON.parse(toolArgs || '{}');
        const response = await mcp.callTool({ name: toolName, arguments: args });
        const out = (response.content as { text?: string }[]).map(x => x.text ?? "").join("");

        if (toolName === "get_next_question") {
            try { lastQuestion = JSON.parse(out); } catch {}
        }
        if (toolName === 'generate_lesson') lastQuestion = null;
        if (toolName === 'check_answer') {
            try { if (JSON.parse(out).finished) lastQuestion = null; } catch {}
        }

        try {
            messages.push({ role: 'tool', tool_call_id: toolId, content: out });
        } catch (error: any) {
            yield { type: 'chunk', text: error.message };
        }
    }
    yield { type: 'chunk', text: "Sorry, I got stuck. Let's try that again." };
    yield { type: 'done', question: lastQuestion };
}
