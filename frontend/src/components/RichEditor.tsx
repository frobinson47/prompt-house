import { useState, useRef, useCallback, useEffect, useMemo } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
}

// Tokenize a line into styled spans
function tokenizeLine(line: string): { text: string; cls: string }[] {
  const tokens: { text: string; cls: string }[] = [];
  let i = 0;
  while (i < line.length) {
    // {{variable}}
    if (line[i] === "{" && line[i + 1] === "{") {
      const end = line.indexOf("}}", i + 2);
      if (end !== -1) {
        tokens.push({ text: line.slice(i, end + 2), cls: "re-var" });
        i = end + 2;
        continue;
      }
    }
    // Markdown headers at start
    if (i === 0 && line.match(/^#{1,6}\s/)) {
      const m = line.match(/^(#{1,6}\s)/)!;
      tokens.push({ text: m[1], cls: "re-heading" });
      tokens.push({ text: line.slice(m[1].length), cls: "re-heading-text" });
      return tokens;
    }
    // Code block fence
    if (i === 0 && line.match(/^```/)) {
      tokens.push({ text: line, cls: "re-fence" });
      return tokens;
    }
    // XML-like tags <tag> </tag>
    if (line[i] === "<") {
      const m = line.slice(i).match(/^<\/?[a-zA-Z][a-zA-Z0-9_-]*[^>]*>/);
      if (m) {
        tokens.push({ text: m[0], cls: "re-tag" });
        i += m[0].length;
        continue;
      }
    }
    // Bold **text**
    if (line[i] === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end !== -1) {
        tokens.push({ text: line.slice(i, end + 2), cls: "re-bold" });
        i = end + 2;
        continue;
      }
    }
    // Inline code `text`
    if (line[i] === "`" && line[i + 1] !== "`") {
      const end = line.indexOf("`", i + 1);
      if (end !== -1) {
        tokens.push({ text: line.slice(i, end + 1), cls: "re-code" });
        i = end + 1;
        continue;
      }
    }
    // Plain text — accumulate until next special char
    let j = i + 1;
    while (j < line.length && !"{<*`".includes(line[j])) j++;
    tokens.push({ text: line.slice(i, j), cls: "" });
    i = j;
  }
  if (tokens.length === 0) tokens.push({ text: "", cls: "" });
  return tokens;
}

function HighlightedOverlay({ value, scrollTop, scrollLeft }: { value: string; scrollTop: number; scrollLeft: number }) {
  const lines = value.split("\n");
  return (
    <div
      className="re-overlay"
      style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
    >
      {lines.map((line, i) => (
        <div key={i} className="re-line">
          {tokenizeLine(line).map((tok, j) => (
            tok.cls ? <span key={j} className={tok.cls}>{tok.text || " "}</span> : <span key={j}>{tok.text || " "}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function LineNumbers({ count, scrollTop }: { count: number; scrollTop: number }) {
  return (
    <div
      className="re-gutter"
      style={{ transform: `translateY(${-scrollTop}px)` }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="re-line-num">{i + 1}</div>
      ))}
    </div>
  );
}

// Markdown preview
function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => {
    let result = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code blocks
    result = result.replace(/```(\w*)\n([\s\S]*?)```/g,
      '<pre class="re-preview-code"><code>$2</code></pre>');

    // Headers
    result = result.replace(/^######\s+(.+)$/gm, '<h6 class="re-preview-h6">$1</h6>');
    result = result.replace(/^#####\s+(.+)$/gm, '<h5 class="re-preview-h5">$1</h5>');
    result = result.replace(/^####\s+(.+)$/gm, '<h4 class="re-preview-h4">$1</h4>');
    result = result.replace(/^###\s+(.+)$/gm, '<h3 class="re-preview-h3">$1</h3>');
    result = result.replace(/^##\s+(.+)$/gm, '<h2 class="re-preview-h2">$1</h2>');
    result = result.replace(/^#\s+(.+)$/gm, '<h1 class="re-preview-h1">$1</h1>');

    // Bold & italic
    result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Inline code
    result = result.replace(/`([^`]+)`/g, '<code class="re-preview-inline-code">$1</code>');

    // Variables
    result = result.replace(/\{\{(\w+)\}\}/g, '<span class="re-preview-var">{{$1}}</span>');

    // Lists
    result = result.replace(/^[-*]\s+(.+)$/gm, '<li class="re-preview-li">$1</li>');
    result = result.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="re-preview-li">$2</li>');

    // Paragraphs (double newline)
    result = result.replace(/\n\n/g, '</p><p class="re-preview-p">');

    // Single newlines → <br>
    result = result.replace(/\n/g, '<br/>');

    return `<p class="re-preview-p">${result}</p>`;
  }, [content]);

  return (
    <div
      className="re-preview prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Find & Replace bar
function FindBar({
  value,
  onReplace,
  onClose,
  textareaRef,
}: {
  value: string;
  onReplace: (newValue: string) => void;
  onClose: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!find) { setMatchCount(0); return; }
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = value.match(regex);
    setMatchCount(matches?.length ?? 0);
    setCurrentMatch(0);
  }, [find, value]);

  const goToMatch = useCallback((idx: number) => {
    if (!find || !textareaRef.current) return;
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let match;
    let i = 0;
    while ((match = regex.exec(value)) !== null) {
      if (i === idx) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(match.index, match.index + match[0].length);
        break;
      }
      i++;
    }
  }, [find, value, textareaRef]);

  const handleNext = () => {
    const next = (currentMatch + 1) % matchCount;
    setCurrentMatch(next);
    goToMatch(next);
  };

  const handlePrev = () => {
    const prev = (currentMatch - 1 + matchCount) % matchCount;
    setCurrentMatch(prev);
    goToMatch(prev);
  };

  const handleReplace = () => {
    if (!find) return;
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    onReplace(value.replace(regex, replace));
  };

  const handleReplaceAll = () => {
    if (!find) return;
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    onReplace(value.replace(regex, replace));
  };

  return (
    <div className="re-find-bar">
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <input
          ref={findRef}
          type="text"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNext();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Find..."
          className="re-find-input flex-1 min-w-0"
        />
        <span className="text-[10px] text-zinc-400 tabular-nums shrink-0 w-12 text-center">
          {find ? `${matchCount > 0 ? currentMatch + 1 : 0}/${matchCount}` : ""}
        </span>
        <button onClick={handlePrev} disabled={matchCount === 0} className="re-find-btn" title="Previous">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
        </button>
        <button onClick={handleNext} disabled={matchCount === 0} className="re-find-btn" title="Next">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <input
          type="text"
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          placeholder="Replace..."
          className="re-find-input w-32"
        />
        <button onClick={handleReplace} disabled={matchCount === 0} className="re-find-btn text-[10px] px-1.5" title="Replace">
          Replace
        </button>
        <button onClick={handleReplaceAll} disabled={matchCount === 0} className="re-find-btn text-[10px] px-1.5" title="Replace all">
          All
        </button>
      </div>
      <button onClick={onClose} className="re-find-btn" title="Close">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}

export default function RichEditor({ value, onChange, placeholder, minRows = 10 }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);

  const lineCount = value.split("\n").length;
  const wordCount = value.split(/\s+/).filter(Boolean).length;
  const charCount = value.length;

  // Detect variables
  const variables = useMemo(() => {
    const matches = value.match(/\{\{(\w+)\}\}/g) ?? [];
    return [...new Set(matches)];
  }, [value]);

  const handleScroll = useCallback(() => {
    if (!textareaRef.current) return;
    setScrollTop(textareaRef.current.scrollTop);
    setScrollLeft(textareaRef.current.scrollLeft);
  }, []);

  // Tab/Shift+Tab handling
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = textareaRef.current!;

    // Ctrl+F / Cmd+F → open find
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      setShowFind(true);
      return;
    }

    if (e.key === "Escape" && showFind) {
      setShowFind(false);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;

      if (start === end) {
        // Single cursor — insert 2 spaces
        const before = value.slice(0, start);
        const after = value.slice(end);
        onChange(before + "  " + after);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      } else {
        // Selection — indent/dedent lines
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = value.indexOf("\n", end);
        const endPos = lineEnd === -1 ? value.length : lineEnd;
        const selectedLines = value.slice(lineStart, endPos);

        let newLines: string;
        if (e.shiftKey) {
          newLines = selectedLines.split("\n").map((l) => l.startsWith("  ") ? l.slice(2) : l).join("\n");
        } else {
          newLines = selectedLines.split("\n").map((l) => "  " + l).join("\n");
        }

        onChange(value.slice(0, lineStart) + newLines + value.slice(endPos));
        requestAnimationFrame(() => {
          ta.selectionStart = lineStart;
          ta.selectionEnd = lineStart + newLines.length;
        });
      }
    }
  }, [value, onChange, showFind]);

  return (
    <div className="re-container">
      {/* Toolbar */}
      <div className="re-toolbar">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className={`re-tab ${!showPreview ? "re-tab-active" : ""}`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className={`re-tab ${showPreview ? "re-tab-active" : ""}`}
          >
            Preview
          </button>
        </div>
        <div className="flex items-center gap-2">
          {variables.length > 0 && (
            <span className="text-[10px] text-primary-500 dark:text-primary-400 font-medium">
              {variables.length} var{variables.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => setWordWrap((w) => !w)}
            className={`re-toolbar-btn ${wordWrap ? "re-toolbar-btn-active" : ""}`}
            title="Word wrap"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M3 12h15a3 3 0 1 1 0 6h-4" /><polyline points="13 18 10 15 13 12" /><path d="M3 18h7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowFind((f) => !f)}
            className={`re-toolbar-btn ${showFind ? "re-toolbar-btn-active" : ""}`}
            title="Find & Replace (Ctrl+F)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      </div>

      {/* Find bar */}
      {showFind && (
        <FindBar
          value={value}
          onReplace={onChange}
          onClose={() => setShowFind(false)}
          textareaRef={textareaRef}
        />
      )}

      {/* Editor / Preview */}
      {showPreview ? (
        <div className="re-preview-wrap">
          <MarkdownPreview content={value} />
        </div>
      ) : (
        <div className="re-editor">
          {/* Line numbers */}
          <div className="re-gutter-wrap">
            <LineNumbers count={lineCount} scrollTop={scrollTop} />
          </div>

          {/* Highlighted overlay + textarea */}
          <div className="re-edit-area">
            <div className="re-highlight-wrap">
              <HighlightedOverlay value={value} scrollTop={scrollTop} scrollLeft={scrollLeft} />
            </div>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={minRows}
              spellCheck={false}
              className={`re-textarea ${wordWrap ? "re-wrap" : "re-nowrap"}`}
            />
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="re-statusbar">
        <span>{wordCount} words</span>
        <span>{lineCount} lines</span>
        <span>{charCount} chars</span>
        {variables.length > 0 && (
          <span className="text-primary-500 dark:text-primary-400">
            {variables.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
