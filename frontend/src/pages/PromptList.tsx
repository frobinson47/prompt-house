import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PromptFilters } from "../api";
import PromptCard from "../components/PromptCard";
import FolderTree from "../components/FolderTree";

const STATUSES = ["active", "draft", "archived", "deprecated"];
const PROMPT_TYPES = [
  { value: "system", label: "System", color: "text-primary-600 dark:text-primary-400" },
  { value: "task", label: "Task", color: "text-blue-600 dark:text-blue-400" },
  { value: "template", label: "Template", color: "text-emerald-600 dark:text-emerald-400" },
  { value: "chain", label: "Chain", color: "text-amber-600 dark:text-amber-400" },
  { value: "reference", label: "Reference", color: "text-zinc-500 dark:text-zinc-400" },
  { value: "snippet", label: "Snippet", color: "text-rose-600 dark:text-rose-400" },
];
const SORT_OPTIONS = [
  { value: "created_at", label: "Newest" },
  { value: "updated_at", label: "Recently updated" },
  { value: "title", label: "Title A-Z" },
  { value: "favorites", label: "Favorites first" },
];

function SearchIcon() {
  return (
    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 3l.7 2.1L22 6l-2.3.9L19 9l-.7-2.1L16 6l2.3-.9z" />
      <path d="M5 15l.5 1.5L7 17l-1.5.5L5 19l-.5-1.5L3 17l1.5-.5z" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="card flex flex-col overflow-hidden" aria-hidden="true">
      <div className="h-0.5 w-full bg-zinc-100 dark:bg-zinc-800" />
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="skeleton h-4 w-3/5 rounded" />
          <div className="skeleton h-6 w-14 rounded-md" />
        </div>
        <div className="skeleton h-3 w-4/5 rounded" />
        <div className="skeleton h-16 w-full rounded-lg" />
        <div className="flex gap-1">
          <div className="skeleton h-4 w-12 rounded-full" />
          <div className="skeleton h-4 w-16 rounded-full" />
        </div>
      </div>
      <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex gap-2">
          <div className="skeleton h-4 w-14 rounded-full" />
          <div className="skeleton h-4 w-8 rounded" />
        </div>
        <div className="flex gap-1">
          <div className="skeleton h-5 w-8 rounded" />
          <div className="skeleton h-5 w-10 rounded" />
          <div className="skeleton h-5 w-10 rounded" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl
                      bg-gradient-to-br from-primary-50 to-primary-100
                      dark:from-primary-950/40 dark:to-primary-900/20
                      text-primary-400 dark:text-primary-500 mb-5 shadow-sm">
        <SparkleIcon />
      </div>
      <p className="text-base font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
        {hasFilters ? "No prompts match your filters" : "Your prompt library is empty"}
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-xs">
        {hasFilters
          ? "Try adjusting your search or clearing some filters."
          : "Create your first prompt to start building your AI prompt library."}
      </p>
      {hasFilters ? (
        <button onClick={onClear} className="btn-ghost">
          Clear all filters
        </button>
      ) : (
        <Link to="/prompts/new" viewTransition className="btn-primary">
          Create your first prompt
        </Link>
      )}
    </div>
  );
}

// A single pill toggle button
function PillToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={active ? "filter-pill-active" : "filter-pill"}
    >
      {label}
    </button>
  );
}

