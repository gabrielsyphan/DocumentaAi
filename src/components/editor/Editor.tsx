import { useEffect, useRef, useState } from "react";
import { useCreateBlockNote, FormattingToolbarController, FormattingToolbar, useBlockNoteEditor, SuggestionMenuController, getDefaultReactSlashMenuItems, createReactBlockSpec } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { WikiLink } from "./WikiLink";
import { createHighlighter } from "shiki";
import type { CodeBlockOptions } from "@blocknote/core";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from "@blocknote/core";
import "@blocknote/mantine/style.css";
import { usePagesStore } from "../../store/pages.store";
import { useUIStore } from "../../store/ui.store";
import { isTauri, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { blocksToMarkdown, printToPdf } from "../../lib/export";
import { saveCustomTemplate, stripBlockIds } from "../../lib/templates";
import { tagColor, normalizeTag } from "../../lib/tags";
import { useTTS, countWords, type TTSState } from "../../lib/tts";
import { useIsMobile } from "../../hooks/useIsMobile";
import { saveVersion, getVersions } from "../../lib/db";
import type { PageVersion } from "../../types";
import { getAllSnippets, saveCustomSnippet, loadCustomSnippets, deleteCustomSnippet, type Snippet } from "../../lib/snippets";
import { CreateFlashcardModal } from "../flashcards/FlashcardPanel";
import { fetchFlashcardsByPage } from "../../lib/db";
import type { Flashcard } from "../../types";
import { FileDown, FileText, Printer, BookTemplate, X as XIcon, Tag, Volume2, Pause, Play, Square, Maximize2, History, Link2, RotateCcw, HelpCircle, Presentation, ChevronLeft, ChevronRight, Bell, BellOff, Scissors, CalendarClock, CalendarDays, BookOpen, PenTool, Trash2, Zap } from "lucide-react";

// ── Shiki singleton para slides (separado do highlighter do editor) ───────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _slideHL: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _slideHLPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSlideHighlighter(): Promise<any> {
  if (_slideHL) return Promise.resolve(_slideHL);
  if (!_slideHLPromise) {
    _slideHLPromise = createHighlighter({ themes: ["github-dark", "github-light"], langs: SHIKI_LANGS })
      .then((h) => { _slideHL = h; return h; });
  }
  return _slideHLPromise;
}

// ── Presentation helpers ──────────────────────────────────────────────────────

type InlineItem = {
  type: string;
  text?: string;
  styles?: Record<string, boolean>;
  props?: Record<string, string>;
  content?: InlineItem[];
};

type BNBlock = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content: InlineItem[];
  children: BNBlock[];
};

type Slide = { title: string; content: BNBlock[] };

function extractText(items: InlineItem[]): string {
  return items.map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("");
}

function buildSlides(blocks: BNBlock[], pageTitle: string): Slide[] {
  const slides: Slide[] = [{ title: pageTitle, content: [] }];
  for (const block of blocks) {
    if (block.type === "heading" && (block.props.level as number) === 1) {
      slides.push({ title: extractText(block.content), content: [] });
    } else {
      slides[slides.length - 1].content.push(block);
    }
  }
  return slides;
}

function renderInline(items: InlineItem[]): React.ReactNode {
  return items.map((item, i) => {
    if (item.type === "text") {
      const s = item.styles ?? {};
      let node: React.ReactNode = item.text ?? "";
      if (s.code) node = <code key={`c${i}`}>{node}</code>;
      if (s.bold) node = <strong key={`b${i}`}>{node}</strong>;
      if (s.italic) node = <em key={`e${i}`}>{node}</em>;
      if (s.strikethrough) node = <s key={`s${i}`}>{node}</s>;
      if (s.underline) node = <u key={`u${i}`}>{node}</u>;
      return <span key={i}>{node}</span>;
    }
    if (item.type === "link") {
      return <span key={i} className="slide-link">{renderInline(item.content ?? [])}</span>;
    }
    return null;
  });
}

function SlideCodeBlock({ block }: { block: BNBlock }) {
  const { theme } = useUIStore();
  const [html, setHtml] = useState<string | null>(null);
  const lang       = (block.props?.language as string) || "text";
  const code       = extractText(block.content);
  const shikiTheme = theme === "light" ? "github-light" : "github-dark";

  useEffect(() => {
    if (!lang || lang === "text" || !SHIKI_LANGS.includes(lang)) { setHtml(null); return; }
    getSlideHighlighter().then((h) => {
      try { setHtml(h.codeToHtml(code, { lang, theme: shikiTheme })); }
      catch { setHtml(null); }
    });
  }, [code, lang, shikiTheme]);

  if (html) return <div className="slide-code-hl" dangerouslySetInnerHTML={{ __html: html }} />;
  return <pre className="slide-code"><code>{code}</code></pre>;
}

// content de tabela é objeto (tableContent), não array de inlines
type BNTableCell = { content?: InlineItem[] } | InlineItem[];
type BNTableContent = { type: "tableContent"; rows?: { cells?: BNTableCell[] }[] };

