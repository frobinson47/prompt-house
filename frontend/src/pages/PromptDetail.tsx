import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Prism from "prismjs";
import "prismjs/themes/prism.css";
import { api, folderApi } from "../api";
import { useToast } from "../components/Toast";
import TemplatePanel from "../components/TemplatePanel";

const STATUS_CONFIG: Record<string, { className: string; dot: string; label: string }> = {
  active:     { className: "status-active",     dot: "bg-emerald-500", label: "Active"      },
  draft:      { className: "status-draft",       dot: "bg-amber-500",   label: "Draft"       },
  archived:   { className: "status-archived",    dot: "bg-zinc-400",    label: "Archived"    },
  deprecated: { className: "status-deprecated",  dot: "bg-red-500",     label: "Deprecated"  },
};

function getModelColor(model: string): { bg: string; text: string } {
  const m = model.toLowerCase();
  if (m.includes("claude") || m.includes("anthropic"))
    return { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400" };
  if (m.includes("gpt") || m.includes("openai") || m.startsWith("o3") || m.startsWith("o4"))
    return { bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400" };
  if (m.includes("gemini") || m.includes("google"))
    return { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400" };
  if (m.includes("grok") || m.includes("xai"))
    return { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-700 dark:text-zinc-300" };
  if (m.includes("llama") || m.includes("meta"))
    return { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-400" };
  return { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400" };
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export default function PromptDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [improvedText, setImprovedText] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const [showImproved, setShowImproved] = useState(false);
  const improveAbortRef = useRef<AbortController | null>(null);

  const { data: prompt, isLoading, isError } = useQuery({
    queryKey: ["prompt", id],
    queryFn: () => api.getPrompt(id!),
    enabled: !!id,
  });

  const { data: analysis } = useQuery({
    queryKey: ["prompt-analysis", id],
    queryFn: () => api.analyzePrompt(id!),
    enabled: !!id && showAnalysis,
  });

  const { data: versions } = useQuery({
    queryKey: ["prompt-versions", id],
    queryFn: () => api.getVersions(id!),
    enabled: !!id && showVersions,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: () => folderApi.list(),
  });

  const moveMutation = useMutation({
    mutationFn: (folderId: string) => folderApi.movePrompts(folderId, [id!]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      setShowFolderMenu(false);
      toast("Moved to folder");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (version: number) => api.restoreVersion(id!, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt", id] });
      queryClient.invalidateQueries({ queryKey: ["prompt-versions", id] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      toast("Version restored");
      setSelectedVersion(null);
    },
  });

  
  const handleImprove = async () => {
    setIsImproving(true);
    setImprovedText("");
    setShowImproved(true);
    const controller = new AbortController();
    improveAbortRef.current = controller;

    try {
      const response = await fetch(`/api/prompts/${id}/improve`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Failed" }));
        toast(err.error || "Improvement failed", "info");
        setIsImproving(false);
        return;
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
            if (event.type === "text") setImprovedText((prev) => prev + event.text);
            if (event.type === "error") toast(event.error, "info");
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") toast("Improvement failed", "info");
    } finally {
      setIsImproving(false);
      improveAbortRef.current = null;
    }
  };

  const handleAcceptImprovement = async () => {
    try {
      await api.updatePrompt(id!, { content: improvedText });
      queryClient.invalidateQueries({ queryKey: ["prompt", id] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      queryClient.invalidateQueries({ queryKey: ["prompt-analysis", id] });
      setShowImproved(false);
      setImprovedText("");
      toast("Prompt improved and saved");
    } catch {
      toast("Failed to save improvement", "info");
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => api.deletePrompt(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      navigate("/prompts");
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: () => api.toggleFavorite(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt", id] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: () => api.duplicatePrompt(id!),
    onSuccess: (newPrompt) => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      navigate(`/prompts/${newPrompt.id}/edit`);
    },
  });

  useEffect(() => {
    if (prompt) Prism.highlightAll();
  }, [prompt]);

  const handleCopy = async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt.content);
    setCopied(true);
    toast("Copied to clipboard");
    setTimeout(() => setCopied(false), 1800);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 animate-pulse" aria-busy="true" aria-label="Loading prompt">
        <div className="skeleton h-4 w-32 rounded" />
        <div className="card p-6 space-y-4">
          <div className="flex gap-3">
            <div className="skeleton h-8 w-2/3 rounded-lg" />
            <div className="skeleton h-7 w-20 rounded-full ml-auto" />
          </div>
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="flex gap-2">
            <div className="skeleton h-6 w-16 rounded-full" />
            <div className="skeleton h-6 w-20 rounded-full" />
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex justify-between">
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-7 w-16 rounded-lg" />
          </div>
          <div className="p-4 space-y-2">
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-4/5 rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !prompt) {
    return (
      <div className="max-w-3xl mx-auto" role="alert">
        <div className="card p-10 text-center animate-fade-in">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-400 mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Prompt not found</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">This prompt may have been deleted or doesn't exist.</p>
          <Link to="/prompts" viewTransition className="btn-ghost inline-flex">
            <BackIcon />
            Back to prompts
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[prompt.status] ?? STATUS_CONFIG.archived;
  const models = prompt.modelCompatibility ?? [];
  const contentLines = prompt.content.split("\n").length;
  const contentWords = prompt.content.split(/\s+/).filter(Boolean).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back link */}
      <Link
        to="/prompts"
        viewTransition
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
      >
        <BackIcon />
        All prompts
      </Link>

      {/* Header card */}
      <div className="card p-6 space-y-5">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="prompt-title text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight tracking-tight"
              style={{ viewTransitionName: `prompt-title-${prompt.id}` }}>
            {prompt.title}
          </h1>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shrink-0 ${statusConfig.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusConfig.dot}`} aria-hidden="true" />
            {statusConfig.label}
          </span>
        </div>

        {/* Description */}
        {prompt.description && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {prompt.description}
          </p>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Version", value: `v${prompt.version}` },
            { label: "Author", value: prompt.author ?? "—" },
            { label: "Created", value: new Date(prompt.createdAt).toLocaleDateString() },
            { label: "Updated", value: new Date(prompt.updatedAt).toLocaleDateString() },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 p-3">
              <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{value}</p>
            </div>
          ))}
        </div>

        {/* Tags */}
        {prompt.tags && prompt.tags.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {prompt.tags.map((tag) => (
                <span key={tag} className="tag-primary">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Model compatibility */}
        {models.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
              Model Compatibility
            </p>
            <div className="flex flex-wrap gap-1.5">
              {models.map((m) => {
                const colors = getModelColor(m);
                return (
                  <span key={m} className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold border ${colors.bg} ${colors.text} border-transparent`}>
                    {m}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Rating */}
        {prompt.rating != null && (
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Rating</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg key={star} width="14" height="14" viewBox="0 0 24 24"
                  fill={Number(prompt.rating) >= star * 2 ? "currentColor" : "none"}
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={Number(prompt.rating) >= star * 2 ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}
                  aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ))}
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 ml-1 tabular-nums">{prompt.rating} / 9.99</span>
            </div>
          </div>
        )}

        {/* Usage examples */}
        {Array.isArray(prompt.usageExamples) && (prompt.usageExamples as string[]).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
              Usage Examples
            </p>
            <ul className="space-y-1.5">
              {(prompt.usageExamples as string[]).map((ex, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary-400 shrink-0" aria-hidden="true" />
                  {ex}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Prompt Content block */}
      <div className="card overflow-hidden">
        {/* Content header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800
                        bg-zinc-50/80 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
              Prompt Content
            </span>
            <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-600">
              <span className="tabular-nums">{contentWords} words</span>
              <span>·</span>
              <span className="tabular-nums">{contentLines} lines</span>
            </div>
          </div>
          <button
            onClick={handleCopy}
            aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150
              ${copied
                ? "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/50"
                : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* Content body */}
        <div className="overflow-x-auto">
          <pre className="p-5 text-sm font-mono whitespace-pre-wrap break-words leading-relaxed text-zinc-700 dark:text-zinc-300 min-h-[80px]">
            <code className="language-markdown">{prompt.content}</code>
          </pre>
        </div>
      </div>

      {/* Template Panel — only shows if prompt has {{variables}} */}
      <TemplatePanel content={prompt.content} />

      {/* Structure Analysis */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowAnalysis(!showAnalysis)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left
                     bg-zinc-50/80 dark:bg-zinc-900/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            Prompt Analysis
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`text-zinc-400 transition-transform ${showAnalysis ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showAnalysis && analysis && (
          <div className="p-5 space-y-5 border-t border-zinc-100 dark:border-zinc-800 animate-fade-in">
            {/* Classification */}
            <div>
              <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
                Detected Type
              </p>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  {analysis.classification.type}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {Math.round(analysis.classification.confidence * 100)}% confidence — {analysis.classification.reason}
                </span>
              </div>
            </div>

            {/* Structure sections */}
            <div>
              <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
                Structure Score: {analysis.structure.score}/{analysis.structure.total}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {analysis.structure.sections.map((section) => (
                  <div
                    key={section.name}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border
                      ${section.detected
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50"
                        : "bg-zinc-50 text-zinc-400 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-500 dark:border-zinc-700"
                      }`}
                  >
                    {section.detected ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    )}
                    {section.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Suggestions */}
            {analysis.structure.suggestions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
                  Suggestions
                </p>
                <ul className="space-y-1.5">
                  {analysis.structure.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      <span className="mt-1 h-1 w-1 rounded-full bg-amber-400 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI Improvement */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
              {!showImproved ? (
                <button
                  onClick={handleImprove}
                  disabled={isImproving || (analysis.structure.score === analysis.structure.total && analysis.structure.suggestions.length === 0)}
                  className="btn-primary gap-1.5 text-xs"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {isImproving ? "Improving..." : "Improve with AI"}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      Improved Version
                      {isImproving && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!isImproving && improvedText && (
                        <>
                          <button onClick={handleAcceptImprovement} className="btn-primary text-[11px] py-1 px-2.5">
                            Accept
                          </button>
                          <button onClick={() => { setShowImproved(false); setImprovedText(''); }} className="btn-ghost text-[11px] py-1 px-2.5">
                            Discard
                          </button>
                        </>
                      )}
                      {isImproving && (
                        <button onClick={() => { improveAbortRef.current?.abort(); setIsImproving(false); }} className="btn-ghost text-[11px] py-1 px-2.5 text-red-500">
                          Stop
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 p-4 max-h-96 overflow-y-auto">
                    <pre className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                      {improvedText || (isImproving ? 'Generating improvement...' : '')}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Version History */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowVersions(!showVersions)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left
                     bg-zinc-50/80 dark:bg-zinc-900/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Version History
            <span className="text-zinc-400 dark:text-zinc-600 font-normal normal-case">(current: v{prompt.version})</span>
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`text-zinc-400 transition-transform ${showVersions ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showVersions && (
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            {!versions || versions.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">
                No previous versions yet. Versions are saved automatically when you edit the prompt content.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {versions.map((v: any) => (
                  <div key={v.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">v{v.version}</span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-600">
                          {new Date(v.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {v.title} — {v.content.slice(0, 100)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setSelectedVersion(selectedVersion?.id === v.id ? null : v)}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        {selectedVersion?.id === v.id ? "Hide" : "View"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Restore version ${v.version}? The current content will be saved as a new version.`)) {
                            restoreMutation.mutate(v.version);
                          }
                        }}
                        disabled={restoreMutation.isPending}
                        className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
                {selectedVersion && (
                  <div className="p-5 bg-zinc-50/50 dark:bg-zinc-900/30">
                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                      Version {selectedVersion.version} content
                    </p>
                    <pre className="text-xs font-mono whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400 max-h-64 overflow-y-auto rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
                      {selectedVersion.content}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2.5 flex-wrap pb-4">
        <button
          onClick={() => favoriteMutation.mutate()}
          disabled={favoriteMutation.isPending}
          className={`favorite-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium border transition-colors
            ${prompt.isFavorite
              ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50"
              : "bg-white text-zinc-500 border-zinc-200 hover:text-amber-500 hover:border-amber-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 dark:hover:text-amber-400"
            }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24"
            fill={prompt.isFavorite ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {prompt.isFavorite ? "Favorited" : "Favorite"}
        </button>
        <Link to={`/prompts/${prompt.id}/edit`} viewTransition className="btn-primary gap-2">
          <EditIcon />
          Edit Prompt
        </Link>
        <Link to={`/playground?prompt=${prompt.id}`} viewTransition className="btn-ghost gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Playground
        </Link>
        <button
          onClick={() => duplicateMutation.mutate()}
          disabled={duplicateMutation.isPending}
          className="btn-ghost"
        >
          {duplicateMutation.isPending ? "Cloning…" : "Clone"}
        </button>
        <div className="relative">
          <button
            onClick={() => setShowFolderMenu(!showFolderMenu)}
            className="btn-ghost gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Move to Folder
          </button>
          {showFolderMenu && (
            <div className="absolute bottom-full mb-1 left-0 z-50 w-48 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-lg py-1 animate-fade-in">
              <button
                onClick={() => moveMutation.mutate("unfolder")}
                className="w-full text-left px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                </svg>
                Unfiled
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => moveMutation.mutate(f.id)}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            if (confirm("Delete this prompt? This cannot be undone.")) deleteMutation.mutate();
          }}
          disabled={deleteMutation.isPending}
          className="btn-danger ml-auto"
        >
          {deleteMutation.isPending ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
