import { Routes, Route, Link, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import PromptList from "./pages/PromptList";
import PromptDetail from "./pages/PromptDetail";
import PromptFormPage from "./pages/PromptFormPage";
import Settings from "./pages/Settings";
import Playground from "./pages/Playground";
import GraphView from "./pages/GraphView";
import TagManager from "./pages/TagManager";
import ThemeToggle from "./components/ThemeToggle";
import { useAuth } from "./hooks/useAuth";

function LogoIcon() {
  return (
    <img src="/prompt_house_logo.png" alt="" aria-hidden="true" width="22" height="22" className="rounded" />
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PlayNavIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function GraphNavIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" />
      <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" /><line x1="15.5" y1="7.5" x2="8.5" y2="16.5" />
    </svg>
  );
}

function UserMenu({ user, onLogout }: { user: { name: string; email: string }; onLogout: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        to="/tags"
        viewTransition
        title="Tag Manager"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium
                   text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      </Link>
      <Link
        to="/graph"
        viewTransition
        title="Graph View"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium
                   text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80 transition-colors"
      >
        <GraphNavIcon />
      </Link>
      <Link
        to="/playground"
        viewTransition
        title="Playground"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium
                   text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80 transition-colors"
      >
        <PlayNavIcon />
      </Link>
      <Link
        to="/settings"
        viewTransition
        title="Settings"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium
                   text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/80 transition-colors"
      >
        <GearIcon />
      </Link>
      <div className="flex items-center gap-1.5 rounded-lg px-2.5 h-8">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 text-[10px] font-bold uppercase">
          {user.name.charAt(0)}
        </div>
        <span className="hidden sm:inline text-xs font-medium text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate">
          {user.name}
        </span>
      </div>
      <button
        onClick={onLogout}
        title="Sign out"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium
                   text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100
                   dark:text-zinc-600 dark:hover:text-zinc-300 dark:hover:bg-zinc-800/80 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const location = useLocation();
  const isNewPrompt = location.pathname === "/prompts/new";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/92 dark:bg-zinc-950/92 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div className="gradient-bar" />
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 h-14">
          <Link to="/" viewTransition className="flex items-center gap-3 group" aria-label="Prompt House — home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-shadow">
              <LogoIcon />
            </span>
            <span className="font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight text-xl">
              Prompt House
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />

            {loading ? (
              <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
            ) : user ? (
              <>
                <UserMenu user={user} onLogout={logout} />
                <Link
                  to="/prompts/new"
                  viewTransition
                  className={`btn-primary h-8 px-3 text-sm ${isNewPrompt ? "opacity-60 pointer-events-none" : ""}`}
                  aria-disabled={isNewPrompt}
                >
                  <PlusIcon />
                  <span className="hidden sm:inline">New Prompt</span>
                  <span className="sm:hidden">New</span>
                </Link>
              </>
            ) : (
              <button
                onClick={() => login(location.pathname)}
                className="btn-primary h-8 px-3 text-sm"
              >
                <UserIcon />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/prompts" element={<PromptList />} />
          <Route path="/prompts/new" element={<PromptFormPage />} />
          <Route path="/prompts/:id" element={<PromptDetail />} />
          <Route path="/prompts/:id/edit" element={<PromptFormPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/graph" element={<GraphView />} />
          <Route path="/tags" element={<TagManager />} />
        </Routes>
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800/60 mt-16">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <span className="text-xs text-zinc-400 dark:text-zinc-600">Prompt House</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-600">Your AI prompt library</span>
        </div>
      </footer>
    </div>
  );
}
