import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface GraphPrompt {
  id: string;
  title: string;
  tags: string[] | null;
  model_compatibility: string[] | null;
  status: string;
  prompt_type: string | null;
  is_favorite: boolean;
  folder_id: string | null;
  folder_name: string | null;
}

interface Node {
  id: string;
  title: string;
  type: string | null;
  status: string;
  folder: string | null;
  folderId: string | null;
  tags: string[];
  models: string[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
}

interface Edge {
  source: number;
  target: number;
  weight: number;
  reason: string;
}

const TYPE_COLORS: Record<string, string> = {
  task: "#6366f1",
  agent: "#8b5cf6",
  chat: "#06b6d4",
  coding: "#10b981",
  creative: "#f59e0b",
  analysis: "#ef4444",
  system: "#ec4899",
  template: "#64748b",
};

const STATUS_OPACITY: Record<string, number> = {
  active: 1,
  draft: 0.7,
  archived: 0.4,
  deprecated: 0.3,
};

function getTypeColor(type: string | null): string {
  return TYPE_COLORS[type ?? "task"] ?? "#94a3b8";
}

function buildGraph(prompts: GraphPrompt[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = prompts.map((p) => ({
    id: p.id,
    title: p.title,
    type: p.prompt_type,
    status: p.status,
    folder: p.folder_name,
    folderId: p.folder_id,
    tags: p.tags ?? [],
    models: p.model_compatibility ?? [],
    x: Math.random() * 800 - 400,
    y: Math.random() * 600 - 300,
    vx: 0,
    vy: 0,
    radius: 6 + Math.min((p.tags?.length ?? 0) + (p.model_compatibility?.length ?? 0), 8) * 1.5,
    pinned: false,
  }));

  const edges: Edge[] = [];
  const idxMap = new Map(nodes.map((n, i) => [n.id, i]));

  // Build tag index
  const tagIndex = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    n.tags.forEach((t) => {
      if (!tagIndex.has(t)) tagIndex.set(t, []);
      tagIndex.get(t)!.push(i);
    });
  });

  // Build folder index
  const folderIndex = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (n.folderId) {
      if (!folderIndex.has(n.folderId)) folderIndex.set(n.folderId, []);
      folderIndex.get(n.folderId)!.push(i);
    }
  });

  // Build model index
  const modelIndex = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    n.models.forEach((m) => {
      if (!modelIndex.has(m)) modelIndex.set(m, []);
      modelIndex.get(m)!.push(i);
    });
  });

  // Track edge pairs to avoid duplicates and accumulate weight
  const edgeMap = new Map<string, { source: number; target: number; weight: number; reasons: Set<string> }>();

  function addEdge(a: number, b: number, weight: number, reason: string) {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const src = a < b ? a : b;
    const tgt = a < b ? b : a;
    if (edgeMap.has(key)) {
      const e = edgeMap.get(key)!;
      e.weight += weight;
      e.reasons.add(reason);
    } else {
      edgeMap.set(key, { source: src, target: tgt, weight, reasons: new Set([reason]) });
    }
  }

  // Shared tags (strong connection)
  tagIndex.forEach((indices, tag) => {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        addEdge(indices[i], indices[j], 2, `tag: ${tag}`);
      }
    }
  });

  // Same folder (medium connection)
  folderIndex.forEach((indices) => {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        addEdge(indices[i], indices[j], 1.5, "same folder");
      }
    }
  });

  // Same type (weak connection — only connect if also share something else, or limit)
  const typeIndex = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const t = n.type ?? "task";
    if (!typeIndex.has(t)) typeIndex.set(t, []);
    typeIndex.get(t)!.push(i);
  });
  typeIndex.forEach((indices) => {
    // Only add type edges if group is small enough to not be noise
    if (indices.length <= 12) {
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          addEdge(indices[i], indices[j], 0.5, "same type");
        }
      }
    }
  });

  // Shared models (medium connection)
  modelIndex.forEach((indices, model) => {
    if (indices.length <= 20) {
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          addEdge(indices[i], indices[j], 1, `model: ${model}`);
        }
      }
    }
  });

  edgeMap.forEach((e) => {
    edges.push({
      source: e.source,
      target: e.target,
      weight: e.weight,
      reason: [...e.reasons].join(", "),
    });
  });

  return { nodes, edges };
}

