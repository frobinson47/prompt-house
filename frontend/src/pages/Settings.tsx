import { useState, useEffect } from "react";
import { settingsApi, type LLMKey } from "../api";
import { useToast } from "../components/Toast";

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "google", name: "Google AI", placeholder: "AIza..." },
  { id: "xai", name: "xAI", placeholder: "xai-..." },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-..." },
] as const;

export default function Settings() {
  const [keys, setKeys] = useState<LLMKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProvider, setEditProvider] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    settingsApi.listKeys()
      .then(setKeys)
      .catch(() => toast("Failed to load API keys", "info"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (provider: string) => {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      const updated = await settingsApi.saveKey(provider, editValue.trim());
      setKeys((prev) => {
        const idx = prev.findIndex((k) => k.provider === provider);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [...prev, updated];
      });
      setEditProvider(null);
      setEditValue("");
      toast(`${provider} key saved`);
    } catch (err: any) {
      toast(err.message || "Failed to save key", "info");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider: string) => {
    try {
      await settingsApi.deleteKey(provider);
      setKeys((prev) => prev.filter((k) => k.provider !== provider));
      toast(`${provider} key removed`);
    } catch (err: any) {
      toast(err.message || "Failed to remove key", "info");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-serif font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Configure LLM API keys for the Prompt Playground. Keys are encrypted at rest.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
          LLM API Keys
        </h2>

        <div className="space-y-3">
          {PROVIDERS.map(({ id, name, placeholder }) => {
            const existing = keys.find((k) => k.provider === id);
            const isEditing = editProvider === id;

            return (
              <div
                key={id}
                className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80
                           bg-white dark:bg-zinc-900 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{name}</div>
                  {existing && !isEditing && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-500 font-mono mt-0.5">
                      {existing.maskedKey}
                    </div>
                  )}
                  {isEditing && (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="password"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSave(id); if (e.key === "Escape") { setEditProvider(null); setEditValue(""); } }}
                        placeholder={placeholder}
                        className="input-base flex-1 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSave(id)}
                        disabled={saving || !editValue.trim()}
                        className="btn-primary py-1.5 px-3 text-xs"
                      >
                        {saving ? "..." : "Save"}
                      </button>
                      <button
                        onClick={() => { setEditProvider(null); setEditValue(""); }}
                        className="btn-ghost py-1.5 px-3 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {existing ? (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium status-active">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Set
                        </span>
                        <button
                          onClick={() => { setEditProvider(id); setEditValue(""); }}
                          className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          Update
                        </button>
                        <button
                          onClick={() => handleDelete(id)}
                          className="rounded-md px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setEditProvider(id); setEditValue(""); }}
                        className="btn-ghost py-1.5 px-3 text-xs"
                      >
                        Add Key
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
