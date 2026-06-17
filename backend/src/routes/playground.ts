import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { getLLMKey } from "./settings";

const router = Router();

// Model ID → provider mapping
const MODEL_PROVIDERS: Record<string, { provider: string; apiModel: string }> = {
  // Anthropic
  "claude-opus-4":     { provider: "anthropic", apiModel: "claude-opus-4-7" },
  "claude-sonnet-4":   { provider: "anthropic", apiModel: "claude-sonnet-4-6" },
  "claude-haiku-3.5":  { provider: "anthropic", apiModel: "claude-haiku-4-5-20251001" },
  // OpenAI
  "gpt-4o":            { provider: "openai", apiModel: "gpt-4o" },
  "gpt-4o-mini":       { provider: "openai", apiModel: "gpt-4o-mini" },
  "o3":                { provider: "openai", apiModel: "o3" },
  "o4-mini":           { provider: "openai", apiModel: "o4-mini" },
  // Google
  "gemini-2.5-pro":    { provider: "google", apiModel: "gemini-2.5-pro" },
  "gemini-2.5-flash":  { provider: "google", apiModel: "gemini-2.5-flash" },
  // xAI
  "grok-3":            { provider: "xai", apiModel: "grok-3" },
  "grok-4":            { provider: "xai", apiModel: "grok-4" },
};

// Available models grouped for the frontend
const MODEL_GROUPS = [
  {
    provider: "Anthropic",
    providerId: "anthropic",
    color: "orange",
    models: [
      { id: "claude-opus-4", name: "Claude Opus 4.7" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4.6" },
      { id: "claude-haiku-3.5", name: "Claude Haiku 4.5" },
    ],
  },
  {
    provider: "OpenAI",
    providerId: "openai",
    color: "green",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o mini" },
      { id: "o3", name: "o3" },
      { id: "o4-mini", name: "o4-mini" },
    ],
  },
  {
    provider: "Google",
    providerId: "google",
    color: "blue",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ],
  },
  {
    provider: "xAI",
    providerId: "xai",
    color: "zinc",
    models: [
      { id: "grok-3", name: "Grok 3" },
      { id: "grok-4", name: "Grok 4" },
    ],
  },
];

// GET /api/playground/models — available models + which providers have keys
router.get("/models", requireAuth, async (_req: Request, res: Response) => {
  try {
    const groups = await Promise.all(
      MODEL_GROUPS.map(async (g) => {
        const key = await getLLMKey(g.providerId);
        return { ...g, hasKey: !!key };
      })
    );
    return res.json(groups);
  } catch (err) {
    console.error("GET /api/playground/models error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/playground/run — execute a prompt against an LLM (streaming)
router.post("/run", requireAuth, async (req: Request, res: Response) => {
  try {
    const { model, prompt, systemPrompt, variables, maxTokens = 4096, temperature = 0.7 } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({ error: "model and prompt are required" });
    }

    const modelConfig = MODEL_PROVIDERS[model];
    if (!modelConfig) {
      return res.status(400).json({ error: `Unknown model: ${model}` });
    }

    const apiKey = await getLLMKey(modelConfig.provider);
    if (!apiKey) {
      return res.status(400).json({ error: `No API key configured for ${modelConfig.provider}. Add one in Settings.` });
    }

    // Interpolate variables into prompt
    let finalPrompt = prompt;
    if (variables && typeof variables === "object") {
      for (const [key, value] of Object.entries(variables)) {
        finalPrompt = finalPrompt.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), String(value));
      }
    }

    // Set up SSE streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const startTime = Date.now();

    if (modelConfig.provider === "anthropic") {
      await streamAnthropic(res, apiKey, modelConfig.apiModel, finalPrompt, systemPrompt, maxTokens, temperature, startTime);
    } else if (modelConfig.provider === "openai" || modelConfig.provider === "xai") {
      const baseUrl = modelConfig.provider === "xai" ? "https://api.x.ai/v1" : "https://api.openai.com/v1";
      await streamOpenAI(res, apiKey, modelConfig.apiModel, finalPrompt, systemPrompt, maxTokens, temperature, startTime, baseUrl);
    } else if (modelConfig.provider === "google") {
      await streamGoogle(res, apiKey, modelConfig.apiModel, finalPrompt, systemPrompt, maxTokens, temperature, startTime);
    }
  } catch (err) {
    console.error("POST /api/playground/run error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Internal server error" });
    }
    res.write(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`);
    res.end();
  }
});

async function streamAnthropic(
  res: Response, apiKey: string, model: string, prompt: string,
  systemPrompt: string | undefined, maxTokens: number, temperature: number, startTime: number
) {
  const body: any = {
    model,
    max_tokens: maxTokens,
    temperature,
    stream: true,
    messages: [{ role: "user", content: prompt }],
  };
  if (systemPrompt) body.system = systemPrompt;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    res.write(`data: ${JSON.stringify({ type: "error", error: `Anthropic API error: ${response.status} ${err}` })}\n\n`);
    res.end();
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

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
        if (event.type === "content_block_delta" && event.delta?.text) {
          res.write(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`);
        } else if (event.type === "message_start" && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        } else if (event.type === "message_delta" && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
      } catch { /* skip malformed events */ }
    }
  }

  const latency = Date.now() - startTime;
  res.write(`data: ${JSON.stringify({
    type: "done",
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    latencyMs: latency,
  })}\n\n`);
  res.end();
}

async function streamOpenAI(
  res: Response, apiKey: string, model: string, prompt: string,
  systemPrompt: string | undefined, maxTokens: number, temperature: number, startTime: number,
  baseUrl: string
) {
  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const body: any = {
    model,
    messages,
    max_completion_tokens: maxTokens,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    res.write(`data: ${JSON.stringify({ type: "error", error: `API error: ${response.status} ${err}` })}\n\n`);
    res.end();
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

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
        const delta = event.choices?.[0]?.delta?.content;
        if (delta) {
          res.write(`data: ${JSON.stringify({ type: "text", text: delta })}\n\n`);
        }
        if (event.usage) {
          inputTokens = event.usage.prompt_tokens || 0;
          outputTokens = event.usage.completion_tokens || 0;
        }
      } catch { /* skip malformed events */ }
    }
  }

  const latency = Date.now() - startTime;
  res.write(`data: ${JSON.stringify({
    type: "done",
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    latencyMs: latency,
  })}\n\n`);
  res.end();
}

async function streamGoogle(
  res: Response, apiKey: string, model: string, prompt: string,
  systemPrompt: string | undefined, maxTokens: number, temperature: number, startTime: number
) {
  const contents: any[] = [{ role: "user", parts: [{ text: prompt }] }];
  const body: any = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    res.write(`data: ${JSON.stringify({ type: "error", error: `Google API error: ${response.status} ${err}` })}\n\n`);
    res.end();
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);

      try {
        const event = JSON.parse(data);
        const text = event.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
        }
        if (event.usageMetadata) {
          inputTokens = event.usageMetadata.promptTokenCount || 0;
          outputTokens = event.usageMetadata.candidatesTokenCount || 0;
        }
      } catch { /* skip malformed events */ }
    }
  }

  const latency = Date.now() - startTime;
  res.write(`data: ${JSON.stringify({
    type: "done",
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    latencyMs: latency,
  })}\n\n`);
  res.end();
}

export default router;
