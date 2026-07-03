import { useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2, FileText, PenTool, Folder, FolderOpen, X, Check, Star, CalendarDays, LayoutGrid } from "lucide-react";
import type { PageWithChildren } from "../../types";
import { usePagesStore } from "../../store/pages.store";
import { useUIStore } from "../../store/ui.store";
import { useDragCtx } from "./DragContext";

function getDescendantIds(page: PageWithChildren): string[] {
  return page.children.flatMap((c) => [c.id, ...getDescendantIds(c)]);
}

interface Props {
  page: PageWithChildren;
  depth: number;
}

const DRAG_THRESHOLD = 5;
const LONG_PRESS_MS = 400;
const TOUCH_SCROLL_THRESHOLD = 10;

export default function PageItem({ page, depth }: Props) {
  const [confirming, setConfirming] = useState(false);
  const { selectedPageId, selectPage, createPage, trashPage, toggleFavorite } = usePagesStore();
  const { expandedPages, collapsePage, expandPage } = useUIStore();
  const { draggedId, overId, overPosition, startDrag } = useDragCtx();

  const expanded = expandedPages.has(page.id);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);

  const isActive = selectedPageId === page.id;
  const hasChildren = page.children.length > 0;
  const isDragging = draggedId === page.id;
  const isOver = overId === page.id;

  // Auto-expand ao arrastar por cima: só expande depois de pairar
  // um tempinho, pra não abrir instantaneamente ao só passar por cima
  // enquanto arrasta pra outro lugar.
  useEffect(() => {
    if (!isOver || overPosition !== "inside" || expanded) return;
    const timer = setTimeout(() => expandPage(page.id), 600);
    return () => clearTimeout(timer);
  }, [isOver, overPosition, expanded, page.id, expandPage]);

  function handlePointerDown(e: React.PointerEvent) {
    if (confirming) return;

    // ── Touch: long-press (400ms parado) inicia o drag; mover antes é scroll ──
    if (e.pointerType === "touch") {
      startPos.current = { x: e.clientX, y: e.clientY };
      dragStarted.current = false;

      // Bloqueia a rolagem do gesto atual quando o drag assume (precisa ser
      // listener não-passivo; touch-action via CSS mataria o scroll sempre)
      const blockScroll = (ev: TouchEvent) => ev.preventDefault();

      const timer = setTimeout(() => {
        dragStarted.current = true;
        window.addEventListener("touchmove", blockScroll, { passive: false });
        if ("vibrate" in navigator) navigator.vibrate(25);
        startDrag(page.id);
      }, LONG_PRESS_MS);

      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
        window.removeEventListener("touchmove", blockScroll);
        startPos.current = null;
      };
      const onMove = (e2: PointerEvent) => {
        if (dragStarted.current || !startPos.current) return;
        const dist = Math.hypot(
          e2.clientX - startPos.current.x,
          e2.clientY - startPos.current.y
        );
        // Movimento antes do long-press completar = scroll → cancela o drag
        if (dist > TOUCH_SCROLL_THRESHOLD) cleanup();
      };
      const onEnd = () => cleanup();

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
      return;
    }

    // ── Mouse/caneta: arrasta após mover 5px (comportamento original) ──
    if (e.button !== 0) return;
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
    expandPage(page.id);
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
        onContextMenu={(e) => e.preventDefault()}
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
              onClick={(e) => {
                e.stopPropagation();
                if (expanded) collapsePage(page.id, getDescendantIds(page));
                else expandPage(page.id);
              }}
              style={{ opacity: hasChildren ? 1 : 0, pointerEvents: hasChildren ? "auto" : "none" }}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            <span className="page-item-emoji">
              {page.emoji ?? (
                page.type === "canvas" ? <PenTool size={13} /> :
                page.type === "board" ? <LayoutGrid size={13} /> :
                page.type === "folder" ? (expanded ? <FolderOpen size={13} /> : <Folder size={13} />) :
                page.type === "daily" ? <CalendarDays size={13} /> :
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
