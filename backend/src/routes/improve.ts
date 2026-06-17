import { Router, Request, Response } from "express";
import { db } from "../db";
import { prompts } from "../db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { getLLMKey } from "./settings";
import { classifyPrompt, analyzeStructure } from "../classifier";

const router = Router();

// Preferred model order for improvement
const IMPROVE_MODELS = [
  { provider: "anthropic", model: "claude-sonnet-4-6", apiType: "anthropic" },
  { provider: "openai",    model: "gpt-4o",                   apiType: "openai" },
  { provider: "google",    model: "gemini-2.5-flash", apiType: "google" },
  { provider: "xai",       model: "grok-3",                   apiType: "openai", baseUrl: "https://api.x.ai/v1" },
];

function buildImprovementPrompt(
  original: string,
  title: string,
  classification: { type: string; confidence: number; reason: string },
  structure: { sections: { name: string; detected: boolean }[]; score: number; total: number; suggestions: string[] }
): string {
  const missingSections = structure.sections.filter((s) => !s.detected).map((s) => s.name);
  const suggestions = structure.suggestions;

  return `You are a prompt engineering expert. Your task is to improve the following prompt while preserving its original intent and meaning.

## Original Prompt
Title: ${title}
Detected Type: ${classification.type} (${Math.round(classification.confidence * 100)}% confidence)
Structure Score: ${structure.score}/${structure.total}

---
${original}
---

## Issues Found
${missingSections.length > 0 ? `Missing sections: ${missingSections.join(", ")}` : "All sections present."}

## Suggestions to Apply
${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Instructions
1. Rewrite the prompt incorporating ALL the suggestions above
2. Add any missing structural sections (${missingSections.join(", ")}) where appropriate
3. Keep the original intent and core content intact
4. Make the prompt clear, well-structured, and effective
5. Use markdown formatting where it helps readability
6. Do NOT add explanations or meta-commentary — output ONLY the improved prompt text`;
}

// POST /api/prompts/:id/improve — improve a prompt using AI
router.post("/:id/improve", requireAuth, async (req: Request, res: Response) => {
  try {
    const row = await db.select().from(prompts).where(eq(prompts.id, req.params.id)).limit(1);
    if (!row.length) return res.status(404).json({ error: "Prompt not found" });

    const prompt = row[0];
    const classification = classifyPrompt(prompt.title, prompt.content);
    const structure = analyzeStructure(prompt.content);

    if (structure.score === structure.total && structure.suggestions.length === 0) {
      return res.status(400).json({ error: "This prompt already has a perfect structure score with no suggestions." });
    }

    // Find a provider with a key
    let apiKey: string | null = null;
    let selectedModel = IMPROVE_MODELS[0];
    for (const m of IMPROVE_MODELS) {
      apiKey = await getLLMKey(m.provider);
      if (apiKey) {
        selectedModel = m;
        break;
      }
    }
    if (!apiKey) {
      return res.status(400).json({ error: "No LLM API key configured. Add one in Settings to use AI improvement." });
    }

    const improvementPrompt = buildImprovementPrompt(prompt.content, prompt.title, classification, structure);

    // Stream the response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    if (selectedModel.apiType === "anthropic") {
      await streamAnthropic(res, apiKey, selectedModel.model, improvementPrompt);
    } else if (selectedModel.apiType === "openai") {
      const baseUrl = selectedModel.baseUrl || "https://api.openai.com/v1";
      await streamOpenAI(res, apiKey, selectedModel.model, improvementPrompt, baseUrl);
    } else if (selectedModel.apiType === "google") {
      await streamGoogle(res, apiKey, selectedModel.model, improvementPrompt);
    }
  } catch (err) {
    console.error("POST /api/prompts/:id/improve error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal server error" });
    }
    res.write(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`);
    res.end();
  }
});

async function streamAnthropic(res: Response, apiKey: string, model: string, prompt: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      temperature: 0.3,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    res.write(`data: ${JSON.stringify({ type: "error", error: `Anthropic API error: ${response.status}` })}\n\n`);
    res.end();
    return;
  }

  await processSSEStream(res, response, "anthropic");
}

async function streamOpenAI(res: Response, apiKey: string, model: string, prompt: string, baseUrl: string) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 8192,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!response.ok) {
    res.write(`data: ${JSON.stringify({ type: "error", error: `API error: ${response.status}` })}\n\n`);
    res.end();
    return;
  }

  await processSSEStream(res, response, "openai");
}

async function streamGoogle(res: Response, apiKey: string, model: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
    }),
  });

  if (!response.ok) {
    res.write(`data: ${JSON.stringify({ type: "error", error: `Google API error: ${response.status}` })}\n\n`);
    res.end();
    return;
  }

  await processSSEStream(res, response, "google");
}

async function processSSEStream(res: Response, response: globalThis.Response, provider: string) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const event = JSON.parse(data);
        let text = "";

        if (provider === "anthropic") {
          text = event.delta?.text || "";
        } else if (provider === "openai") {
          text = event.choices?.[0]?.delta?.content || "";
        } else if (provider === "google") {
          text = event.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }

        if (text) {
          res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
        }
      } catch { /* skip */ }
    }
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.end();
}

export default router;
