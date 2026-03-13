import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tagsApi } from "../api";
import { useToast } from "../components/Toast";

export default function TagManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags"],
    queryFn: tagsApi.list,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return tags;
    const q = search.toLowerCase();
    return tags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tags, search]);

  const totalTags = tags.length;
  const totalUsages = useMemo(() => tags.reduce((sum, t) => sum + t.count, 0), [tags]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    queryClient.invalidateQueries({ queryKey: ["prompts"] });
  };

  const renameMutation = useMutation({
    mutationFn: ({ oldTag, newTag }: { oldTag: string; newTag: string }) =>
      tagsApi.rename(oldTag, newTag),
    onSuccess: (data) => {
      toast(`Renamed "${data.oldTag}" to "${data.newTag}" (${data.affected} prompts)`);
      setRenamingTag(null);
      setRenameValue("");
      invalidate();
    },
    onError: (err: Error) => toast(err.message, "info"),
  });

  const removeMutation = useMutation({
    mutationFn: (tag: string) => tagsApi.remove(tag),
    onSuccess: (data) => {
      toast(`Removed "${data.tag}" from ${data.affected} prompts`);
      setConfirmDelete(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(data.tag);
        return next;
      });
      invalidate();
    },
    onError: (err: Error) => toast(err.message, "info"),
  });

  const mergeMutation = useMutation({
    mutationFn: ({ sourceTags, targetTag }: { sourceTags: string[]; targetTag: string }) =>
      tagsApi.merge(sourceTags, targetTag),
    onSuccess: (data) => {
      toast(`Merged into "${data.targetTag}" (${data.affected} prompts updated)`);
      setSelected(new Set());
      setMergeTarget("");
      invalidate();
    },
    onError: (err: Error) => toast(err.message, "info"),
  });

  const toggleSelect = (tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((t) => t.tag)));
    }
  };

  const handleRename = (tag: string) => {
    if (!renameValue.trim() || renameValue.trim().toLowerCase() === tag) return;
    renameMutation.mutate({ oldTag: tag, newTag: renameValue.trim() });
  };

  const handleMerge = () => {
    if (!mergeTarget.trim() || selected.size === 0) return;
    mergeMutation.mutate({
      sourceTags: Array.from(selected),
      targetTag: mergeTarget.trim(),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-semibold text-zinc-900 dark:text-zinc-100">
          Tag Manager
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Manage, rename, merge, and clean up tags across all prompts.
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 px-3 py-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Total tags</span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{totalTags}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 px-3 py-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Total usages</span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{totalUsages}</span>
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30 px-3 py-2">
            <span className="text-xs text-primary-600 dark:text-primary-400">Selected</span>
            <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">{selected.size}</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter tags..."
          className="input-base w-full text-sm"
        />
      </div>

      {/* Tag list */}
      <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {/* Select all header */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-t-xl">
            <input
              type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
              className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 text-primary-500 focus:ring-primary-500"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {filtered.length} tag{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            {search ? "No tags match your filter." : "No tags found."}
          </div>
        )}

        {filtered.map((t) => (
          <div
            key={t.tag}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.has(t.tag)}
              onChange={() => toggleSelect(t.tag)}
              className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 text-primary-500 focus:ring-primary-500"
            />

            {renamingTag === t.tag ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(t.tag);
                    if (e.key === "Escape") {
                      setRenamingTag(null);
                      setRenameValue("");
                    }
                  }}
                  className="input-base text-xs flex-1"
                  autoFocus
                  placeholder="New tag name..."
                />
                <button
                  onClick={() => handleRename(t.tag)}
                  disabled={renameMutation.isPending || !renameValue.trim()}
                  className="btn-primary py-1 px-2.5 text-xs"
                >
                  {renameMutation.isPending ? "..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setRenamingTag(null);
                    setRenameValue("");
                  }}
                  className="btn-ghost py-1 px-2.5 text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <span className="tag-primary text-xs">{t.tag}</span>
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 tabular-nums">
                  {t.count}
                </span>
                <div className="flex-1" />

                {confirmDelete === t.tag ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Delete?</span>
                    <button
                      onClick={() => removeMutation.mutate(t.tag)}
                      disabled={removeMutation.isPending}
                      className="rounded-md px-2 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      {removeMutation.isPending ? "..." : "Yes"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setRenamingTag(t.tag);
                        setRenameValue(t.tag);
                      }}
                      className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => setConfirmDelete(t.tag)}
                      className="rounded-md px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Merge bar */}
      {selected.size >= 2 && (
        <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-zinc-900 shadow-lg px-4 py-3 animate-fade-in">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 shrink-0">
            Merge {selected.size} tags into:
          </span>
          <input
            type="text"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleMerge();
            }}
            placeholder="Target tag name..."
            className="input-base text-xs flex-1"
          />
          <button
            onClick={handleMerge}
            disabled={mergeMutation.isPending || !mergeTarget.trim()}
            className="btn-primary py-1.5 px-3 text-xs shrink-0"
          >
            {mergeMutation.isPending ? "Merging..." : "Merge Selected"}
          </button>
          <button
            onClick={() => {
              setSelected(new Set());
              setMergeTarget("");
            }}
            className="btn-ghost py-1.5 px-3 text-xs shrink-0"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
