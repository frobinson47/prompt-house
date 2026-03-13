import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import PromptCard from "../components/PromptCard";

function SearchIcon() {
  return (
    <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-none">{value}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");

  // Stats
  const { data: typeCounts } = useQuery({
    queryKey: ["type-counts"],
    queryFn: () => api.getTypeCounts(),
    staleTime: 60_000,
  });

  // Recently edited
  const { data: recentData } = useQuery({
    queryKey: ["prompts", { sort: "updated_at", limit: 6 }],
    queryFn: () => api.listPrompts({ sort: "updated_at", order: "desc", limit: 6 }),
    staleTime: 30_000,
  });

  // Favorites
  const { data: favData } = useQuery({
    queryKey: ["prompts", { sort: "favorites", limit: 6 }],
    queryFn: () => api.listPrompts({ sort: "favorites", limit: 6 }),
    staleTime: 30_000,
  });

  // Embedding status
  const { data: embeddingStatus } = useQuery({
    queryKey: ["embedding-status"],
    queryFn: () => api.getEmbeddingStatus(),
    staleTime: 60_000,
  });

  const totalPrompts = typeCounts?.reduce((sum, t) => sum + t.count, 0) ?? 0;
  const typeCount = typeCounts?.length ?? 0;
  const favorites = favData?.data.filter(p => p.isFavorite) ?? [];
  const embedded = Number(embeddingStatus?.embedded ?? 0);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      navigate(`/prompts?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  // Pick a random prompt for discovery
  const [randomPrompt, setRandomPrompt] = useState<any>(null);
  const { data: allData } = useQuery({
    queryKey: ["prompts", { limit: 100 }],
    queryFn: () => api.listPrompts({ limit: 100 }),
    staleTime: 120_000,
  });
  useEffect(() => {
    if (allData?.data && allData.data.length > 0 && !randomPrompt) {
      const nonFav = allData.data.filter(p => !p.isFavorite);
      const pool = nonFav.length > 0 ? nonFav : allData.data;
      setRandomPrompt(pool[Math.floor(Math.random() * pool.length)]);
    }
  }, [allData]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero search */}
      <div className="text-center space-y-4 pt-6 pb-2">
        <h1 className="font-serif text-4xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Your Prompt Library
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {totalPrompts} prompts — search, browse, or discover something new
        </p>
        <form onSubmit={handleSearch} className="relative max-w-lg mx-auto">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search your prompts..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="input-base pl-12 pr-4 h-12 text-base rounded-xl shadow-sm"
            aria-label="Search prompts"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-6 items-center rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1.5 text-[10px] font-medium text-zinc-400">
            Enter
          </kbd>
        </form>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total prompts"
          value={totalPrompts}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
        />
        <StatCard
          label="Types"
          value={typeCount}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>}
        />
        <StatCard
          label="Favorites"
          value={favorites.length}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
        />
        <StatCard
          label="Indexed for AI search"
          value={embedded}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>}
        />
      </div>

      {/* Type distribution */}
      {typeCounts && typeCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {typeCounts.map((t) => (
            <Link
              key={t.type}
              to={`/prompts?type=${t.type}`}
              viewTransition
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:border-primary-300 dark:hover:border-primary-700 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <span className="capitalize">{t.type}</span>
              <span className="text-zinc-400 dark:text-zinc-600 tabular-nums">{t.count}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Favorites section */}
      {favorites.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Favorites
            </h2>
            <Link to="/prompts?sort=favorites" viewTransition className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {favorites.slice(0, 3).map((prompt) => (
              <PromptCard key={prompt.id} prompt={prompt} />
            ))}
          </div>
        </section>
      )}

      {/* Recently edited */}
      {recentData && recentData.data.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              Recently Edited
            </h2>
            <Link to="/prompts?sort=updated_at" viewTransition className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentData.data.slice(0, 6).map((prompt) => (
              <PromptCard key={prompt.id} prompt={prompt} />
            ))}
          </div>
        </section>
      )}

      {/* Discover */}
      {randomPrompt && (
        <section className="card p-5 bg-gradient-to-br from-primary-50/60 to-amber-50/40 dark:from-primary-950/20 dark:to-amber-950/10 border-primary-100 dark:border-primary-900/30">
          <div className="flex items-center gap-2 mb-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-500">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
            </svg>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              Discover
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1">
              Try a prompt you haven't used in a while
            </span>
          </div>
          <Link
            to={`/prompts/${randomPrompt.id}`}
            viewTransition
            className="block rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
          >
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{randomPrompt.title}</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">
              {randomPrompt.description || randomPrompt.content.slice(0, 200)}
            </p>
            <div className="flex items-center gap-2 mt-2">
              {randomPrompt.promptType && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">
                  {randomPrompt.promptType}
                </span>
              )}
              {randomPrompt.tags?.slice(0, 3).map((tag: string) => (
                <span key={tag} className="text-[10px] text-zinc-400 dark:text-zinc-600">#{tag}</span>
              ))}
            </div>
          </Link>
        </section>
      )}

      {/* Browse all link */}
      <div className="text-center py-4">
        <Link to="/prompts" viewTransition className="btn-outline px-6 py-2.5 text-sm">
          Browse all prompts
        </Link>
      </div>
    </div>
  );
}