function renderSlideTable(table: BNTableContent, idx: number): React.ReactNode {
  const rows = table.rows ?? [];
  return (
    <table key={idx} className="slide-table">
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {(row.cells ?? []).map((cell, ci) => {
              const items = Array.isArray(cell) ? cell : cell?.content ?? [];
              const Tag = ri === 0 ? "th" : "td";
              return <Tag key={ci}>{renderInline(items)}</Tag>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderSlideBlock(block: BNBlock, idx: number): React.ReactNode {
  if (block.type === "table") {
    const table = block.content as unknown as BNTableContent;
    return table?.type === "tableContent" ? renderSlideTable(table, idx) : null;
  }
  const inline = Array.isArray(block.content) ? renderInline(block.content) : null;
  switch (block.type) {
    case "paragraph":
      return <p key={idx} className="slide-p">{inline}</p>;
    case "heading": {
      const lvl = (block.props.level as number) ?? 2;
      const Tag = `h${Math.min(lvl + 1, 4)}` as "h2" | "h3" | "h4";
      return <Tag key={idx} className={`slide-h${lvl + 1}`}>{inline}</Tag>;
    }
    case "bulletListItem":
    case "checkListItem":
      return <li key={idx} className="slide-bullet">{inline}</li>;
    case "numberedListItem":
      return <li key={idx} className="slide-numbered">{inline}</li>;
    case "codeBlock":
      return <SlideCodeBlock key={idx} block={block} />;
    case "image":
      return <img key={idx} className="slide-img" src={block.props.url as string} alt={(block.props.caption as string) || ""} />;
    default:
      return null;
  }
}

function renderSlideContent(blocks: BNBlock[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let bullets: BNBlock[] = [];
  let numbered: BNBlock[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    nodes.push(<ul key={`ul${nodes.length}`} className="slide-list">{bullets.map((b, i) => renderSlideBlock(b, i))}</ul>);
    bullets = [];
  };
  const flushNumbered = () => {
    if (!numbered.length) return;
    nodes.push(<ol key={`ol${nodes.length}`} className="slide-list">{numbered.map((b, i) => renderSlideBlock(b, i))}</ol>);
    numbered = [];
  };

  for (const block of blocks) {
    if (block.type === "bulletListItem" || block.type === "checkListItem") {
      flushNumbered(); bullets.push(block);
    } else if (block.type === "numberedListItem") {
      flushBullets(); numbered.push(block);
    } else {
      flushBullets(); flushNumbered();
      nodes.push(renderSlideBlock(block, nodes.length));
    }
  }
  flushBullets(); flushNumbered();
  return nodes;
}

// ── Corrige o desaparecimento do toolbar ao mover o mouse de imagem/vídeo para ele.
// WebKit (Tauri) inicia um HTML5 drag ao clicar+mover em elementos de mídia,
// disparando dragstart que borbulha até pmView.dom onde BlockNote esconde o toolbar.
// A solução substitui o dragHandler por um que ignora drags iniciados em mídia.
function StableFormattingToolbar() {
  const editor = useBlockNoteEditor();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ftView = (editor.formattingToolbar as any).view;
    const pmDom = editor.prosemirrorView?.dom;
    if (!ftView || !pmDom) return;

    const MEDIA_TAGS = new Set(["IMG", "VIDEO", "AUDIO", "SOURCE"]);
    const MEDIA_SELECTOR =
      '.bn-visual-media-wrapper, .bn-file-block-content-wrapper, ' +
      '[data-content-type="image"], [data-content-type="video"], [data-content-type="audio"]';

    const original: () => void = ftView.dragHandler;

    const safe = (e: Event) => {
      const target = e.target as HTMLElement;
      // O dragstart pode ter como target qualquer elemento dentro do bloco de mídia
      // (a <img> em si, o div.bn-visual-media-wrapper, ou o wrapper externo).
      // Usamos closest() para cobrir todos os casos.
      const isMediaDrag =
        MEDIA_TAGS.has(target.tagName) ||
        !!target.closest?.(MEDIA_SELECTOR);

      if (isMediaDrag) {
        e.preventDefault(); // cancela o drag nativo
        return;             // não esconde o toolbar
      }
      original();
    };

    pmDom.removeEventListener("dragstart", original);
    pmDom.removeEventListener("dragover", original);
    pmDom.addEventListener("dragstart", safe);
    pmDom.addEventListener("dragover", safe);

    return () => {
      pmDom.removeEventListener("dragstart", safe);
      pmDom.removeEventListener("dragover", safe);
      pmDom.addEventListener("dragstart", original);
      pmDom.addEventListener("dragover", original);
    };
  }, [editor]);

  return <FormattingToolbar />;
}

interface Props {
  pageId: string;
}

const SUPPORTED_LANGUAGES: CodeBlockOptions["supportedLanguages"] = {
  text:       { name: "Texto" },
  javascript: { name: "JavaScript", aliases: ["js"] },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  jsx:        { name: "JSX" },
  tsx:        { name: "TSX" },
  python:     { name: "Python",     aliases: ["py"] },
  rust:       { name: "Rust",       aliases: ["rs"] },
  go:         { name: "Go" },
  java:       { name: "Java" },
  kotlin:     { name: "Kotlin",     aliases: ["kt"] },
  c:          { name: "C" },
  cpp:        { name: "C++",        aliases: ["c++"] },
  html:       { name: "HTML" },
  css:        { name: "CSS" },
  json:       { name: "JSON" },
  yaml:       { name: "YAML",       aliases: ["yml"] },
  toml:       { name: "TOML" },
  bash:       { name: "Bash",       aliases: ["sh", "shell"] },
  sql:        { name: "SQL" },
  markdown:   { name: "Markdown",   aliases: ["md"] },
};

const SHIKI_LANGS = Object.keys(SUPPORTED_LANGUAGES).filter((l) => l !== "text");

const CaptureStamp = createReactBlockSpec(
  {
    type: "captureStamp" as const,
    propSchema: { capturedAt: { default: "" } },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const ts   = block.props.capturedAt;
      const date = ts ? new Date(ts) : new Date();
      const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const day  = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      return (
        <div className="capture-stamp" contentEditable={false}>
          <span className="capture-stamp-label">
            <Zap size={11} />
            Quick Capture · {day} {time}
          </span>
          <button
            className="capture-stamp-remove"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={() => (editor as any).removeBlocks([block])}
            title="Remover marcador (o conteúdo permanece)"
          >
            <XIcon size={11} />
          </button>
        </div>
      );
    },
  }
);

const editorSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, captureStamp: CaptureStamp },
  inlineContentSpecs: { ...defaultInlineContentSpecs, wikilink: WikiLink },
  styleSpecs: defaultStyleSpecs,
});

