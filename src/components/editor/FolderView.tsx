import { useState } from "react";
import { Folder, FolderOpen, FileText, PenTool, Plus, BookText } from "lucide-react";
import type { Page } from "../../types";
import { usePagesStore } from "../../store/pages.store";
import { exportFolderAsPdf, type BookChapter } from "../../lib/pdf-export";
import { useIsMobile } from "../../hooks/useIsMobile";

interface Props {
  pageId: string;
}

// Percorre a pasta em profundidade: documentos e daily viram capítulos com
// conteúdo; subpastas viram capítulos "de seção" e aninham (1, 1.1, 1.1.1…).
// Canvas e boards ficam de fora — não têm texto exportável.
function collectChapters(pages: Page[], parentId: string, level = 0): BookChapter[] {
  const children = pages
    .filter((p) => p.parent_id === parentId)
    .sort((a, b) => a.order_index - b.order_index);

  const chapters: BookChapter[] = [];
  for (const child of children) {
    if (child.type === "folder") {
      // Pasta sem nada exportável dentro não vira seção (evitaria página vazia)
      const sub = collectChapters(pages, child.id, level + 1);
      if (sub.length > 0) {
        chapters.push({ title: child.title, emoji: child.emoji, level, blocks: [], kind: "folder" });
        chapters.push(...sub);
      }
    } else if (child.type === "document" || child.type === "daily") {
      let blocks = [];
      try { blocks = JSON.parse(child.content ?? "[]"); } catch { /* conteúdo inválido */ }
      chapters.push({
        title: child.title,
        emoji: child.emoji,
        level,
        blocks: Array.isArray(blocks) ? blocks : [],
        kind: "page",
      });
    }
  }
  return chapters;
}

export default function FolderView({ pageId }: Props) {
  const { pages, updatePage, createPage, selectPage } = usePagesStore();
  const folder = pages.find((p) => p.id === pageId);
  const isMobile = useIsMobile();
  const [exporting, setExporting] = useState(false);
  const children = pages
    .filter((p) => p.parent_id === pageId)
    .sort((a, b) => a.order_index - b.order_index);

  if (!folder) return null;

  async function handleExportPdf() {
    if (!folder || exporting) return;
    const chapters = collectChapters(pages, pageId);
    if (chapters.length === 0) return;
    setExporting(true);
    try {
      await exportFolderAsPdf(folder.title, chapters);
    } catch (e) {
      console.error("Erro ao exportar PDF da pasta:", e);
    } finally {
      setExporting(false);
    }
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    updatePage(pageId, { title: e.target.value });
  }

  function handleCreate(type: "document" | "canvas" | "folder") {
    createPage(pageId, { title: type === "folder" ? "Nova pasta" : "Sem título", type });
  }

  function childIcon(child: Page) {
    if (child.emoji) return <span style={{ fontSize: 20 }}>{child.emoji}</span>;
    if (child.type === "canvas") return <PenTool size={20} />;
    if (child.type === "folder") return <Folder size={20} />;
    return <FileText size={20} />;
  }

  function childTypeLabel(type: string) {
    if (type === "canvas") return "Canvas";
    if (type === "folder") return "Pasta";
    return "Documento";
  }

  return (
    <div className="folder-view">
      {/* Título — mesma classe e centralização do editor de documento */}
      <input
        className="page-title-input"
        value={folder.title}
        onChange={handleTitleChange}
        placeholder="Sem título"
      />

      {/* Corpo centralizado com o mesmo max-width do editor */}
      <div className="folder-view-body">
        <div className="folder-view-meta">
          <span className="folder-view-type-icon">
            {children.length > 0 ? <FolderOpen size={15} /> : <Folder size={15} />}
          </span>
          <span className="folder-view-type-label">
            Pasta · {children.length} {children.length === 1 ? "item" : "itens"}
          </span>
        </div>

        <div className="folder-view-actions">
          <button className="folder-create-btn" onClick={() => handleCreate("document")}>
            <Plus size={12} /><FileText size={12} /> Documento
          </button>
          <button className="folder-create-btn" onClick={() => handleCreate("canvas")}>
            <Plus size={12} /><PenTool size={12} /> Canvas
          </button>
          <button className="folder-create-btn" onClick={() => handleCreate("folder")}>
            <Plus size={12} /><Folder size={12} /> Pasta
          </button>
          {/* Download de arquivo não funciona no WebView Android — desktop-only */}
          {!isMobile && children.length > 0 && (
            <button
              className="folder-create-btn folder-export-btn"
              onClick={handleExportPdf}
              disabled={exporting}
              title="Gera um PDF com capa, sumário e um capítulo por item (subpastas viram seções)"
            >
              <BookText size={12} /> {exporting ? "Gerando…" : "Exportar PDF"}
            </button>
          )}
        </div>

        {children.length === 0 ? (
          <div className="folder-empty">
            <Folder size={48} />
            <p>Pasta vazia</p>
            <p className="folder-empty-hint">Crie itens acima ou arraste páginas da sidebar para cá</p>
          </div>
        ) : (
          <div className="folder-children-grid">
            {children.map((child) => (
              <button
                key={child.id}
                className="folder-child-card"
                onClick={() => selectPage(child.id)}
              >
                <span className="folder-child-icon">{childIcon(child)}</span>
                <span className="folder-child-title">{child.title || "Sem título"}</span>
                <span className="folder-child-type">{childTypeLabel(child.type)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
