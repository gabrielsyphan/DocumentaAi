import { useEffect, useRef, useState } from "react";
import { useCreateBlockNote, FormattingToolbarController, FormattingToolbar, useBlockNoteEditor } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { createHighlighter } from "shiki";
import type { CodeBlockOptions } from "@blocknote/core";
import "@blocknote/mantine/style.css";
import { usePagesStore } from "../../store/pages.store";
import { useUIStore } from "../../store/ui.store";
import { isTauri, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { blocksToMarkdown, printToPdf } from "../../lib/export";
import { saveCustomTemplate, stripBlockIds } from "../../lib/templates";
import { tagColor, normalizeTag } from "../../lib/tags";
import { FileDown, Printer, BookTemplate, X as XIcon, Tag } from "lucide-react";

// Corrige o desaparecimento do toolbar ao mover o mouse de imagem/vídeo para ele.
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
  const { theme } = useUIStore();
  const page = pages.find((p) => p.id === pageId);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const initialContent = (() => {
    if (!page?.content) return undefined;
    try {
      return JSON.parse(page.content);
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
    initialContent,
    uploadFile,
    codeBlock: {
      defaultLanguage: "text",
      supportedLanguages: SUPPORTED_LANGUAGES,
      createHighlighter: makeHighlighter,
    },
  });

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updatePage(pageId, { content: JSON.stringify(editor.document) });
      }, 500);
    });

    return () => {
      unsubscribe?.();
      clearTimeout(saveTimer.current);
    };
  }, [editor, pageId]);

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
          : null;
        if (!type) continue;

        try {
          const url = convertFileSrc(path);
          const blob = await fetch(url).then((r) => r.blob());
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const lastBlock = editor.document[editor.document.length - 1];
          editor.insertBlocks(
            [{ type, props: { url: base64 } } as Parameters<typeof editor.insertBlocks>[0][0]],
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

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    updatePage(pageId, { title: e.target.value });
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      editor.focus();
    }
  }

  return (
    <>
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
          <div className="export-wrapper" onMouseDown={(e) => e.stopPropagation()}>
            <button
              className="export-btn"
              onClick={() => setShowExport((v) => !v)}
              title="Exportar página"
            >
              <FileDown size={15} />
            </button>
            {showExport && (
              <div className="export-menu">
                <button className="export-menu-item" onMouseDown={handleExportMd}>
                  <FileDown size={13} /> Exportar Markdown
                </button>
                <button className="export-menu-item" onMouseDown={handleExportPdf}>
                  <Printer size={13} /> Exportar PDF
                </button>
                <div className="export-menu-divider" />
                <button className="export-menu-item" onMouseDown={handleSaveTemplate}>
                  <BookTemplate size={13} /> Salvar como template
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

        <BlockNoteView editor={editor} theme={theme} formattingToolbar={false}>
          <FormattingToolbarController formattingToolbar={StableFormattingToolbar} />
        </BlockNoteView>
      </div>

      <TagEditor pageId={pageId} />
    </>
  );
}

// ── Tag Editor ────────────────────────────────────────────────────────────────

function TagEditor({ pageId }: { pageId: string }) {
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
    </div>
  );
}