export default function PromptList() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Dynamic model list
  const { data: modelsData } = useQuery({
    queryKey: ["models-available"],
    queryFn: () => api.getAvailableModels(),
    staleTime: 5 * 60 * 1000, // cache for 5 min
  });
  const modelGroups = modelsData?.defaults ?? {};
  const allModels = Object.entries(modelGroups).flatMap(([provider, models]) =>
    models.map(m => ({ provider, model: m }))
  );

  const urlQuery = searchParams.get("q") ?? "";
  const urlType = searchParams.get("type") ?? "";
  const urlSort = searchParams.get("sort") ?? "";

  const [search, setSearch] = useState(urlQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(urlQuery);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [page, setPage] = useState(1);
  const [tagInput, setTagInput] = useState("");
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showTagInput, setShowTagInput] = useState(false);
  const [selectedType, setSelectedType] = useState(urlType);
  const [sortBy, setSortBy] = useState(urlSort || "created_at");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [searchMode, setSearchMode] = useState<"keyword" | "semantic">("keyword");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showUnfiled, setShowUnfiled] = useState(false);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimer) clearTimeout(searchTimer);
    const t = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
    setSearchTimer(t);
  };

  const filters: PromptFilters = {
    q: debouncedSearch || undefined,
    tags: selectedTags.length > 0 ? selectedTags.join(",") : undefined,
    model: selectedModel || undefined,
    status: selectedStatus || undefined,
    type: selectedType || undefined,
    folder: showUnfiled ? "unfiled" : (selectedFolder || undefined),
    sort: sortBy || undefined,
    page,
    limit: 12,
  };

  const useSemanticSearch = searchMode === "semantic" && !!debouncedSearch;

  const { data, isLoading, isError } = useQuery({
    queryKey: useSemanticSearch ? ["semantic-search", debouncedSearch, selectedStatus, selectedType] : ["prompts", filters],
    queryFn: useSemanticSearch
      ? async () => {
          const result = await api.semanticSearch(debouncedSearch, {
            status: selectedStatus || undefined,
            type: selectedType || undefined,
            limit: 24,
          });
          return {
            data: result.data,
            pagination: { page: 1, limit: result.count, total: result.count, pages: 1 },
          };
        }
      : () => api.listPrompts(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deletePrompt,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prompts"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: api.duplicatePrompt,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prompts"] }),
  });

  const favoriteMutation = useMutation({
    mutationFn: api.toggleFavorite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prompts"] }),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action, value }: { action: string; value?: string }) =>
      api.bulkAction(Array.from(selectedIds), action, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      setSelectedIds(new Set());
      setBulkMode(false);
    },
  });

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !selectedTags.includes(t)) {
      setSelectedTags([...selectedTags, t]);
      setPage(1);
    }
    setTagInput("");
    setShowTagInput(false);
  };

  const removeTag = (tag: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tag));
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setSelectedTags([]);
    setSelectedModel("");
    setSelectedStatus("");
    setSelectedType("");
    setSelectedFolder(null);
    setShowUnfiled(false);
    setPage(1);
  };

  const hasFilters = !!(debouncedSearch || selectedTags.length > 0 || selectedModel || selectedStatus || selectedType || selectedFolder || showUnfiled);

  return (
    <div className="flex gap-6">
      {/* Folder sidebar */}
      <aside className="hidden lg:block w-52 shrink-0 sticky top-20 self-start">
        <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-3 max-h-[calc(100vh-120px)] overflow-y-auto">
          <FolderTree
            selectedFolder={selectedFolder}
            onSelectFolder={(id) => { setSelectedFolder(id); setShowUnfiled(false); setPage(1); }}
            showUnfiled={showUnfiled}
            onToggleUnfiled={() => { setShowUnfiled(!showUnfiled); setSelectedFolder(null); setPage(1); }}
          />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="prompt-title text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Prompts
          </h1>
          {data && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {data.pagination.total.toLocaleString()} {data.pagination.total === 1 ? "prompt" : "prompts"}
              {hasFilters ? " matching filters" : " in your library"}
            </p>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-white dark:bg-zinc-900">
          <button
            onClick={() => setViewMode("grid")}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors
              ${viewMode === "grid"
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <GridIcon />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors
              ${viewMode === "list"
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <ListIcon />
          </button>
        </div>

        {/* Sort + Bulk toggle */}
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            className="input-base h-8 text-xs pr-6 pl-2 rounded-lg"
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium border transition-colors
              ${bulkMode
                ? "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-950/40 dark:text-primary-400 dark:border-primary-800"
                : "bg-white text-zinc-500 border-zinc-200 hover:text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 dark:hover:text-zinc-200"
              }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            {bulkMode ? `${selectedIds.size} selected` : "Select"}
          </button>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800/50 animate-fade-in">
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300 mr-2">
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => bulkMutation.mutate({ action: "favorite" })}
            className="btn-ghost text-xs py-1 px-2"
          >
            Favorite
          </button>
          <button
            onClick={() => bulkMutation.mutate({ action: "set-status", value: "archived" })}
            className="btn-ghost text-xs py-1 px-2"
          >
            Archive
          </button>
          <select
            onChange={(e) => { if (e.target.value) bulkMutation.mutate({ action: "set-type", value: e.target.value }); e.target.value = ""; }}
            className="input-base h-7 text-xs pr-6 pl-2 rounded-md"
            defaultValue=""
          >
            <option value="" disabled>Set type...</option>
            {PROMPT_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
          <div className="flex-1" />
          <button
            onClick={() => {
              if (confirm(`Delete ${selectedIds.size} prompts? This cannot be undone.`)) {
                bulkMutation.mutate({ action: "delete" });
              }
            }}
            className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 font-medium px-2 py-1"
          >
            Delete selected
          </button>
          <button
            onClick={() => { setBulkMode(false); setSelectedIds(new Set()); }}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 px-2 py-1"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <SearchIcon />
          <input
            type="search"
            placeholder={searchMode === "semantic"
              ? "Describe what you're looking for…"
              : "Search prompts by title, content, or description…"}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="input-base pl-10 pr-4 h-10 text-sm"
            aria-label="Search prompts"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); setDebouncedSearch(""); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-white dark:bg-zinc-900 shrink-0">
          <button
            onClick={() => setSearchMode("keyword")}
            className={`flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors
              ${searchMode === "keyword"
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}
            title="Keyword search — matches exact words"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
            Keyword
          </button>
          <button
            onClick={() => setSearchMode("semantic")}
            className={`flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors
              ${searchMode === "semantic"
                ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"}`}
            title="Semantic search — finds prompts by meaning, not just keywords"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
            Semantic
          </button>
        </div>
      </div>
      {searchMode === "semantic" && debouncedSearch && (
        <p className="text-xs text-primary-500 dark:text-primary-400 -mt-4">
          Searching by meaning — results ranked by similarity
        </p>
      )}

      {/* Filter bar — compact single row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 shrink-0 flex items-center gap-1.5">
          <FilterIcon />
          Filters
        </span>

        <select
          value={selectedStatus}
          onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
          className="input-base h-8 text-xs pr-6 pl-2.5 rounded-lg w-auto leading-none py-0"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <select
          value={selectedType}
          onChange={(e) => { setSelectedType(e.target.value); setPage(1); }}
          className="input-base h-8 text-xs pr-6 pl-2.5 rounded-lg w-auto leading-none py-0"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {PROMPT_TYPES.map((pt) => (
            <option key={pt.value} value={pt.value}>{pt.label}</option>
          ))}
        </select>

        <select
          value={selectedModel}
          onChange={(e) => { setSelectedModel(e.target.value); setPage(1); }}
          className="input-base h-8 text-xs pr-6 pl-2.5 rounded-lg w-auto leading-none py-0"
          aria-label="Filter by model"
        >
          <option value="">All models</option>
          {Object.entries(modelGroups).map(([provider, models]) => (
            <optgroup key={provider} label={provider}>
              {models.map((m: string) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Active tag chips */}
        {selectedTags.map((tag) => (
          <button
            key={tag}
            onClick={() => removeTag(tag)}
            className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700
                       hover:bg-primary-200 dark:bg-primary-950/60 dark:text-primary-300 dark:hover:bg-primary-950
                       transition-colors"
            aria-label={`Remove tag: ${tag}`}
          >
            {tag}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ))}

        {showTagInput ? (
          <input
            type="text"
            placeholder="Tag name…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
              if (e.key === "Escape") { setShowTagInput(false); setTagInput(""); }
            }}
            onBlur={() => { if (!tagInput) setShowTagInput(false); }}
            className="input-base w-24 h-7 py-0 text-xs"
            autoFocus
            aria-label="Add tag filter"
          />
        ) : (
          <button
            onClick={() => setShowTagInput(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-600 hover:border-zinc-400 dark:hover:text-zinc-300 dark:hover:border-zinc-500 transition-colors"
            aria-label="Add tag filter"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Tag
          </button>
        )}

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[11px] text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-0.5"
            aria-label="Clear all filters"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-100 dark:border-zinc-800/60" />

      {/* Error state */}
      {isError && (
        <div className="card p-6 text-center animate-fade-in border-red-200 dark:border-red-900/50" role="alert">
          <p className="text-sm font-medium text-red-500 dark:text-red-400">
            Failed to load prompts.
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Please refresh the page to try again.
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div
          className={viewMode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            : "flex flex-col gap-3"}
          aria-busy="true"
          aria-label="Loading prompts"
        >
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data && data.data.length === 0 && (
        <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
      )}

      {/* Results grid/list */}
      {data && data.data.length > 0 && (
        <div
          className={viewMode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            : "flex flex-col gap-3"}
        >
          {bulkMode && (
            <div className="col-span-full flex items-center gap-2 pb-1">
              <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.data.length > 0 && data.data.every(p => selectedIds.has(p.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set([...selectedIds, ...data.data.map(p => p.id)]));
                    } else {
                      const next = new Set(selectedIds);
                      data.data.forEach(p => next.delete(p.id));
                      setSelectedIds(next);
                    }
                  }}
                  className="accent-primary-600 w-3.5 h-3.5"
                />
                Select all on this page
              </label>
            </div>
          )}
          {data.data.map((prompt: any) => (
            <div key={prompt.id} className="relative">
              {useSemanticSearch && prompt.similarity != null && (
                <div className="absolute top-3 right-3 z-10 bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
                  {Math.round(prompt.similarity * 100)}% match
                </div>
              )}
              {bulkMode && (
                <div className="absolute top-3 left-3 z-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(prompt.id)}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(prompt.id);
                      else next.delete(prompt.id);
                      setSelectedIds(next);
                    }}
                    className="accent-primary-600 w-4 h-4 cursor-pointer"
                    aria-label={`Select ${prompt.title}`}
                  />
                </div>
              )}
              <PromptCard
                prompt={prompt}
              onDelete={(id) => {
                if (confirm("Delete this prompt? This action cannot be undone.")) {
                  deleteMutation.mutate(id);
                }
              }}
              onDuplicate={(id) => duplicateMutation.mutate(id)}
              onToggleFavorite={(id) => favoriteMutation.mutate(id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.pagination.pages > 1 && (
        <nav className="flex justify-center items-center gap-3 pt-2" aria-label="Pagination">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-outline px-4 py-2 text-sm disabled:opacity-40"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(data.pagination.pages, 7) }).map((_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors
                    ${page === p
                      ? "bg-primary-600 text-white"
                      : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))}
            disabled={page === data.pagination.pages}
            className="btn-outline px-4 py-2 text-sm disabled:opacity-40"
          >
            Next →
          </button>
        </nav>
      )}
      </div>
    </div>
  );
}