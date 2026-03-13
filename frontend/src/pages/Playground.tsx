import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, playgroundApi, type PlaygroundModelGroup } from "../api";
import { useToast } from "../components/Toast";

// Detect {{variable}} patterns in prompt text
function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{\s*(\w+)\s*\}\}/g) || [];
  return [...new Set(matches.map((m) => m.replace(/[{}]/g, "").trim()))];
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

const PROVIDER_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  orange: { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", ring: "ring-orange-200 dark:ring-orange-800" },
  green:  { bg: "bg-green-50 dark:bg-green-950/40",   text: "text-green-700 dark:text-green-400",   ring: "ring-green-200 dark:ring-green-800" },
  blue:   { bg: "bg-blue-50 dark:bg-blue-950/40",     text: "text-blue-700 dark:text-blue-400",     ring: "ring-blue-200 dark:ring-blue-800" },
  zinc:   { bg: "bg-zinc-100 dark:bg-zinc-800",       text: "text-zinc-700 dark:text-zinc-300",     ring: "ring-zinc-200 dark:ring-zinc-700" },
};

interface RunStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export default function Playground() {
  const [searchParams] = useSearchParams();
  const promptId = searchParams.get("prompt");

  const [promptText, setPromptText] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);
  const [showSystem, setShowSystem] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load prompt if ID provided
  const { data: loadedPrompt } = useQuery({
    queryKey: ["prompt", promptId],
    queryFn: () => api.getPrompt(promptId!),
    enabled: !!promptId,
  });

  // Load available models
  const { data: modelGroups = [] } = useQuery({
    queryKey: ["playground-models"],
    queryFn: () => playgroundApi.getModels(),
  });

  // Set prompt text when loaded
  useEffect(() => {
    if (loadedPrompt) {
      setPromptText(loadedPrompt.content);
      if (loadedPrompt.promptType === "system") {
        setSystemPrompt(loadedPrompt.content);
        setPromptText("");
        setShowSystem(true);
      }
    }
  }, [loadedPrompt]);

  // Auto-select first available model
  useEffect(() => {
    if (!selectedModel && modelGroups.length > 0) {
      const available = modelGroups.find((g: PlaygroundModelGroup) => g.hasKey);
      if (available && available.models.length > 0) {
        setSelectedModel(available.models[0].id);
      }
    }
  }, [modelGroups, selectedModel]);

  // Extract variables from prompt text
  const detectedVars = extractVariables(promptText + " " + systemPrompt);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current && isRunning) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, isRunning]);

  const handleRun = useCallback(async () => {
    if (!selectedModel) {
      setError("Select a model first");
      return;
    }
    if (!promptText.trim() && !systemPrompt.trim()) {
      setError("Enter a prompt");
      return;
    }

    setIsRunning(true);
    setOutput("");
    setError(null);
    setStats(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/playground/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          prompt: promptText,
          systemPrompt: systemPrompt || undefined,
          variables: Object.keys(variables).length > 0 ? variables : undefined,
          maxTokens,
          temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

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
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              setOutput((prev) => prev + event.text);
            } else if (event.type === "error") {
              setError(event.error);
            } else if (event.type === "done") {
              setStats(event.usage ? { ...event.usage, latencyMs: event.latencyMs } : null);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "Failed to run prompt");
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [selectedModel, promptText, systemPrompt, variables, maxTokens, temperature]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
  };

  const handleCopyOutput = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    toast("Output copied");
    setTimeout(() => setCopied(false), 1800);
  };

  // Keyboard shortcut: Ctrl+Enter to run
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isRunning) {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRun, isRunning]);

  const selectedModelInfo = modelGroups
    .flatMap((g: PlaygroundModelGroup) => g.models.map((m) => ({ ...m, provider: g.provider, color: g.color, hasKey: g.hasKey })))
    .find((m) => m.id === selectedModel);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-serif font-semibold text-zinc-900 dark:text-zinc-100">
            Playground
          </h1>
          {loadedPrompt && (
            <Link
              to={`/prompts/${loadedPrompt.id}`}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              {loadedPrompt.title}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`btn-ghost h-8 px-3 text-xs ${showSettings ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
          >
            Settings
          </button>
          {isRunning ? (
            <button onClick={handleStop} className="btn-ghost h-8 px-3 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">
              <StopIcon />
              Stop
            </button>
          ) : (
            <button onClick={handleRun} className="btn-primary h-8 px-3 text-xs">
              <PlayIcon />
              Run
              <kbd className="ml-1.5 text-[9px] opacity-60 font-mono">Ctrl+Enter</kbd>
            </button>
          )}
        </div>
      </div>

      {/* Model selector */}
      <div className="flex flex-wrap gap-1.5">
        {modelGroups.map((group: PlaygroundModelGroup) => (
          group.models.map((m) => {
            const colors = PROVIDER_COLORS[group.color] || PROVIDER_COLORS.zinc;
            const isSelected = selectedModel === m.id;
            const disabled = !group.hasKey;
            return (
              <button
                key={m.id}
                onClick={() => !disabled && setSelectedModel(m.id)}
                disabled={disabled}
                title={disabled ? `No ${group.provider} API key — add one in Settings` : m.name}
                className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all
                  ${isSelected
                    ? `${colors.bg} ${colors.text} ring-2 ${colors.ring} shadow-sm`
                    : disabled
                      ? "bg-zinc-50 dark:bg-zinc-900 text-zinc-300 dark:text-zinc-700 cursor-not-allowed"
                      : "bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
              >
                {m.name}
              </button>
            );
          })
        ))}
        {modelGroups.length > 0 && !modelGroups.some((g: PlaygroundModelGroup) => g.hasKey) && (
          <Link to="/settings" className="text-[11px] text-primary-500 hover:underline self-center ml-1">
            Add API keys in Settings
          </Link>
        )}
      </div>

      {/* Settings panel (collapsible) */}
      {showSettings && (
        <div className="flex items-center gap-6 px-4 py-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Max tokens</label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Math.max(1, Math.min(32768, Number(e.target.value))))}
              className="input-base w-24 text-xs py-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Temperature</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-28 accent-primary-500"
            />
            <span className="text-[11px] tabular-nums text-zinc-500 w-6">{temperature}</span>
          </div>
        </div>
      )}

      {/* Variable fields */}
      {detectedVars.length > 0 && (
        <div className="flex flex-wrap gap-3 px-4 py-3 rounded-xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20">
          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 self-center">Variables:</span>
          {detectedVars.map((v) => (
            <div key={v} className="flex items-center gap-1.5">
              <code className="text-[11px] font-mono text-amber-700 dark:text-amber-400">{`{{${v}}}`}</code>
              <input
                type="text"
                value={variables[v] || ""}
                onChange={(e) => setVariables((prev) => ({ ...prev, [v]: e.target.value }))}
                placeholder={v}
                className="input-base text-xs py-1 w-36"
              />
            </div>
          ))}
        </div>
      )}

      {/* Split pane: Prompt (left) + Output (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: "480px" }}>
        {/* Left: Prompt input */}
        <div className="flex flex-col rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 overflow-hidden">
          {/* System prompt toggle */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/60">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Prompt</span>
              <button
                onClick={() => setShowSystem(!showSystem)}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors
                  ${showSystem
                    ? "bg-primary-100 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400"
                    : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
                  }`}
              >
                System {showSystem ? "ON" : "OFF"}
              </button>
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums">
              {promptText.split(/\s+/).filter(Boolean).length} words
            </span>
          </div>

          {/* System prompt area */}
          {showSystem && (
            <div className="border-b border-zinc-100 dark:border-zinc-800/60">
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="System prompt (optional)..."
                className="w-full px-3 py-2.5 bg-primary-50/50 dark:bg-primary-950/10 text-sm font-mono text-zinc-700 dark:text-zinc-300
                           placeholder:text-zinc-400 dark:placeholder:text-zinc-600 resize-none outline-none"
                rows={3}
              />
            </div>
          )}

          {/* Main prompt textarea */}
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Enter your prompt here..."
            className="flex-1 w-full px-3 py-3 bg-transparent text-sm font-mono text-zinc-700 dark:text-zinc-300
                       placeholder:text-zinc-400 dark:placeholder:text-zinc-600 resize-none outline-none leading-relaxed"
          />
        </div>

        {/* Right: Output */}
        <div className="flex flex-col rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/60">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Output</span>
              {isRunning && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">streaming</span>
                </span>
              )}
              {selectedModelInfo && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${PROVIDER_COLORS[selectedModelInfo.color]?.bg || ""} ${PROVIDER_COLORS[selectedModelInfo.color]?.text || ""}`}>
                  {selectedModelInfo.name}
                </span>
              )}
            </div>
            {output && (
              <button
                onClick={handleCopyOutput}
                className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
                title="Copy output"
              >
                <CopyIcon />
              </button>
            )}
          </div>

          <div
            ref={outputRef}
            className="flex-1 overflow-y-auto px-3 py-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words"
          >
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2 text-xs text-red-600 dark:text-red-400 mb-3">
                {error}
              </div>
            )}
            {output || (!isRunning && !error && (
              <span className="text-zinc-400 dark:text-zinc-600 italic">
                Output will appear here...
              </span>
            ))}
          </div>

          {/* Stats bar */}
          {stats && (
            <div className="flex items-center gap-4 px-3 py-2 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-800/30">
              <span className="text-[10px] text-zinc-500 dark:text-zinc-500 tabular-nums">
                {stats.inputTokens.toLocaleString()} in / {stats.outputTokens.toLocaleString()} out
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">|</span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-500 tabular-nums">
                {stats.totalTokens.toLocaleString()} total tokens
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">|</span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-500 tabular-nums">
                {(stats.latencyMs / 1000).toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
