import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { folderApi, type Folder } from "../api";
import { useToast } from "./Toast";

interface FolderNode extends Folder {
  children: FolderNode[];
}

function buildTree(folders: Folder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];

  for (const f of folders) {
    map.set(f.id, { ...f, children: [] });
  }
  for (const f of folders) {
    const node = map.get(f.id)!;
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by position
  const sortChildren = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortChildren(n.children));
  };
  sortChildren(roots);
  return roots;
}

function FolderIcon({ open }: { open?: boolean }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

interface TreeNodeProps {
  node: FolderNode;
  depth: number;
  selectedFolder: string | null;
  onSelect: (id: string | null) => void;
  expandedFolders: Set<string>;
  onToggleExpand: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onCreateChild: (parentId: string) => void;
}

function TreeNode({ node, depth, selectedFolder, onSelect, expandedFolders, onToggleExpand, onRename, onDelete, onCreateChild }: TreeNodeProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [showMenu, setShowMenu] = useState(false);
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedFolder === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1 px-2 rounded-lg cursor-pointer text-[12px] transition-colors
          ${isSelected
            ? "bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-400 font-medium"
            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(isSelected ? null : node.id)}
        onContextMenu={(e) => { e.preventDefault(); setShowMenu(!showMenu); }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
            className="shrink-0 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <ChevronIcon expanded={isExpanded} />
          </button>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        <FolderIcon open={isExpanded && hasChildren} />

        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => { if (renameValue.trim()) onRename(node.id, renameValue.trim()); setIsRenaming(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { if (renameValue.trim()) onRename(node.id, renameValue.trim()); setIsRenaming(false); }
              if (e.key === "Escape") { setRenameValue(node.name); setIsRenaming(false); }
            }}
            className="flex-1 bg-transparent outline-none text-[12px] border-b border-primary-300 dark:border-primary-700 min-w-0"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate flex-1">{node.name}</span>
        )}

        <span className="text-[10px] text-zinc-400 dark:text-zinc-600 tabular-nums shrink-0">
          {node.prompt_count > 0 ? node.prompt_count : ""}
        </span>

        {/* Inline actions */}
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onCreateChild(node.id); }}
            title="New subfolder"
            className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(node.name); }}
            title="Rename"
            className="p-0.5 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm(`Delete folder "${node.name}"? Prompts inside will be unfiled.`)) onDelete(node.id); }}
            title="Delete"
            className="p-0.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
          </button>
        </div>
      </div>

      {isExpanded && node.children.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedFolder={selectedFolder}
          onSelect={onSelect}
          expandedFolders={expandedFolders}
          onToggleExpand={onToggleExpand}
          onRename={onRename}
          onDelete={onDelete}
          onCreateChild={onCreateChild}
        />
      ))}
    </div>
  );
}

interface Props {
  selectedFolder: string | null;
  onSelectFolder: (id: string | null) => void;
  showUnfiled: boolean;
  onToggleUnfiled: () => void;
}

export default function FolderTree({ selectedFolder, onSelectFolder, showUnfiled, onToggleUnfiled }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createParent, setCreateParent] = useState<string | undefined>(undefined);

  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: () => folderApi.list(),
  });

  const tree = buildTree(folders);
  const totalPrompts = folders.reduce((sum, f) => sum + f.prompt_count, 0);

  const createMutation = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string }) =>
      folderApi.create(name, parentId),
    onSuccess: (folder) => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      toast(`Created folder "${folder.name}"`);
      setIsCreating(false);
      setNewFolderName("");
      setCreateParent(undefined);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => folderApi.update(id, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["folders"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => folderApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      if (selectedFolder) onSelectFolder(null);
      toast("Folder deleted");
    },
  });

  const toggleExpand = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreateChild = (parentId: string) => {
    setCreateParent(parentId);
    setIsCreating(true);
    setNewFolderName("");
    if (!expandedFolders.has(parentId)) {
      setExpandedFolders((prev) => new Set([...prev, parentId]));
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
          Folders
        </span>
        <button
          onClick={() => { setIsCreating(!isCreating); setCreateParent(undefined); setNewFolderName(""); }}
          title="New folder"
          className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>

      {/* All Prompts */}
      <button
        onClick={() => onSelectFolder(null)}
        className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-[12px] transition-colors
          ${!selectedFolder && !showUnfiled
            ? "bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-400 font-medium"
            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
        <span className="flex-1 text-left">All Prompts</span>
      </button>

      {/* Unfiled */}
      <button
        onClick={onToggleUnfiled}
        className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-[12px] transition-colors
          ${showUnfiled
            ? "bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-400 font-medium"
            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        </svg>
        <span className="flex-1 text-left">Unfiled</span>
      </button>

      {/* New folder input */}
      {isCreating && (
        <div className="flex items-center gap-1.5 px-2 py-1" style={{ paddingLeft: createParent ? "32px" : "8px" }}>
          <FolderIcon />
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim()) createMutation.mutate({ name: newFolderName.trim(), parentId: createParent });
              if (e.key === "Escape") { setIsCreating(false); setNewFolderName(""); }
            }}
            onBlur={() => {
              if (newFolderName.trim()) createMutation.mutate({ name: newFolderName.trim(), parentId: createParent });
              else { setIsCreating(false); setNewFolderName(""); }
            }}
            placeholder="Folder name..."
            className="flex-1 bg-transparent outline-none text-[12px] border-b border-primary-300 dark:border-primary-700 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 min-w-0"
            autoFocus
          />
        </div>
      )}

      {/* Folder tree */}
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedFolder={selectedFolder}
          onSelect={onSelectFolder}
          expandedFolders={expandedFolders}
          onToggleExpand={toggleExpand}
          onRename={(id, name) => renameMutation.mutate({ id, name })}
          onDelete={(id) => deleteMutation.mutate(id)}
          onCreateChild={handleCreateChild}
        />
      ))}
    </div>
  );
}
