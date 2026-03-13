import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Prompt } from "../api";
import RichEditor from "../components/RichEditor";

const STATUSES = ["active", "draft", "archived", "deprecated"] as const;
const PROMPT_TYPES = ["system", "task", "template", "chain", "reference", "snippet"] as const;

function getModelToggleColors(model: string): { selected: string; unselected: string } {
  const m = model.toLowerCase();
  if (m.includes("claude") || m.includes("anthropic"))
    return { selected: "border-orange-600 bg-orange-600 text-white", unselected: "border-zinc-200 dark:border-zinc-700 hover:border-orange-400 hover:text-orange-600" };
  if (m.includes("gpt") || m.includes("openai") || m.startsWith("o3") || m.startsWith("o4"))
    return { selected: "border-green-600 bg-green-600 text-white", unselected: "border-zinc-200 dark:border-zinc-700 hover:border-green-400 hover:text-green-600" };
  if (m.includes("gemini") || m.includes("google"))
    return { selected: "border-blue-600 bg-blue-600 text-white", unselected: "border-zinc-200 dark:border-zinc-700 hover:border-blue-400 hover:text-blue-600" };
  if (m.includes("grok") || m.includes("xai"))
    return { selected: "border-zinc-600 bg-zinc-600 text-white", unselected: "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 hover:text-zinc-600" };
  if (m.includes("llama") || m.includes("meta"))
    return { selected: "border-purple-600 bg-purple-600 text-white", unselected: "border-zinc-200 dark:border-zinc-700 hover:border-purple-400 hover:text-purple-600" };
  return { selected: "border-zinc-600 bg-zinc-600 text-white", unselected: "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 hover:text-zinc-600" };
}

interface FormData {
  title: string;
  content: string;
  description: string;
  author: string;
  status: string;
  tags: string;
  modelCompatibility: string[];
  rating: string;
  usageExamples: string;
}

const emptyForm: FormData = {
  title: "",
  content: "",
  description: "",
  author: "",
  status: "active",
  tags: "",
  modelCompatibility: [],
  rating: "",
  usageExamples: "",
};

function promptToForm(p: Prompt): FormData {
  const examples = Array.isArray(p.usageExamples)
    ? (p.usageExamples as string[]).join("\n")
    : p.usageExamples
    ? JSON.stringify(p.usageExamples)
    : "";
  return {
    title: p.title,
    content: p.content,
    description: p.description ?? "",
    author: p.author ?? "",
    status: p.status,
    tags: (p.tags ?? []).join(", "),
    modelCompatibility: p.modelCompatibility ?? [],
    rating: p.rating ?? "",
    usageExamples: examples,
  };
}

