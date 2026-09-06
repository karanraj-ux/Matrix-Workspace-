import { GoogleGenAI, Type } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const res = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: "hello",
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.OBJECT, properties: { msg: { type: Type.STRING } } }
      }
    });
    console.log("Success:", res.text);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
