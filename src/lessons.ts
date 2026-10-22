import fs from 'node:fs';
import { z } from 'zod';
import { askLlmJson, askLlmText } from './llmgenerator.ts';

const Draft = z.object({
    sections: z.array(z.string()).min(1, "At least one section is required"),
    quiz: z.array(z.object({
        question: z.string(),
        options: z.array(z.string()).min(2),
        answer: z.string(),
        hint: z.string(),
    })).min(1),
});

type Lesson = z.infer<typeof Draft> & {
    id: number; childname: string; topic: string; results: Record<number, boolean>; wrongAnswers: Record<number, number>;
};

const lessons = new Map<number, Lesson>();
let nextLessonId = 1;

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

export async function callingLlmforLesson(topic: string, childname: string): Promise<Lesson> {
    let draft: z.infer<typeof Draft>
    try {
        const raw = await askLlmJson(`Write a short digestible lesson for a child about "${topic}".
            Return JSON: {"sections": [4 short strings], "quiz": [4 x {"question","options":[3 strings],"answer":<exact text of one option>,"hint"}]}.
            Use only well-established facts. Plain words, no markdown.`, childname)

        draft = Draft.parse(raw);
        if (draft.quiz.some(q => !q.options.includes(q.answer))) {
            throw new Error("Answer must be one of the options");
        }
    } catch {
        draft = CACHED_LESSON;
    }
    const lesson: Lesson = {
        ...draft, childname, id: nextLessonId++, topic, results: {}, wrongAnswers: {}
    };
    lessons.set(lesson.id, lesson);
    return lesson;
}

export async function llmExplainConcept(concept: string, childname: string): Promise<string> {
    try {
        const explanation = await askLlmText(`Explain the concept "${concept}"  to ${childname} in 2-3 short sentences, using everyday examples and simple terms. 
            Use plain words, no markdown.`, childname);
        return explanation;
    } catch {
        return `Let's look at the concept "${concept}" together again, slowly.`;
    }
}

export async function getNextQuestion(id: number, questionIndex: number) {
    const q = lessons.get(id)?.quiz[questionIndex];
    if (!q) {
        throw new Error("Question not found");
    }
    return { question: q.question, options: q.options.map((o, k) => `${"ABCDE"[k]}. ${o}`), number: questionIndex + 1, total: lessons.get(id)!.quiz.length, hint: q.hint };
}

function matchOption(raw: string, options: string[]): number | null {
    const normalizedRaw = normalize(raw);
    const words = normalizedRaw.split(' ').filter(w => !['option','letter','answer','the','it', 'its', 'is', 'i', 'think'].includes(w));
    if (words.length === 1 && /^[a-e]$/.test(words[0])) {
        const index = words[0].charCodeAt(0) - 97; 
        if (index < options.length) return index;
    }
    const hits = options.map(normalize).map((o, k) => (normalizedRaw === o || normalizedRaw.includes(o)) ? k : -1).filter(k => k >= 0);
    return hits.length === 1 ? hits[0] : null;
}

export function checkAnswer(id: number, questionIndex: number, answer: string) {
    const lesson = lessons.get(id);
    const question = lesson?.quiz[questionIndex];
    if (!lesson || !question) {
        throw new Error("Lesson or question not found");
    }

    const matchedIndex = matchOption(answer, question.options);
    if (matchedIndex === null) return { result: 'unclear', feedback: "I didn't catch that. Let's try once more.", nextIndex: questionIndex};

    const isCorrect = question.options[matchedIndex] === question.answer;
    if (!isCorrect && (lesson.wrongAnswers[questionIndex] = (lesson.wrongAnswers[questionIndex] ?? 0) + 1) < 2) {
        return { result: 'wrong', feedback: "Good try! That was close. Let's try again.", hint: question.hint, nextIndex: questionIndex };
    }
    lesson.results[questionIndex] = isCorrect;

    const finished = Object.keys(lesson.results).length === lesson.quiz.length;
    if (finished) saveProgress(lesson);
    return {
        result: isCorrect ? 'correct' : 'incorrect',
        feedback: isCorrect ? "Correct!" : `The answer is ${question.answer}.`,
        nextIndex: finished ? null : questionIndex + 1, finished
    };
}

function saveProgress(lesson: Lesson) {
    const file = 'progress.json';
    const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : [];
    all.push({ childname: lesson.childname, topic: lesson.topic, score: Object.values(lesson.results).filter(Boolean).length, total: lesson.quiz.length, date: new Date().toISOString() });
    fs.writeFileSync(file, JSON.stringify(all, null, 2));
}

const CACHED_LESSON = {
  sections: [
    "Plants are living things. They grow from seeds and need water and sunlight.",
    "Roots hold the plant in the soil and drink water.",
    "Leaves catch sunlight and use it to make food for the plant.",
    "Flowers make seeds, and seeds can grow into new plants.",
  ],
  quiz: [
    { question: "What do roots do?", options: ["Drink water", "Make flowers", "Catch sunlight"], answer: "Drink water", hint: "Think about what a plant needs from the soil." },
    { question: "Which part catches sunlight?", options: ["Roots", "Leaves", "Seeds"], answer: "Leaves", hint: "They are usually green and flat." },
    { question: "What can grow into a new plant?", options: ["A seed", "A rock", "A cloud"], answer: "A seed", hint: "It comes from the flower." },
    { question: "What do plants need to grow?", options: ["Water and sunlight", "Only music", "Only sand"], answer: "Water and sunlight", hint: "Think about a garden on a sunny day." },
  ],
};