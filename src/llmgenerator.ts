import { OpenAI } from 'openai/client.js'
import { readFileSync, existsSync } from 'node:fs';
import 'dotenv/config';

const ai = new OpenAI({ 
    baseURL: 'https://api.tokenfactory.nebius.com/v1/',
    apiKey: process.env.NEBIUS_API_KEY 
});
const MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';

export async function askLlmText(prompt: string, childname: string): Promise<string> {
    const system = system_prompt(childname);

    const res = await withRetry(() => ai.chat.completions.create({
        'model': MODEL, 
        'messages': [{"role": 'system', "content": system}, { 'role': 'user', 'content': [
                    { 'type': 'text', 'text': prompt, } ], }]
    }));
    return res.choices[0].message.content ?? "";
}

export async function askLlmJson(prompt: string, childname: string): Promise<unknown> {
    const system = system_prompt(childname);

    const res = await withRetry(() => ai.chat.completions.create({
        'model': MODEL, 
        'messages': [{"role": 'system', "content": system}, { 'role': 'user', 'content': [
                    { 'type': 'text', 'text': prompt, } ], }]
    }));
    const raw = res.choices[0].message.content ?? "{}";
    try { return JSON.parse(raw); } catch { return {}; }
}

export function system_prompt(childname: string) {
    try {
        const filePath = existsSync('housedata.json') ? 'housedata.json' : 'household.json';
        const householdData = JSON.parse(readFileSync(filePath, 'utf8'));

        const child = householdData.children.find((c: any) => c.name?.toLowerCase() === childname.trim().toLowerCase());
        if (!child) throw new Error (`I don't know a child called ${childname}. Ask a parent to add them`);

        const maxWords = child.age <= 6 ? 15 : 20;
        const avoidTopics: string[] = householdData.rules?.avoid_topics;
        const interests = Array.isArray(child.interests) ? child.interests.join(', ') : (child.interests || '');

        return `You are a patient teacher writing for ${child.name}, age ${child.age}, and in grade ${child.grade}.
        Interests: ${interests}. Use them for examples when they fit naturally.
        Use words a ${child.age}-year-old knows. Keep sentences under ${maxWords}.
        ${avoidTopics.length ?  `Never include ${avoidTopics.join(', ')}.` : ''} 
        No markdown, since this is read aloud.
        `;
    } catch (error) {
        console.error('Could not read household data: ', error);
        return '';
    }
}

export async function withRetry<T> (fn: () => Promise<T>): Promise<T> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (let attempt = 0; ; attempt++) {
        try { return await fn(); }
        catch (error: any) {
            const status = error.status ?? error.statusCode;
            const retryable = status === 429 || status >= 500;
            if (!retryable || attempt === MAX_RETRIES - 1) throw error;
            console.error(`retry ${attempt + 1}/${MAX_RETRIES}: ${error.message}`);
            await sleep((Math.min(RETRY_DELAY * 2 ** attempt, 60000)) + Math.random() * 1000);
        }
    }
}