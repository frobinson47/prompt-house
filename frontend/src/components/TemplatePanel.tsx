import { useState, useMemo, useCallback } from "react";
import { useToast } from "./Toast";

interface Props {
  content: string;
}

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

function renderTemplate(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, name) => values[name] || match);
}

export default function TemplatePanel({ content }: Props) {
  const variables = useMemo(() => extractVariables(content), [content]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const rendered = useMemo(() => renderTemplate(content, values), [content, values]);
  const allFilled = variables.every((v) => values[v]?.trim());
  const filledCount = variables.filter((v) => values[v]?.trim()).length;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(rendered);
    setCopied(true);
    toast("Template copied to clipboard");
    setTimeout(() => setCopied(false), 1800);
  }, [rendered, toast]);

  const handleReset = () => {
    setValues({});
  };

  if (variables.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left
                   bg-zinc-50/80 dark:bg-zinc-900/50 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          Use as Template
          <span className="font-normal normal-case text-primary-500 dark:text-primary-400">
            {variables.length} variable{variables.length !== 1 ? "s" : ""}
          </span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 animate-fade-in">
          {/* Variable inputs */}
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Fill in variables ({filledCount}/{variables.length})
              </p>
              {filledCount > 0 && (
                <button onClick={handleReset} className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                  Reset all
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {variables.map((v) => (
                <div key={v} className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <span className="text-primary-500 dark:text-primary-400 font-mono">{`{{${v}}}`}</span>
                  </label>
                  <input
                    type="text"
                    value={values[v] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                    placeholder={`Enter ${v}...`}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-400 dark:focus:border-primary-600"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between px-5 py-2.5 bg-zinc-50/50 dark:bg-zinc-900/30">
              <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Preview
              </span>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150
                  ${copied
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/50"
                    : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  }`}
              >
                {copied ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
                {copied ? "Copied!" : "Copy Result"}
              </button>
            </div>
            <div className="px-5 pb-5">
              <pre className="rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 p-4 max-h-80 overflow-y-auto text-sm font-mono whitespace-pre-wrap break-words leading-relaxed text-zinc-700 dark:text-zinc-300">
                {rendered.split(/(\{\{\w+\}\})/).map((part, i) => {
                  const varMatch = part.match(/^\{\{(\w+)\}\}$/);
                  if (varMatch) {
                    const filled = values[varMatch[1]]?.trim();
                    return filled ? (
                      <span key={i} className="text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/30 rounded px-0.5">{filled}</span>
                    ) : (
                      <span key={i} className="text-primary-500 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/30 rounded px-0.5">{part}</span>
                    );
                  }
                  return <span key={i}>{part}</span>;
                })}
              </pre>
            </div>
          </div>

          {/* Quick actions */}
          {allFilled && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 px-5 py-3 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                All variables filled — ready to copy
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
