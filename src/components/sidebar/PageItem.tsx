import { useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, FileText, PenTool, Folder, FolderOpen, X, Check, Star } from "lucide-react";
import type { PageWithChildren } from "../../types";
import { usePagesStore } from "../../store/pages.store";
import { useDragCtx } from "./DragContext";

interface Props {
  page: PageWithChildren;
  depth: number;
}

const DRAG_THRESHOLD = 5;

export default function PageItem({ page, depth }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const { selectedPageId, selectPage, createPage, trashPage, toggleFavorite } = usePagesStore();
  const { draggedId, overId, overPosition, startDrag } = useDragCtx();
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);

  const isActive = selectedPageId === page.id;
  const hasChildren = page.children.length > 0;
  const isDragging = draggedId === page.id;
  const isOver = overId === page.id;

  // Auto-expand when something is dropped inside this page
  useEffect(() => {
    if (isOver && overPosition === "inside") setExpanded(true);
  }, [isOver, overPosition]);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || confirming) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    dragStarted.current = false;

    function onMove(e2: PointerEvent) {
      if (dragStarted.current || !startPos.current) return;
      const dist = Math.hypot(e2.clientX - startPos.current.x, e2.clientY - startPos.current.y);
      if (dist > DRAG_THRESHOLD) {
        dragStarted.current = true;
        startDrag(page.id);
        cleanup();
      }
    }

    function onUp() {
      cleanup();
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      startPos.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(true);
  }

  function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    trashPage(page.id);
  }

  function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(false);
  }

  function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded(true);
    createPage(page.id);
  }

  const rowClass = [
    "page-item-row",
    isActive ? "active" : "",
    confirming ? "confirming" : "",
    isDragging ? "dragging" : "",
    isOver && overPosition === "before" ? "drop-before" : "",
    isOver && overPosition === "after" ? "drop-after" : "",
    isOver && overPosition === "inside" ? "drop-inside" : "",
  ].filter(Boolean).join(" ");

  return (
    <div>
      <div
        data-page-id={page.id}
        className={rowClass}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onPointerDown={handlePointerDown}
        onClick={() => !confirming && !dragStarted.current && selectPage(page.id)}
      >
        {confirming ? (
          <>
            <span className="page-item-emoji">
              <Trash2 size={13} />
            </span>
            <span className="page-item-title" style={{ fontSize: 12 }}>
              Deletar?
            </span>
            <div className="page-item-actions" style={{ display: "flex" }}>
              <button className="page-item-action-btn confirm-yes" onClick={handleConfirm} title="Confirmar exclusão">
                <Check size={13} />
              </button>
              <button className="page-item-action-btn confirm-no" onClick={handleCancel} title="Cancelar">
                <X size={13} />
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              className="page-item-expand"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              style={{ opacity: hasChildren ? 1 : 0, pointerEvents: hasChildren ? "auto" : "none" }}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            <span className="page-item-emoji">
              {page.emoji ?? (
                page.type === "canvas" ? <PenTool size={13} /> :
                page.type === "folder" ? (expanded ? <FolderOpen size={13} /> : <Folder size={13} />) :
                <FileText size={13} />
              )}
            </span>

            <span className="page-item-title">{page.title || "Sem título"}</span>

            <div className="page-item-actions">
              <button
                className={`page-item-action-btn ${page.is_favorite ? "favorited" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleFavorite(page.id); }}
                title={page.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                <Star size={13} fill={page.is_favorite ? "currentColor" : "none"} />
              </button>
              <button className="page-item-action-btn" onClick={handleAddChild} title="Nova subpágina">
                <Plus size={13} />
              </button>
              <button className="page-item-action-btn" onClick={handleDeleteClick} title="Deletar">
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      {expanded &&
        page.children.map((child) => (
          <PageItem key={child.id} page={child} depth={depth + 1} />
        ))}
    </div>
  );
}
