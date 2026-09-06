import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
const PORT = 3000;

let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

const WidgetSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING, description: "A unique lowercase id for the widget" },
    title: { type: Type.STRING, description: "Title of the widget/app" },
    description: { type: Type.STRING, description: "Short subtitle or description" },
    themeColor: { type: Type.STRING, description: "A Tailwind color name, e.g., 'blue', 'emerald', 'rose', 'indigo'" },
    modules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING, enum: ['metric', 'list', 'note', 'action'] },
          title: { type: Type.STRING },
          content: { type: Type.STRING }, 
          items: { type: Type.ARRAY, items: { type: Type.STRING } }, 
          value: { type: Type.STRING }
        },
        required: ["id", "type", "title"]
      }
    }
  },
  required: ['id', 'title', 'themeColor', 'modules']
};

app.post("/api/chat", async (req, res) => {
  try {
    const { message, contextItems } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not set on the server." });
    }

    let contextString = "No additional context provided.";
    if (contextItems && contextItems.length > 0) {
      contextString = contextItems.map((item: any) => {
        let text = `[Document Name: ${item.name}]\n[Type: ${item.type}]\n`;
        if (item.type === 'email') {
          text += `[From: ${item.from}]\n[Snippet: ${item.snippet}]\n`;
        }
        return text;
      }).join("\n---\n");
    }

    const systemInstruction = `You are a Precision Workspace AI. You must synthesize your answers ONLY based on the provided staged documents. If the user's question cannot be answered using the staged documents, you must state that the context is insufficient. Do not hallucinate or use outside knowledge to answer questions about the documents.

STAGED DOCUMENTS:
${contextString}`;

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: systemInstruction }] },
        { role: 'model', parts: [{ text: "Understood. I will strictly use the provided documents." }] },
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        temperature: 0.2
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Error in chat:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