// Force simulation
function simulate(nodes: Node[], edges: Edge[], alpha: number) {
  const k = 60; // Ideal spring length
  const repulsion = 3000;
  const damping = 0.85;

  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].pinned) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = repulsion / (dist * dist);
      const fx = (dx / dist) * force * alpha;
      const fy = (dy / dist) * force * alpha;
      if (!nodes[i].pinned) { nodes[i].vx += fx; nodes[i].vy += fy; }
      if (!nodes[j].pinned) { nodes[j].vx -= fx; nodes[j].vy -= fy; }
    }
  }

  // Attraction along edges
  for (const edge of edges) {
    const a = nodes[edge.source];
    const b = nodes[edge.target];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - k) * 0.01 * edge.weight * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }

  // Center gravity
  for (const node of nodes) {
    if (node.pinned) continue;
    node.vx -= node.x * 0.001 * alpha;
    node.vy -= node.y * 0.001 * alpha;
  }

  // Apply velocities with damping
  for (const node of nodes) {
    if (node.pinned) continue;
    node.vx *= damping;
    node.vy *= damping;
    node.x += node.vx;
    node.y += node.vy;
  }
}

export default function GraphView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const animRef = useRef<number>(0);
  const alphaRef = useRef(1);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef(transform);
  const dragRef = useRef<{ nodeIdx: number; offsetX: number; offsetY: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<"all" | "tags" | "folder" | "type" | "model">("all");

  useEffect(() => { transformRef.current = transform; }, [transform]);

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ["graph-prompts"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/prompts/graph`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<GraphPrompt[]>;
    },
  });

  // Build graph when data arrives
  useEffect(() => {
    if (prompts.length === 0) return;
    const { nodes, edges } = buildGraph(prompts);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    alphaRef.current = 1;
  }, [prompts]);

  // Filter edges by linkMode
  const getVisibleEdges = useCallback(() => {
    if (linkMode === "all") return edgesRef.current;
    return edgesRef.current.filter((e) => {
      if (linkMode === "tags") return e.reason.includes("tag:");
      if (linkMode === "folder") return e.reason.includes("same folder");
      if (linkMode === "type") return e.reason.includes("same type");
      if (linkMode === "model") return e.reason.includes("model:");
      return true;
    });
  }, [linkMode]);

  // Canvas rendering + simulation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.parentElement!.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      const nodes = nodesRef.current;
      const edges = getVisibleEdges();
      const t = transformRef.current;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;

      // Simulate
      if (alphaRef.current > 0.001) {
        simulate(nodes, edgesRef.current, alphaRef.current);
        alphaRef.current *= 0.995;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + t.x, h / 2 + t.y);
      ctx.scale(t.scale, t.scale);

      // Draw edges
      ctx.lineWidth = 0.5;
      for (const edge of edges) {
        const a = nodes[edge.source];
        const b = nodes[edge.target];
        if (!a || !b) continue;

        // Filter by selected type
        if (selectedType && a.type !== selectedType && b.type !== selectedType) continue;

        const alpha = Math.min(edge.weight / 4, 0.6);
        ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        const dimmed = selectedType && node.type !== selectedType;
        const opacity = (STATUS_OPACITY[node.status] ?? 1) * (dimmed ? 0.15 : 1);
        const color = getTypeColor(node.type);

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.fill();

        // Border
        ctx.strokeStyle = dimmed ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.8)";
        ctx.lineWidth = dimmed ? 0.5 : 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [prompts, selectedType, getVisibleEdges]);

  // Mouse interaction
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const canvas = canvasRef.current!;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const t = transformRef.current;
    return {
      x: (sx - w / 2 - t.x) / t.scale,
      y: (sy - h / 2 - t.y) / t.scale,
    };
  }, []);

  const findNode = useCallback((wx: number, wy: number): number => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const dx = wx - nodes[i].x;
      const dy = wy - nodes[i].y;
      if (dx * dx + dy * dy <= (nodes[i].radius + 4) * (nodes[i].radius + 4)) return i;
    }
    return -1;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: wx, y: wy } = screenToWorld(sx, sy);
    const idx = findNode(wx, wy);

    if (idx >= 0) {
      dragRef.current = { nodeIdx: idx, offsetX: wx - nodesRef.current[idx].x, offsetY: wy - nodesRef.current[idx].y };
      nodesRef.current[idx].pinned = true;
      alphaRef.current = Math.max(alphaRef.current, 0.3);
    } else {
      panRef.current = { startX: e.clientX, startY: e.clientY, tx: transformRef.current.x, ty: transformRef.current.y };
    }
  }, [screenToWorld, findNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragRef.current) {
      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const node = nodesRef.current[dragRef.current.nodeIdx];
      node.x = wx - dragRef.current.offsetX;
      node.y = wy - dragRef.current.offsetY;
      alphaRef.current = Math.max(alphaRef.current, 0.1);
      return;
    }

    if (panRef.current) {
      setTransform((prev) => ({
        ...prev,
        x: panRef.current!.tx + (e.clientX - panRef.current!.startX),
        y: panRef.current!.ty + (e.clientY - panRef.current!.startY),
      }));
      return;
    }

    // Hover detection
    const { x: wx, y: wy } = screenToWorld(sx, sy);
    const idx = findNode(wx, wy);
    setHoveredNode(idx >= 0 ? nodesRef.current[idx] : null);
  }, [screenToWorld, findNode]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      nodesRef.current[dragRef.current.nodeIdx].pinned = false;
      dragRef.current = null;
    }
    panRef.current = null;
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { x: wx, y: wy } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const idx = findNode(wx, wy);
    if (idx >= 0) navigate(`/prompts/${nodesRef.current[idx].id}`);
  }, [screenToWorld, findNode, navigate]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale * scaleFactor)),
    }));
  }, []);

  // Collect unique types for legend
  const types = [...new Set(prompts.map((p) => p.prompt_type ?? "task"))].sort();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm text-zinc-400 animate-pulse">Loading graph data...</div>
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-sm text-zinc-500">No prompts to visualize.</p>
        <Link to="/prompts" className="btn-ghost text-sm">Go to prompts</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Graph View</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {prompts.length} prompts · {edgesRef.current.length} connections · Double-click to open · Scroll to zoom · Drag to pan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={linkMode}
            onChange={(e) => setLinkMode(e.target.value as any)}
            className="text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-zinc-700 dark:text-zinc-300"
          >
            <option value="all">All connections</option>
            <option value="tags">Tags only</option>
            <option value="folder">Folders only</option>
            <option value="type">Types only</option>
            <option value="model">Models only</option>
          </select>
          <button
            onClick={() => { alphaRef.current = 1; }}
            className="btn-ghost text-xs py-1.5 px-2.5"
          >
            Re-layout
          </button>
          <button
            onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
            className="btn-ghost text-xs py-1.5 px-2.5"
          >
            Reset view
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">Type:</span>
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setSelectedType(selectedType === t ? null : t)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all
              ${selectedType === t
                ? "border-zinc-400 dark:border-zinc-500 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                : selectedType
                  ? "border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300"
              }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: getTypeColor(t) }}
            />
            {t}
          </button>
        ))}
        {selectedType && (
          <button
            onClick={() => setSelectedType(null)}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 underline"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Canvas */}
      <div className="relative card overflow-hidden" style={{ height: "calc(100vh - 280px)", minHeight: "400px" }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
        />

        {/* Hover tooltip */}
        {hoveredNode && (
          <div className="absolute top-4 right-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg p-3 min-w-[180px] max-w-[260px] pointer-events-none z-10 animate-fade-in">
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">{hoveredNode.title}</p>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: getTypeColor(hoveredNode.type) }}
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{hoveredNode.type ?? "task"}</span>
              </div>
              {hoveredNode.folder && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium">Folder:</span> {hoveredNode.folder}
                </p>
              )}
              {hoveredNode.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {hoveredNode.tags.slice(0, 5).map((t) => (
                    <span key={t} className="inline-block rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {t}
                    </span>
                  ))}
                  {hoveredNode.tags.length > 5 && (
                    <span className="text-[10px] text-zinc-400">+{hoveredNode.tags.length - 5}</span>
                  )}
                </div>
              )}
            </div>
            <p className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-600">Double-click to open</p>
          </div>
        )}
      </div>
    </div>
  );
}