function FormSection({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</h2>
        {description && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="p-6 space-y-5">
        {children}
      </div>
    </div>
  );
}

function FormField({ label, required, hint, id, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
        {required && <span className="text-red-500 text-xs" aria-hidden="true">*</span>}
        {hint && (
          <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
            — {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

export default function PromptFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Dynamic model list
  const { data: modelsData } = useQuery({
    queryKey: ["models-available"],
    queryFn: () => api.getAvailableModels(),
    staleTime: 5 * 60 * 1000,
  });
  const modelGroups = modelsData?.defaults ?? {};

  const [form, setForm] = useState<FormData>(emptyForm);
  const [error, setError] = useState("");

  const { data: existing, isLoading } = useQuery({
    queryKey: ["prompt", id],
    queryFn: () => api.getPrompt(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) setForm(promptToForm(existing));
  }, [existing]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Prompt>) => api.createPrompt(data),
    onSuccess: (prompt) => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      navigate(`/prompts/${prompt.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Prompt>) => api.updatePrompt(id!, data),
    onSuccess: (prompt) => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      queryClient.invalidateQueries({ queryKey: ["prompt", id] });
      navigate(`/prompts/${prompt.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const tags = form.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const examples = form.usageExamples
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: Partial<Prompt> = {
      title: form.title,
      content: form.content,
      description: form.description || undefined,
      author: form.author || undefined,
      status: form.status,
      tags: tags.length > 0 ? tags : undefined,
      modelCompatibility: form.modelCompatibility.length > 0 ? form.modelCompatibility : undefined,
      rating: form.rating !== "" ? form.rating : null,
      usageExamples: examples.length > 0 ? examples : null,
    };
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleModel = (model: string) => {
    setForm((f) => ({
      ...f,
      modelCompatibility: f.modelCompatibility.includes(model)
        ? f.modelCompatibility.filter((m) => m !== model)
        : [...f.modelCompatibility, model],
    }));
  };

  if (isEdit && isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-pulse" aria-busy="true">
        <div className="skeleton h-4 w-32 rounded" />
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="skeleton h-4 w-32 rounded" />
          </div>
          <div className="p-6 space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="skeleton h-4 w-20 rounded" />
                <div className="skeleton h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Back navigation */}
      {isEdit ? (
        <Link
          to={`/prompts/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
        >
          <BackIcon />
          Back to prompt
        </Link>
      ) : (
        <Link
          to="/prompts"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
        >
          <BackIcon />
          All prompts
        </Link>
      )}

      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {isEdit ? "Edit Prompt" : "New Prompt"}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {isEdit ? "Update your prompt and save changes." : "Add a new prompt to your library."}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
                     dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 animate-fade-in"
        >
          <strong className="font-semibold">Error: </strong>{error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>

        {/* Core content */}
        <FormSection
          title="Prompt Details"
          description="The title and content are required. A good title helps you find this prompt later."
        >
          <FormField label="Title" required id="title">
            <input
              id="title"
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="input-base"
              placeholder="A descriptive name for this prompt"
            />
          </FormField>

          <FormField label="Prompt Content" required id="content">
            <RichEditor
              value={form.content}
              onChange={(content) => setForm((f) => ({ ...f, content }))}
              placeholder="Write your prompt text here..."
              minRows={12}
            />
          </FormField>

          <FormField label="Description" id="description">
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="input-base resize-y"
              placeholder="What does this prompt do? When should you use it?"
            />
          </FormField>
        </FormSection>

        {/* Metadata */}
        <FormSection
          title="Metadata"
          description="Help organize and discover this prompt with tags, author, and status."
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Author" id="author">
              <input
                id="author"
                type="text"
                value={form.author}
                onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                className="input-base"
                placeholder="Your name or handle"
              />
            </FormField>
            <FormField label="Status" id="status">
              <select
                id="status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="input-base"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Tags" hint="comma-separated" id="tags">
            <input
              id="tags"
              type="text"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              className="input-base"
              placeholder="creative writing, summarization, code generation"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Rating" hint="0 – 9.99" id="rating">
              <input
                id="rating"
                type="number"
                min="0"
                max="9.99"
                step="0.01"
                value={form.rating}
                onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                className="input-base"
                placeholder="e.g. 8.5"
              />
            </FormField>
          </div>

          <FormField label="Usage Examples" hint="one per line" id="usageExamples">
            <textarea
              id="usageExamples"
              value={form.usageExamples}
              onChange={(e) => setForm((f) => ({ ...f, usageExamples: e.target.value }))}
              rows={3}
              className="input-base resize-y text-sm"
              placeholder={"Summarize a long article\nGenerate a product description\nTranslate code comments"}
            />
          </FormField>
        </FormSection>

        {/* Model compatibility */}
        <FormSection
          title="Model Compatibility"
          description="Which AI models is this prompt designed for? Select all that apply."
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label="Select compatible models">
            {Object.entries(modelGroups).flatMap(([, models]) => models).map((model: string) => {
              const selected = form.modelCompatibility.includes(model);
              const colors = getModelToggleColors(model);
              return (
                <button
                  key={model}
                  type="button"
                  onClick={() => toggleModel(model)}
                  aria-pressed={selected}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-150
                    ${selected
                      ? `${colors.selected} shadow-sm`
                      : `${colors.unselected} bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400`
                    }`}
                >
                  {model}
                </button>
              );
            })}
          </div>
        </FormSection>

        {/* Submit actions */}
        <div className="flex items-center gap-3 pb-4">
          <button
            type="submit"
            disabled={isPending || !form.title.trim() || !form.content.trim()}
            className="btn-primary"
          >
            {isPending ? (
              <>
                <svg className="animate-spin -ml-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Saving…
              </>
            ) : (
              isEdit ? "Save Changes" : "Create Prompt"
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/prompts/${id}` : "/prompts")}
            className="btn-ghost"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
