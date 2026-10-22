# TutorTots MCP 🎓

An interactive, personalized AI tutoring platform for children powered by the **Model Context Protocol (MCP)**. TutorTots generates bite-sized, curriculum- and interest-aligned lessons, delivers interactive quizzes, explains complex concepts in kid-friendly terms, and tracks learner progress.

---

## 🌟 Features

- **Personalized Lessons (`generate_lesson`)**: Customizes lessons based on the child's age, grade level, and personal interests (e.g., cars, animals, football).
- **Kid-Friendly Explanations (`explain_concept`)**: Clarifies tricky words and concepts using everyday analogies without overwhelming vocabulary.
- **Interactive Quizzing (`get_next_question`, `check_answer`)**: Delivers sequential multi-choice questions with hints and evaluates responses.
- **Progress Tracking (`get_progress`)**: Keeps track of scores and learning sessions locally in `progress.json`.
- **Dual Interfaces**:
  - Direct integration into MCP-compatible AI assistants (Claude Desktop, Cursor, etc.).
  - A dedicated local voice/chat web interface with streaming responses.

---

## 💻 Local Setup & Development

Follow these steps to run TutorTots locally on your machine.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` (bundled with Node.js)
- An API key for your LLM provider of choice (e.g. [Nebius](https://tokenfactory.nebius.com/), [OpenAI](https://platform.openai.com/), Groq, Together, etc.)

---

### Step 1: Install Dependencies

In your project root directory, install all required packages:

```bash
npm install
```

---

### Step 2: Configure Environment Variables

Create a `.env` file in the root directory and add your LLM API key:

```env
# Required: API key for your LLM provider
NEBIUS_API_KEY="your-api-key-here"

# Optional port overrides (defaults: MCP on 3001, Chat UI on 4040)
PORT=3001
CHAT_PORT=4040
```

---

### Step 3: Configure Your LLM of Choice

You can use any LLM or model of your choice by updating the model name (and optionally `baseURL` or API key variable) in two files:

1. **`src/llmgenerator.ts`** (handles lesson creation, concept explanations, and quiz questions):
   ```typescript
   // Update baseURL if using OpenAI, Groq, etc.
   const ai = new OpenAI({ 
       baseURL: 'https://api.tokenfactory.nebius.com/v1/',
       apiKey: process.env.LLM_API_KEY 
   });

   // Change to your desired model name (e.g., 'gpt-4o-mini', 'llama-3.3-70b-instruct', etc.)
   const MODEL = 'model name';
   ```

2. **`src/llmmain.ts`** (handles the chat agent loop and tool execution):
   ```typescript
   // Update baseURL if using another provider
   const ai = new OpenAI({ 
       baseURL: 'https://api.tokenfactory.nebius.com/v1/',
       apiKey: process.env.LLM_API_KEY,
   });

   // In handleUtterance(): change to your desired model name
   const stream = await withRetry(() => ai.chat.completions.create({
       model: 'model',
       messages,
       tools: toolDeclarations,
       stream: true
   }));
   ```

---

### Step 4: Configure Household Profile (`housedata.json`)

The server uses `housedata.json` to personalize learning content for each child (their age, grade, interests, and house rules). Adjust `housedata.json` to fit your needs.

---

### Step 5: Run the Application

The system consists of two services: the **MCP Server** and the **Chat Web App**. You will need two terminal windows:

#### Terminal 1: Start the MCP Server
Run this **first**:
```bash
npm run maints
```
- Starts the Streamable HTTP MCP server on **`http://localhost:3001/mcp`**.
- To run via stdio mode instead: `npx tsx src/main.ts --stdio`

#### Terminal 2: Start the Web Chat Interface
```bash
npm run chatserver
```
- Starts the web chat and household management server.
- Open your browser at **`http://localhost:4040`**.

---

## 🛠️ MCP Tools Overview

When connected as an MCP tool provider, the following tools are exposed:

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `generate_lesson` | `topic` *(string)*, `childname` *(string)* | Generates a structured multi-part lesson adapted to the child's age and interests. |
| `explain_concept` | `concept` *(string)*, `childname` *(string)* | Explains a complex or confusing idea in simple, child-friendly sentences. |
| `get_next_question` | `lessonid` *(number)*, `questionIndex` *(number)* | Retrieves a single multiple-choice question for the active lesson. |
| `check_answer` | `lessonid` *(number)*, `questionIndex` *(number)*, `answer` *(string)* | Validates the child's answer and records correctness. |
| `get_progress` | `childname` *(string)* | Returns recorded quiz scores and session history for the specified child. |

---

## 📁 Project Structure

```
├── src/
│   ├── main.ts           # MCP server entry point (Streamable HTTP & stdio modes)
│   ├── server.ts         # MCP tool definitions and registrations
│   ├── lessons.ts        # Lesson generation, question logic, and validation
│   ├── llmgenerator.ts   # LLM client and system prompt builders
│   ├── llmmain.ts        # MCP client connection, conversational coordinator & LLM loop
│   ├── chat-server.ts    # Express web server with SSE chat stream and API endpoints
│   └── public/
│       └── index.html    # Interactive Web/Voice UI for kids and parents
├── housedata.json        # Household configuration (children profiles, interests, rules)
├── progress.json         # Persisted progress and quiz records
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

---

## 📜 License

This project is licensed under the [ISC License](LICENSE).