// Shiki v4 e @blocknote/core usam versões diferentes de @shikijs/types;
// o cast é seguro pois a interface é estruturalmente compatível em runtime.
const makeHighlighter: CodeBlockOptions["createHighlighter"] = () =>
  createHighlighter({
    themes: ["github-dark", "github-light"],
    langs: SHIKI_LANGS,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

export default function Editor({ pageId }: Props) {
  const { pages, updatePage } = usePagesStore();
  const { theme, toggleFocusMode } = useUIStore();
  const tts = useTTS();
  const isMobile = useIsMobile();
  const page = pages.find((p) => p.id === pageId);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const versionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSavedContent = useRef<string | null>(null);
  const lastEditorWrite = useRef<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState(0);
  const [showSnippetModal, setShowSnippetModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingSnippetBlocks, setPendingSnippetBlocks] = useState<any[]>([]);

  useEffect(() => {
    if (!pageId) return;
    fetchFlashcardsByPage(pageId).then((cards) => setFlashcardCount(cards.length));
  }, [pageId]);

  const initialContent = (() => {
    if (!page?.content) return undefined;
    try {
      const blocks = JSON.parse(page.content);
      // Migração silenciosa: corrige blocos de imagem salvos com schema antigo
      // (BlockNote ≤0.29 usava `width`, v0.30+ usa `previewWidth`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (Array.isArray(blocks) ? blocks : []).map((b: any) => {
        if (b?.type === "image" && b.props && "width" in b.props && !("previewWidth" in b.props)) {
          const { width, ...rest } = b.props;
          return { ...b, props: { name: "", showPreview: true, previewWidth: width ?? 512, ...rest } };
        }
        return b;
      });
    } catch {
      return undefined;
    }
  })();

  async function uploadFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent,
    uploadFile,
    codeBlock: {
      defaultLanguage: "text",
      supportedLanguages: SUPPORTED_LANGUAGES,
      createHighlighter: makeHighlighter,
    },
  });

  useEffect(() => {
    setWordCount(countWords(editor.document as object[]));
    lastSavedContent.current = null;
  }, [editor]);

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      // Salva página (debounce 500ms)
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const content = JSON.stringify(editor.document);
        lastEditorWrite.current = content;
        updatePage(pageId, { content });
      }, 500);

      // Atualiza contagem de palavras imediatamente
      setWordCount(countWords(editor.document as object[]));

      // Salva versão (debounce 15s)
      clearTimeout(versionTimer.current);
      versionTimer.current = setTimeout(() => {
        const content = JSON.stringify(editor.document);
        if (content !== lastSavedContent.current) {
          lastSavedContent.current = content;
          saveVersion(pageId, page?.title ?? "", content);
        }
      }, 15_000);
    });

    return () => {
      unsubscribe?.();
      clearTimeout(saveTimer.current);
      // Salva versão ao sair da página se houver conteúdo não versionado
      clearTimeout(versionTimer.current);
      const content = JSON.stringify(editor.document);
      if (content !== lastSavedContent.current) {
        lastSavedContent.current = content;
        saveVersion(pageId, page?.title ?? "", content);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pageId]);

  // Sincroniza o editor quando o conteúdo é alterado externamente
  // (ex: quick-capture salva na daily note que está aberta)
  useEffect(() => {
    const storeContent = page?.content ?? null;
    if (!storeContent) return;
    if (storeContent === lastEditorWrite.current) return; // foi o próprio editor que escreveu
    const editorContent = JSON.stringify(editor.document);
    if (storeContent === editorContent) return; // já sincronizado
    try {
      const blocks = JSON.parse(storeContent);
      editor.replaceBlocks(editor.document, blocks);
      lastEditorWrite.current = storeContent;
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.content]);

  useEffect(() => {
    if (!isTauri()) return;

    const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "tiff"]);
    const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "mkv", "avi"]);
    const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "m4a", "flac"]);

    async function insertDroppedFiles(paths: string[]) {
      for (const path of paths) {
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        const type = IMAGE_EXTS.has(ext) ? "image"
          : VIDEO_EXTS.has(ext) ? "video"
          : AUDIO_EXTS.has(ext) ? "audio"
          : "file";

        try {
          const url = convertFileSrc(path);
          const blob = await fetch(url).then((r) => r.blob());
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const fileName = path.split(/[\\/]/).pop() ?? "arquivo";
          const props = type === "file"
            ? { url: base64, name: fileName }
            : { url: base64 };

          const lastBlock = editor.document[editor.document.length - 1];
          editor.insertBlocks(
            [{ type, props } as Parameters<typeof editor.insertBlocks>[0][0]],
            lastBlock,
            "after",
          );
        } catch (err) {
          console.error("Erro ao inserir arquivo arrastado:", path, err);
        }
      }
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          insertDroppedFiles(event.payload.paths);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [editor]);

  const [showExport, setShowExport] = useState(false);
  const [mdModal, setMdModal] = useState<string | null>(null);
  const [showPresentation, setShowPresentation] = useState(false);

  // Permite colar imagem do clipboard (Ctrl+V / ⌘V após Print Screen ou cópia)
  useEffect(() => {
    async function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) break;
          const base64 = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
          const last = editor.document[editor.document.length - 1];
          editor.insertBlocks([{ type: "image", props: { url: base64 } }], last, "after");
          break;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [editor]);

  useEffect(() => {
    if (!showExport) return;
    const close = () => setShowExport(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showExport]);

  function handleExportMd() {
    setShowExport(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md = blocksToMarkdown(page?.title ?? "documento", editor.document as any);
    setMdModal(md);
  }

  function handleExportPdf() {
    setShowExport(false);
    printToPdf(page?.title ?? "documento");
  }

  async function handleCopyMd() {
    if (!mdModal) return;
    await navigator.clipboard.writeText(mdModal);
  }

  function handleSaveTemplate() {
    setShowExport(false);
    saveCustomTemplate({
      id: crypto.randomUUID(),
      name: page?.title || "Sem título",
      icon: page?.emoji || "",
      isLucideIcon: false,
      description: `Criado a partir de "${page?.title || "Sem título"}"`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: stripBlockIds(editor.document as any),
      isCustom: true,
      createdAt: new Date().toISOString(),
    });
  }

  async function handleOpenHistory() {
    const v = await getVersions(pageId);
    setVersions(v);
    setShowHistory(true);
  }

  function handleRestoreVersion(version: PageVersion) {
    if (!version.content) return;
    try {
      const blocks = JSON.parse(version.content);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.replaceBlocks(editor.document as any, blocks);
      updatePage(pageId, { title: version.title, content: version.content });
    } catch (e) {
      console.error("Falha ao restaurar versão:", e);
    }
    setShowHistory(false);
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    updatePage(pageId, { title: e.target.value });
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      editor.focus();
    }
  }

  // Para TTS quando a página muda (Editor remonta via key={pageId})
  useEffect(() => {
    return () => { tts.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {tts.speaking && <TTSBar tts={tts} />}
      <div className="editor-container">
        <div className="editor-topbar">
          <input
            className="page-title-input"
            value={page?.title ?? ""}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            placeholder="Sem título"
            autoFocus={!page?.title}
          />
          <div className="topbar-actions" onMouseDown={(e) => e.stopPropagation()}>
            {/* TTS não funciona bem no WebView Android — desktop-only */}
            {!isMobile && tts.supported && (
              <button
                className={`topbar-action-btn${tts.speaking ? " active" : ""}`}
                onClick={tts.speaking ? tts.stop : () => tts.play(editor.document as object[])}
                title={tts.speaking ? "Parar leitura" : "Ler em voz alta"}
              >
                <Volume2 size={15} />
              </button>
            )}
            <button
              className="topbar-action-btn"
              onClick={() => setShowPresentation(true)}
              title="Modo apresentação"
            >
              <Presentation size={15} />
            </button>
            <div style={{ position: "relative" }}>
              <button
                className={`topbar-action-btn${page?.reminder_date ? " active" : ""}`}
                onClick={() => setShowReminderPicker((v) => !v)}
                title={page?.reminder_date ? `Lembrete: ${page.reminder_date}` : "Definir lembrete"}
              >
                {page?.reminder_date ? <Bell size={15} /> : <BellOff size={15} />}
              </button>
              {showReminderPicker && (
                <div className="reminder-picker" onMouseDown={(e) => e.stopPropagation()}>
                  <label className="reminder-picker-label">
                    <CalendarClock size={12} /> Lembrete
                  </label>
                  <input
                    type="date"
                    className="reminder-picker-input"
                    value={page?.reminder_date ?? ""}
                    onChange={(e) => {
                      updatePage(pageId, { reminder_date: e.target.value || null });
                    }}
                  />
                  {page?.reminder_date && (
                    <button
                      className="reminder-clear-btn"
                      onClick={() => { updatePage(pageId, { reminder_date: null }); setShowReminderPicker(false); }}
                    >
                      <XIcon size={11} /> Remover
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              className="topbar-action-btn"
              onClick={() => setShowFlashcardModal(true)}
              title="Flashcards desta página"
              style={{ position: "relative" }}
            >
              <BookOpen size={15} />
              {flashcardCount > 0 && (
                <span className="fc-topbar-badge">{flashcardCount}</span>
              )}
            </button>
            <button
              className="topbar-action-btn"
              onClick={handleOpenHistory}
              title="Histórico de versões"
            >
              <History size={15} />
            </button>
            <button
              className="topbar-action-btn"
              onClick={toggleFocusMode}
              title="Modo foco (⌘⇧F)"
            >
              <Maximize2 size={15} />
            </button>
            <button
              className="topbar-action-btn"
              onClick={() => setShowExport((v) => !v)}
              title="Exportar página"
            >
              <FileDown size={15} />
            </button>
            {showExport && (
              <div className="export-menu">
                {/* Download de arquivo e window.print() não funcionam no WebView
                    Android — no mobile só template/snippet ficam disponíveis */}
                {!isMobile && (
                  <>
                    <button className="export-menu-item" onMouseDown={handleExportMd}>
                      <FileDown size={13} /> Exportar Markdown
                    </button>
                    <button className="export-menu-item" onMouseDown={handleExportPdf}>
                      <Printer size={13} /> Exportar PDF
                    </button>
                    <div className="export-menu-divider" />
                  </>
                )}
                <button className="export-menu-item" onMouseDown={handleSaveTemplate}>
                  <BookTemplate size={13} /> Salvar como template
                </button>
                <button
                  className="export-menu-item"
                  onMouseDown={() => {
                    setShowExport(false);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setPendingSnippetBlocks(stripBlockIds(editor.document as any));
                    setShowSnippetModal(true);
                  }}
                >
                  <Scissors size={13} /> Salvar como snippet
                </button>
              </div>
            )}
          </div>
        </div>

        {mdModal !== null && (
          <div className="md-modal-overlay" onClick={() => setMdModal(null)}>
            <div className="md-modal" onClick={(e) => e.stopPropagation()}>
              <div className="md-modal-header">
                <span>Markdown — {page?.title}</span>
                <div className="md-modal-actions">
                  <button className="md-modal-btn" onClick={handleCopyMd}>Copiar</button>
                  <button className="md-modal-btn" onClick={() => setMdModal(null)}>Fechar</button>
                </div>
              </div>
              <textarea className="md-modal-textarea" value={mdModal} readOnly />
            </div>
          </div>
        )}

        {page?.type === "daily" && (
          <DailyAgenda date={page.title} />
        )}

        <BlockNoteView editor={editor} theme={theme === "light" ? "light" : "dark"} formattingToolbar={false} slashMenu={false}>
          <FormattingToolbarController formattingToolbar={StableFormattingToolbar} />
          {/* Slash menu personalizado com snippets */}
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => {
              const q = query.toLowerCase();
              const defaults = getDefaultReactSlashMenuItems(editor);
              const snippets = getAllSnippets();
              const snippetItems = snippets.map((s) => ({
                title: s.name,
                aliases: [s.trigger],
                group: "Snippets",
                icon: <Scissors size={18} />,
                onItemClick: () => {
                  const curBlock = editor.getTextCursorPosition().block;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  editor.insertBlocks(stripBlockIds(s.blocks as any) as any, curBlock, "after");
                },
              }));
              const allItems = [...defaults, ...snippetItems];
              return q
                ? allItems.filter((item) =>
                    item.title.toLowerCase().includes(q) ||
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ((item as any).aliases ?? []).some((a: string) => a.toLowerCase().includes(q))
                  )
                : allItems;
            }}
          />
          {/* Menu de wikilinks com [[ */}
          <SuggestionMenuController
            triggerCharacter="["
            getItems={async (query) => {
              const search = query.toLowerCase();
              return pages
                .filter((p) => p.type !== "daily" && (p.title || "").toLowerCase().includes(search))
                .slice(0, 8)
                .map((p) => ({
                  title: p.title || "Sem título",
                  subtext: p.type === "canvas" ? "Canvas" : "Documento",
                  icon: p.emoji ? <span style={{ fontSize: 14 }}>{p.emoji}</span> : (p.type === "daily" ? <CalendarDays size={13} /> : p.type === "canvas" ? <PenTool size={13} /> : <FileText size={13} />),
                  group: "Páginas",
                  onItemClick: () => {
                    editor.insertInlineContent([
                      { type: "wikilink", props: { title: p.title || "Sem título", pageId: p.id } },
                    ]);
                  },
                }));
            }}
          />
        </BlockNoteView>

        <BacklinksSection pageId={pageId} />
      </div>

      <TagEditor pageId={pageId} wordCount={wordCount} />

      {showHistory && (
        <VersionHistoryModal
          versions={versions}
          currentContent={JSON.stringify(editor.document)}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestoreVersion}
        />
      )}

      {showPresentation && (
        <PresentationMode
          slides={buildSlides(editor.document as BNBlock[], page?.title ?? "Sem título")}
          onClose={() => setShowPresentation(false)}
        />
      )}

      {showFlashcardModal && pageId && (
        <CreateFlashcardModal
          pageId={pageId}
          initialFront={window.getSelection()?.toString() ?? ""}
          onClose={() => setShowFlashcardModal(false)}
          onCreated={async () => {
            const cards = await fetchFlashcardsByPage(pageId);
            setFlashcardCount(cards.length);
          }}
        />
      )}

      {showSnippetModal && (
        <SnippetModal
          pendingBlocks={pendingSnippetBlocks}
          onClose={() => setShowSnippetModal(false)}
        />
      )}
    </>
  );
}

// ── Snippet Modal ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SnippetModal({ pendingBlocks, onClose }: { pendingBlocks: any[]; onClose: () => void }) {
  const [name, setName]       = useState("");
  const [trigger, setTrigger] = useState("");
  const [customs, setCustoms] = useState<Snippet[]>(() => loadCustomSnippets());
  const [saved, setSaved]     = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function handleSave() {
    const n = name.trim();
    if (!n) return;
    const t = trigger.trim() || n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");
    saveCustomSnippet({ id: crypto.randomUUID(), name: n, trigger: t, blocks: pendingBlocks });
    setCustoms(loadCustomSnippets());
    setName("");
    setTrigger("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleDelete(id: string) {
    deleteCustomSnippet(id);
    setCustoms(loadCustomSnippets());
  }

  return (
    <div className="fc-overlay" onClick={onClose}>
      <div className="fc-modal snippet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fc-modal-header">
          <span className="fc-modal-title"><Scissors size={14} /> Snippets</span>
          <button className="fc-close" onClick={onClose}><XIcon size={14} /></button>
        </div>

        <div className="snippet-save-form">
          <p className="snippet-form-hint">Salvar conteúdo atual como snippet</p>
          <input
            ref={nameRef}
            className="snippet-input"
            placeholder="Nome do snippet"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <input
            className="snippet-input"
            placeholder="Gatilho no menu / (ex: reuniao)"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value.replace(/\s/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button
            className="fc-create-btn"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            {saved ? "Salvo ✓" : <><Scissors size={13} /> Salvar snippet</>}
          </button>
        </div>

        <div className="snippet-list-section">
          <div className="fc-list-label">Meus snippets ({customs.length})</div>
          {customs.length === 0 ? (
            <p className="fc-empty-hint">Nenhum snippet salvo ainda.</p>
          ) : (
            customs.map((s) => (
              <div key={s.id} className="fc-card-row">
                <div className="fc-card-row-text">
                  <span className="fc-card-front">{s.name}</span>
                  <span className="fc-card-back">/{s.trigger}</span>
                </div>
                <button className="fc-delete-btn" onClick={() => handleDelete(s.id)} title="Excluir snippet">
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── TTS Bar ───────────────────────────────────────────────────────────────────

function TTSBar({ tts }: { tts: TTSState }) {
  return (
    <div className="tts-bar">
      <Volume2 size={13} className="tts-icon" />
      <span className="tts-progress">{tts.currentIdx + 1}/{tts.totalChunks}</span>
      <button
        className="tts-ctrl-btn"
        onClick={tts.paused ? tts.resume : tts.pause}
        title={tts.paused ? "Continuar" : "Pausar"}
      >
        {tts.paused ? <Play size={13} /> : <Pause size={13} />}
      </button>
      <button className="tts-ctrl-btn" onClick={tts.stop} title="Parar">
        <Square size={13} />
      </button>
      <div className="tts-divider" />
      <span className="tts-label">Vel:</span>
      {[0.75, 1, 1.25, 1.5, 2].map((r) => (
        <button
          key={r}
          className={`tts-rate-btn${tts.rate === r ? " active" : ""}`}
          onClick={() => tts.changeRate(r)}
        >
          {r}×
        </button>
      ))}
      {tts.voices.length > 0 && (
        <>
          <div className="tts-divider" />
          <select
            className="tts-voice-select"
            value={tts.voiceURI}
            onChange={(e) => tts.setVoiceURI(e.target.value)}
          >
            {tts.voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

// ── Backlinks ─────────────────────────────────────────────────────────────────

type AnyBlock = { type: string; content?: unknown[]; children?: AnyBlock[] };
type AnyInline = { type: string; props?: Record<string, string> };

function collectWikilinkIds(blocks: AnyBlock[]): string[] {
  const ids: string[] = [];
  function walk(b: AnyBlock) {
    if (Array.isArray(b.content)) {
      for (const item of b.content as AnyInline[]) {
        if (item.type === "wikilink" && item.props?.pageId) ids.push(item.props.pageId);
      }
    }
    if (Array.isArray(b.children)) b.children.forEach(walk);
  }
  blocks.forEach(walk);
  return ids;
}

function BacklinksSection({ pageId }: { pageId: string }) {
  const { pages, selectPage } = usePagesStore();
  const page = pages.find((p) => p.id === pageId);
  const title = page?.title?.trim();
  if (!page) return null;

  const backlinks = pages.filter((p) => {
    if (p.id === pageId || !p.content) return false;
    // Detect new-style wikilink inline content
    try {
      const blocks: AnyBlock[] = JSON.parse(p.content);
      if (collectWikilinkIds(blocks).includes(pageId)) return true;
    } catch { /* ignore */ }
    // Detect old-style [[title]] text
    if (title) {
      const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\[\\[${escaped}\\]\\]`, "i").test(p.content);
    }
    return false;
  });

  return (
    <div className="backlinks-section">
      <div className="backlinks-header">
        <Link2 size={12} />
        {backlinks.length > 0
          ? `Mencionado em ${backlinks.length} ${backlinks.length === 1 ? "página" : "páginas"}`
          : "Backlinks"}
        <span
          className="backlinks-help-icon"
          data-tooltip="Digite [[ no editor para criar um link"
        >
          <HelpCircle size={11} />
        </span>
      </div>
      {backlinks.length > 0 ? (
        <div className="backlinks-list">
          {backlinks.map((p) => (
            <button key={p.id} className="backlink-item" onClick={() => selectPage(p.id)}>
              <span className="backlink-icon">
                {p.emoji ?? (p.type === "daily" ? <CalendarDays size={12} /> : <FileText size={12} />)}
              </span>
              {p.title || "Sem título"}
            </button>
          ))}
        </div>
      ) : (
        <p className="backlinks-empty">
          Nenhuma página menciona esta ainda.{" "}
          <span className="backlinks-empty-hint">
            Digite <code>[[</code> em qualquer editor para criar um link.
          </span>
        </p>
      )}
    </div>
  );
}

// ── Version History ───────────────────────────────────────────────────────────

function formatVersionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Diff helpers ──────────────────────────────────────────────────────────────

type DiffLine = { text: string; kind: "same" | "added" | "removed" };

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const m = a.length, n = b.length;
  const lcs = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      lcs[i][j] = a[i - 1] === b[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ text: a[i - 1], kind: "same" }); i--; j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      result.unshift({ text: b[j - 1], kind: "added" }); j--;
    } else {
      result.unshift({ text: a[i - 1], kind: "removed" }); i--;
    }
  }
  return result;
}

function blocksToPlainText(content: string | null): string {
  if (!content) return "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function inlineToText(items: any[]): string {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (items ?? []).map((c: any) => c.type === "text" ? (c.text ?? "") : inlineToText(c.content ?? [])).join("");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function blockToLine(b: any): string {
      // Tabelas: content é objeto (tableContent), não array de inlines
      if (b.type === "table" && b.content?.rows) {
        return (b.content.rows as { cells?: unknown[] }[])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((r) => "| " + (r.cells ?? []).map((c: any) => inlineToText(Array.isArray(c) ? c : c?.content ?? [])).join(" | ") + " |")
          .join("\n");
      }
      const text = inlineToText(Array.isArray(b.content) ? b.content : []);
      if (b.type === "heading") return "#".repeat(b.props?.level ?? 1) + " " + text;
      if (b.type === "bulletListItem") return "• " + text;
      if (b.type === "numberedListItem") return "  " + text;
      if (b.type === "checkListItem") return (b.props?.checked ? "[x] " : "[ ] ") + text;
      if (b.type === "codeBlock") return "```\n" + inlineToText(b.content) + "\n```";
      return text;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(blocks: any[]): string[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return blocks.flatMap((b: any) => [blockToLine(b), ...walk(b.children ?? [])]);
    }
    return walk(JSON.parse(content)).join("\n");
  } catch { return ""; }
}

// ── Version History Modal ─────────────────────────────────────────────────────

function VersionHistoryModal({
  versions,
  currentContent,
  onClose,
  onRestore,
}: {
  versions: PageVersion[];
  currentContent: string;
  onClose: () => void;
  onRestore: (v: PageVersion) => void;
}) {
  const [diffVersion, setDiffVersion] = useState<PageVersion | null>(null);

  if (diffVersion) {
    const oldText = blocksToPlainText(diffVersion.content);
    const newText = blocksToPlainText(currentContent);
    const lines = computeDiff(oldText, newText);
    return (
      <div className="vhist-overlay" onClick={() => setDiffVersion(null)}>
        <div className="vhist-modal vhist-modal-wide" onClick={(e) => e.stopPropagation()}>
          <div className="vhist-header">
            <span className="vhist-title-bar">
              <History size={14} />
              Diff — {formatVersionDate(diffVersion.saved_at)} → agora
            </span>
            <button className="vhist-close" onClick={() => setDiffVersion(null)}>
              <XIcon size={14} />
            </button>
          </div>
          <div className="vhist-diff">
            {lines.map((line, i) => (
              <div key={i} className={`diff-line diff-${line.kind}`}>
                <span className="diff-marker">
                  {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
                </span>
                <span className="diff-text">{line.text || " "}</span>
              </div>
            ))}
          </div>
          <div className="vhist-diff-footer">
            <button
              className="vhist-restore-btn"
              onClick={() => { onRestore(diffVersion); setDiffVersion(null); }}
            >
              <RotateCcw size={12} />
              Restaurar esta versão
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vhist-overlay" onClick={onClose}>
      <div className="vhist-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vhist-header">
          <span className="vhist-title-bar">
            <History size={14} />
            Histórico de versões
          </span>
          <button className="vhist-close" onClick={onClose}>
            <XIcon size={14} />
          </button>
        </div>
        <div className="vhist-list">
          {versions.length === 0 ? (
            <p className="vhist-empty">Nenhuma versão salva ainda.<br />O histórico é criado automaticamente enquanto você edita.</p>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="vhist-item">
                <div className="vhist-item-info">
                  <span className="vhist-time">{formatVersionDate(v.saved_at)}</span>
                  <span className="vhist-page-title">{v.title || "Sem título"}</span>
                </div>
                <button
                  className="vhist-diff-btn"
                  onClick={() => setDiffVersion(v)}
                  title="Ver diferenças"
                >
                  Comparar
                </button>
                <button
                  className="vhist-restore-btn"
                  onClick={() => onRestore(v)}
                  title="Restaurar esta versão"
                >
                  <RotateCcw size={12} />
                  Restaurar
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tag Editor ────────────────────────────────────────────────────────────────

function TagEditor({ pageId, wordCount }: { pageId: string; wordCount: number }) {
  const { pages, updatePage } = usePagesStore();
  const page = pages.find((p) => p.id === pageId);
  const tags = page?.tags ?? [];
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const tag = normalizeTag(input);
    if (tag && !tags.includes(tag)) {
      updatePage(pageId, { tags: [...tags, tag] });
    }
    setInput("");
  }

  function remove(tag: string) {
    updatePage(pageId, { tags: tags.filter((t) => t !== tag) });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      remove(tags[tags.length - 1]);
    }
  }

  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div
      className="tag-editor"
      onClick={() => inputRef.current?.focus()}
    >
      <Tag size={12} className="tag-editor-icon" />
      {tags.map((tag) => {
        const color = tagColor(tag);
        return (
          <span
            key={tag}
            className="tag-chip"
            style={{ color, background: `${color}22`, borderColor: `${color}55` }}
          >
            {tag}
            <button
              className="tag-chip-remove"
              onMouseDown={(e) => { e.preventDefault(); remove(tag); }}
            >
              <XIcon size={10} />
            </button>
          </span>
        );
      })}
      <input
        ref={inputRef}
        className="tag-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={tags.length === 0 ? "Adicionar tag..." : ""}
      />
      {wordCount > 0 && (
        <span className="tag-editor-stats">
          {wordCount} {wordCount === 1 ? "palavra" : "palavras"} · {readingTime} min
        </span>
      )}
    </div>
  );
}

// ── Daily Agenda ──────────────────────────────────────────────────────────────

function DailyAgenda({ date }: { date: string }) {
  const { pages, selectPage } = usePagesStore();
  const reminders = pages.filter((p) => p.type !== "daily" && p.reminder_date === date);
  if (reminders.length === 0) return null;

  return (
    <div className="daily-agenda">
      <div className="daily-agenda-inner">
        <div className="daily-agenda-header">
          <CalendarClock size={12} />
          Agenda do dia
        </div>
        <div className="daily-agenda-list">
          {reminders.map((p) => (
            <button key={p.id} className="daily-agenda-item" onClick={() => selectPage(p.id)}>
              <span className="daily-agenda-emoji">{p.emoji ?? (p.type === "canvas" ? <PenTool size={12} /> : <FileText size={12} />)}</span>
              <span className="daily-agenda-title">{p.title || "Sem título"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Presentation Mode ─────────────────────────────────────────────────────────

function PresentationMode({ slides, onClose }: { slides: Slide[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const slide = slides[Math.min(idx, slides.length - 1)];
  const slideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (slideRef.current) slideRef.current.scrollTop = 0;
  }, [idx]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ")
        setIdx((i) => Math.min(slides.length - 1, i + 1));
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
        setIdx((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [slides.length, onClose]);

  return (
    <div className="pres-overlay">
      <button className="pres-close-btn" onClick={onClose} title="Fechar (Esc)">
        <XIcon size={18} />
      </button>

      <div className="pres-slide" ref={slideRef}>
        <h1 className="pres-slide-title">{slide.title}</h1>
        <div className="pres-slide-body">
          {renderSlideContent(slide.content)}
        </div>
      </div>

      <div className="pres-controls">
        <button
          className="pres-nav-btn"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          <ChevronLeft size={22} />
        </button>
        <span className="pres-counter">{idx + 1} / {slides.length}</span>
        <button
          className="pres-nav-btn"
          onClick={() => setIdx((i) => Math.min(slides.length - 1, i + 1))}
          disabled={idx === slides.length - 1}
        >
          <ChevronRight size={22} />
        </button>
      </div>

      <div className="pres-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            className={`pres-dot${i === idx ? " active" : ""}`}
            onClick={() => setIdx(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {slides.length === 1 && (
        <div className="pres-hint">
          Dica: cada título <strong>H1</strong> no editor vira um novo slide
        </div>
      )}
    </div>
  );
}
