import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE, } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from "node:fs";
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from "zod";
import { callingLlmforLesson, llmExplainConcept, checkAnswer, getNextQuestion } from "./lessons.ts";

const DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist');

// create new mcp sever instance; register tools and resources to use
export function createMcpServer(): McpServer {
    const server = new McpServer({
        name: "TutorTots",
        version: "1.0.0",
    });

    // tying resource and tool together with a resource uri
    const resourceUri = "ui://tutortots/mcp-app.html";

    registerAppTool(server, 'generate_lesson', {
        title: "Generate Lesson",
        description: "Generate lesson on a specific topic for a child",
        inputSchema: z.object({
            topic: z.string().min(1, "Topic is required"),
            childname: z.string(),
        }),
        _meta: { ui: { resourceUri } },
    }, async ({ topic, childname }) => {
        const lesson = await callingLlmforLesson(topic, childname);
        const sections = lesson.sections.map((text, i) => ({ index: i, text }))
        const out = { lessonid: lesson.id, topic: lesson.topic, sections, quizLength: lesson.quiz.length };
        return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
    },);

    // --- Tool 2: Explain Concept ---
    registerAppTool(server, 'explain_concept', {
        title: "Explain Concept",
        description: "Explains a complex concept in simple terms for the child. Especially if they point it out",
        inputSchema: z.object({
            concept: z.string().min(1),
            childname: z.string(),
        }),
        _meta: { ui: { resourceUri } },
    }, async ({ concept, childname }) => {
        const explanation = await llmExplainConcept(concept, childname);
        return { content: [{ type: 'text', text: explanation }] };
    });

    // --- Tool 3: Get Quiz questions one by one ---
    registerAppTool(server, 'get_next_question', {
        title: "Get quiz question",
        description: "Get one multiple-choice question to ask the child.",
        inputSchema: z.object({
            lessonid: z.number().min(1),
            questionIndex: z.number().min(0),
        }),
        _meta: { ui: { resourceUri } },
    }, async ({ lessonid, questionIndex }) => {
        const nextQuestion= await getNextQuestion(lessonid, questionIndex);
        const out = { question: nextQuestion.question, options: nextQuestion.options}
        return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
    });

    // --- Tool 4: Check Answer to questions ---
    registerAppTool(server, 'check_answer', {
        title: "Check Answer",
        description: "Check the childs spoken or chosen answer.",
        inputSchema: z.object({
            lessonid: z.number().min(1),
            questionIndex: z.number().min(0),
            answer: z.string().min(1),
        }),
        _meta: { ui: { resourceUri } },
    }, async ({ lessonid, questionIndex, answer }) => {
        const isCorrect = await checkAnswer(lessonid, questionIndex, answer);
        return { content: [{ type: 'text', text: JSON.stringify(isCorrect) }] };
    });

    registerAppTool(server, 'get_progress', {
        title: "Get Child's Progress",
        description: "Return student quiz score and progress so far",
        inputSchema: z.object({
            childname: z.string().min(1),
        }),
        _meta: { ui: { resourceUri } },
    }, async ({ childname }) => {
        const all = existsSync('progress.json') ? JSON.parse(readFileSync('progress.json', 'utf8')) : [];
        const mine = all.filter(
            (r: { childname: string }) => 
                r.childname.toLowerCase() === childname.trim().toLowerCase()
        );
        return { content: [{ type: 'text', text: JSON.stringify({ childname, sessions: mine})}] };
    });
    
    registerAppResource(server, resourceUri, resourceUri, { mimeType: RESOURCE_MIME_TYPE }, async () => {
        const html = await fs.readFile(path.join(DIST_DIR, 'mcp-app.html'), 'utf-8');
        return {
            contents: [
                { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }
            ],
        };
    },);
    return server;
}