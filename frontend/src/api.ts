const API_BASE = import.meta.env.VITE_API_URL ?? "";

export const apiKeyStore = {
  get: () => localStorage.getItem("prompt_house_api_key") ?? "",
  set: (key: string) => localStorage.setItem("prompt_house_api_key", key),
  clear: () => localStorage.removeItem("prompt_house_api_key"),
};

export interface Prompt {
  id: string;
  title: string;
  description: string | null;
  content: string;
  tags: string[] | null;
  modelCompatibility: string[] | null;
  status: string;
  visibility: string;
  rating: string | null;
  usageExamples: unknown;
  version: number;
  author: string | null;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  promptType: string | null;
}

export interface PromptListResponse {
  data: Prompt[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ModelDefaults {
  defaults: Record<string, string[]>;
  used: string[];
  other: string[];
}

export interface PromptFilters {
  q?: string;
  tags?: string;
  status?: string;
  model?: string;
  type?: string;
  folder?: string;
  sort?: string;
  order?: string;
  page?: number;
  limit?: number;
}

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const extraHeaders: Record<string, string> = {};
  if (WRITE_METHODS.has(method)) {
    const key = apiKeyStore.get();
    if (key) extraHeaders["X-Api-Key"] = key;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...extraHeaders, ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listPrompts: (filters: PromptFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== "") params.set(k, String(v));
    });
    return request<PromptListResponse>(`/api/prompts?${params}`);
  },

  getPrompt: (id: string) => request<Prompt>(`/api/prompts/${id}`),

  createPrompt: (data: Partial<Prompt>) =>
    request<Prompt>("/api/prompts", { method: "POST", body: JSON.stringify(data) }),

  updatePrompt: (id: string, data: Partial<Prompt>) =>
    request<Prompt>(`/api/prompts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deletePrompt: (id: string) =>
    request<void>(`/api/prompts/${id}`, { method: "DELETE" }),

  duplicatePrompt: (id: string) =>
    request<Prompt>(`/api/prompts/${id}/duplicate`, { method: "POST" }),

  toggleFavorite: (id: string) =>
    request<Prompt>(`/api/prompts/${id}/favorite`, { method: "PATCH" }),

  bulkAction: (ids: string[], action: string, value?: string) =>
    request<{ affected: number; action: string }>("/api/prompts/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action, value }),
    }),

  getTypeCounts: () =>
    request<Array<{ type: string; count: number }>>("/api/prompts/types/counts"),

  getAvailableModels: () =>
    request<ModelDefaults>("/api/prompts/models/available"),

  semanticSearch: (q: string, filters: { status?: string; type?: string; limit?: number } = {}) => {
    const params = new URLSearchParams({ q });
    if (filters.status) params.set("status", filters.status);
    if (filters.type) params.set("type", filters.type);
    if (filters.limit) params.set("limit", String(filters.limit));
    return request<{ data: (Prompt & { similarity: number })[]; query: string; count: number }>(
      `/api/search?${params}`
    );
  },

  getEmbeddingStatus: () =>
    request<{ total: string; embedded: string; missing: string }>("/api/search/status"),

  backfillEmbeddings: () =>
    request<{ processed: number; failed: number; total: number }>("/api/search/backfill", {
      method: "POST",
    }),

  analyzePrompt: (id: string) =>
    request<{
      classification: { type: string; confidence: number; reason: string };
      structure: {
        sections: { name: string; detected: boolean }[];
        score: number;
        total: number;
        missing: string[];
        suggestions: string[];
      };
    }>(`/api/prompts/${id}/analyze`),

  classifyPrompt: (title: string, content: string) =>
    request<{ type: string; confidence: number; reason: string }>("/api/prompts/classify", {
      method: "POST",
      body: JSON.stringify({ title, content }),
    }),

  autoClassify: () =>
    request<{ total: number; updated: number }>("/api/prompts/auto-classify", {
      method: "POST",
    }),

  getVersions: (id: string) =>
    request<Array<{
      id: string;
      prompt_id: string;
      version: number;
      title: string;
      content: string;
      created_at: string;
    }>>(`/api/prompts/${id}/versions`),

  restoreVersion: (id: string, version: number) =>
    request<Prompt>(`/api/prompts/${id}/versions/${version}/restore`, {
      method: "POST",
    }),
};

// Auth
export interface AuthUser {
  sub: string;
  name: string;
  email: string;
  groups: string[];
}

export interface LLMKey {
  id: string;
  provider: string;
  label: string;
  maskedKey: string;
  createdAt: string;
  updatedAt: string;
}

export const authApi = {
  getMe: () => request<{ user: AuthUser | null }>("/api/auth/me"),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};

export const settingsApi = {
  listKeys: () => request<LLMKey[]>("/api/settings/llm-keys"),
  saveKey: (provider: string, apiKey: string, label?: string) =>
    request<LLMKey>("/api/settings/llm-keys", {
      method: "POST",
      body: JSON.stringify({ provider, apiKey, label }),
    }),
  deleteKey: (provider: string) =>
    request<void>(`/api/settings/llm-keys/${provider}`, { method: "DELETE" }),
};

// Playground
export interface PlaygroundModelGroup {
  provider: string;
  providerId: string;
  color: string;
  hasKey: boolean;
  models: { id: string; name: string }[];
}

export const playgroundApi = {
  getModels: () => request<PlaygroundModelGroup[]>("/api/playground/models"),
};

// Tags
export const tagsApi = {
  list: () => request<Array<{ tag: string; count: number }>>("/api/tags"),
  rename: (oldTag: string, newTag: string) =>
    request<{ affected: number; oldTag: string; newTag: string }>("/api/tags/rename", {
      method: "POST",
      body: JSON.stringify({ oldTag, newTag }),
    }),
  merge: (sourceTags: string[], targetTag: string) =>
    request<{ affected: number; targetTag: string }>("/api/tags/merge", {
      method: "POST",
      body: JSON.stringify({ sourceTags, targetTag }),
    }),
  remove: (tag: string) =>
    request<{ affected: number; tag: string }>(`/api/tags/${encodeURIComponent(tag)}`, {
      method: "DELETE",
    }),
};

// Folders
export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  prompt_count: number;
  created_at: string;
  updated_at: string;
}

export const folderApi = {
  list: () => request<Folder[]>("/api/folders"),
  create: (name: string, parentId?: string) =>
    request<Folder>("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name, parentId }),
    }),
  update: (id: string, data: { name?: string; parentId?: string | null; position?: number }) =>
    request<Folder>(`/api/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<void>(`/api/folders/${id}`, { method: "DELETE" }),
  movePrompts: (folderId: string, promptIds: string[]) =>
    request<{ affected: number }>(`/api/folders/${folderId}/move-prompts`, {
      method: "PATCH",
      body: JSON.stringify({ promptIds }),
    }),
};
