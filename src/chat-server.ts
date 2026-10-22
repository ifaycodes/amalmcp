import express from "express";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleUtterance } from "./llmmain.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));
app.use(express.static("public"));

app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/api/household", async (_req, res) => {
    try {
        if (existsSync("housedata.json")) {
            const data = await fs.readFile("housedata.json", "utf-8");
            return res.json(JSON.parse(data));
        }
        res.status(404).json({ error: "No household profile found" });
    } catch (e) {
        res.status(500).json({ error: "Failed to read household profile" });
    }
});

app.post("/api/household", async (req, res) => {
    try {
        await fs.writeFile("housedata.json", JSON.stringify(req.body, null, 2), "utf-8");
        res.json({ success: true, household: req.body });
    } catch (e) {
        res.status(500).json({ error: "Failed to save household profile" });
    }
});

app.post("/api/chat", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    const write = (event: object) => { 
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        (res as any).flush?.();
    }

    try {
        for await (const event of handleUtterance(req.body.text)) {
            write(event);
        }
    } catch (error: any) {
        console.error("Chat error:", error);
        write({ type: 'chunk', text: "Sorry, something went wrong. Let's try again. " + error.message });
        write({ type: 'done', question: null });
    }
    res.end();
});

const PORT = process.env.CHAT_PORT || 4040;
app.listen(PORT, () => console.log(`Open http://localhost:${PORT}`));