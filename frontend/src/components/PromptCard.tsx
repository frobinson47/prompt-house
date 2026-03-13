import { useState } from "react";
import { Link } from "react-router-dom";
import type { Prompt } from "../api";
import { useToast } from "./Toast";

interface Props {
  prompt: Prompt;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
}

const STATUS_CONFIG: Record<string, {
  className: string;
  dot: string;
  label: string;
  gradient: string;
}> = {
  active:     { className: "status-active",     dot: "bg-emerald-500", label: "Active",      gradient: "from-emerald-500/8 via-transparent to-transparent" },
  draft:      { className: "status-draft",      dot: "bg-amber-500",   label: "Draft",       gradient: "from-amber-500/8 via-transparent to-transparent" },
  archived:   { className: "status-archived",   dot: "bg-zinc-400",    label: "Archived",    gradient: "from-zinc-400/6 via-transparent to-transparent" },
  deprecated: { className: "status-deprecated", dot: "bg-red-500",     label: "Deprecated",  gradient: "from-red-500/8 via-transparent to-transparent" },
};

// Match model names by prefix for flexible matching
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

const TYPE_STYLES: Record<string, { bg: string; icon: string }> = {
  system:    { bg: "bg-primary-100 text-primary-700 dark:bg-primary-950/50 dark:text-primary-400", icon: "\u2699" },
  task:      { bg: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400", icon: "\u25b6" },
  template:  { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400", icon: "\u2b21" },
  chain:     { bg: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400", icon: "\u26d3" },
  reference: { bg: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400", icon: "\u2261" },
  snippet:   { bg: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400", icon: "\u2702" },
};

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function PromptCard({ prompt, onDelete, onDuplicate, onToggleFavorite }: Props) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { toast } = useToast();

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(prompt.content);
    setCopied(true);
    toast("Copied to clipboard");
    setTimeout(() => setCopied(false), 1800);
  };

  const statusConfig = STATUS_CONFIG[prompt.status] ?? STATUS_CONFIG.archived;
  const typeConfig = TYPE_STYLES[prompt.promptType ?? "task"] ?? TYPE_STYLES.task;
  const models = prompt.modelCompatibility ?? [];
  const contentLen = prompt.content.length;
  const wordCount = prompt.content.split(/\s+/).filter(Boolean).length;

  return (
    <article
      className="prompt-card relative flex flex-col rounded-2xl border overflow-hidden animate-fade-in
                 bg-white dark:bg-zinc-900
                 border-zinc-200/80 dark:border-zinc-800/80
                 transition-all duration-300 ease-out group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Gradient accent wash at top — tied to status color */}
      <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${statusConfig.gradient} pointer-events-none`} />

      {/* Favorite indicator glow */}
      {prompt.isFavorite && (
        <div className="absolute -top-8 -right-8 w-24 h-24 bg-amber-400/10 dark:bg-amber-400/5 rounded-full blur-2xl pointer-events-none" />
      )}

      <div className="relative flex flex-col gap-3 p-5 pb-3 flex-1">
        {/* Top row: Type badge + Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Type badge */}
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeConfig.bg}`}>
              <span aria-hidden="true">{typeConfig.icon}</span>
              {prompt.promptType ?? "task"}
            </span>

            {/* Version pill */}
            <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600 tabular-nums">
              v{prompt.version}
            </span>
          </div>

          {/* Action cluster */}
          <div className="flex items-center gap-0.5">
            {onToggleFavorite && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(prompt.id); }}
                aria-label={prompt.isFavorite ? "Remove from favorites" : "Add to favorites"}
                className={`favorite-btn flex items-center justify-center h-7 w-7 rounded-lg transition-colors
                  ${prompt.isFavorite
                    ? "text-amber-400 hover:text-amber-500"
                    : "text-zinc-300 hover:text-amber-400 dark:text-zinc-700 dark:hover:text-amber-400"
                  }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24"
                  fill={prompt.isFavorite ? "currentColor" : "none"}
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            )}
            <button
              onClick={handleCopy}
              aria-label={copied ? "Copied!" : "Copy prompt"}
              className={`flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-150
                ${copied
                  ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/50"
                  : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:text-zinc-600 dark:hover:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        </div>

        {/* Title */}
        <Link
          to={`/prompts/${prompt.id}`}
          viewTransition
          className="prompt-title text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug
                     hover:text-primary-600 dark:hover:text-primary-400 transition-colors line-clamp-2"
          style={{ viewTransitionName: `prompt-title-${prompt.id}` }}
        >
          {prompt.title}
        </Link>

        {/* Description */}
        {prompt.description && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed -mt-1">
            {prompt.description}
          </p>
        )}

        {/* Content preview — styled code block */}
        <div className="relative rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800/60
                        overflow-hidden">
          {/* Mini header bar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800/60">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <div className="w-2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              <div className="w-2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-600 tabular-nums">
              {wordCount.toLocaleString()} words
            </span>
          </div>
          <div className="px-3 py-2.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-500 leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
            {prompt.content}
          </div>
          {/* Fade out gradient at bottom */}
          <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-zinc-50 dark:from-zinc-950/60 to-transparent pointer-events-none" />
        </div>

        {/* Tags + Models row */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {prompt.tags && prompt.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium
                                        bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-200/60
                                        dark:bg-primary-950/40 dark:text-primary-400 dark:ring-primary-800/40">
              {tag}
            </span>
          ))}
          {prompt.tags && prompt.tags.length > 3 && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-medium">
              +{prompt.tags.length - 3}
            </span>
          )}
          {models.length > 0 && prompt.tags && prompt.tags.length > 0 && (
            <span className="text-zinc-200 dark:text-zinc-800 mx-0.5" aria-hidden="true">\u00b7</span>
          )}
          {models.slice(0, 2).map((m) => {
            const colors = getModelColor(m);
            return (
              <span key={m} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                {m}
              </span>
            );
          })}
          {models.length > 2 && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-medium">+{models.length - 2}</span>
          )}
        </div>
      </div>

      {/* Footer — revealed fully on hover */}
      <div className={`flex items-center justify-between px-5 py-2.5 border-t border-zinc-100 dark:border-zinc-800/60
                        transition-all duration-200
                        ${isHovered ? "bg-zinc-50 dark:bg-zinc-800/30" : "bg-transparent"}`}>
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${statusConfig.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusConfig.dot}`} aria-hidden="true" />
            {statusConfig.label}
          </span>

          {prompt.rating != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-500 shrink-0">
              <StarIcon filled />
              <span className="tabular-nums">{prompt.rating}</span>
            </span>
          )}
        </div>

        {/* Actions — slide in on hover */}
        <div className={`flex items-center gap-0.5 transition-all duration-200
                          ${isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"}`}>
          <Link
            to={`/prompts/${prompt.id}/edit`}
            viewTransition
            className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700
                       dark:text-zinc-500 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-300 transition-colors"
          >
            Edit
          </Link>
          {onDuplicate && (
          <button
            onClick={(e) => { e.preventDefault(); onDuplicate(prompt.id); }}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700
                       dark:text-zinc-500 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-300 transition-colors"
          >
            Clone
          </button>
          )}
          {onDelete && (
          <button
            onClick={(e) => { e.preventDefault(); onDelete(prompt.id); }}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-50 hover:text-red-600
                       dark:text-red-500/70 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
          >
            Delete
          </button>
          )}
        </div>
      </div>
    </article>
  );
}
