import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePagesStore } from "../../store/pages.store";

interface DragCtx {
  draggedId: string | null;
  overId: string | null;
  overPosition: "before" | "after" | "inside";
  startDrag: (id: string) => void;
}

const DragContext = createContext<DragCtx>(null!);
export const useDragCtx = () => useContext(DragContext);

export function DragProvider({ children }: { children: React.ReactNode }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overPosition, setOverPosition] = useState<"before" | "after" | "inside">("before");
  const { movePage } = usePagesStore();

  const draggedRef = useRef<string | null>(null);
  const overIdRef = useRef<string | null>(null);
  const overPosRef = useRef<"before" | "after" | "inside">("before");

  function startDrag(id: string) {
    draggedRef.current = id;
    overIdRef.current = null;
    setDraggedId(id);
    setOverId(null);
    document.documentElement.style.cursor = "grabbing";
    window.getSelection()?.removeAllRanges();
  }

  useEffect(() => {
    if (!draggedId) return;

    function onMove(e: PointerEvent) {
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const row = el?.closest<HTMLElement>("[data-page-id]");

      if (row && row.dataset.pageId !== draggedRef.current) {
        const id = row.dataset.pageId!;
        const rect = row.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const ratio = relY / rect.height;

        // Top 25% → before, bottom 25% → after, middle 50% → inside
        let pos: "before" | "after" | "inside";
        if (ratio < 0.25) pos = "before";
        else if (ratio > 0.75) pos = "after";
        else pos = "inside";

        overIdRef.current = id;
        overPosRef.current = pos;
        setOverId(id);
        setOverPosition(pos);
      } else if (!row) {
        overIdRef.current = null;
        setOverId(null);
      }
    }

    function onUp() {
      const did = draggedRef.current;
      const oid = overIdRef.current;
      const pos = overPosRef.current;
      if (did && oid && did !== oid) {
        movePage(did, oid, pos);
      }
      draggedRef.current = null;
      overIdRef.current = null;
      setDraggedId(null);
      setOverId(null);
      document.documentElement.style.cursor = "";
    }

    // No touch, o sistema pode cancelar o gesto (pointercancel) — sem tratar,
    // o drag ficaria preso com draggedId setado para sempre
    function onCancel() {
      draggedRef.current = null;
      overIdRef.current = null;
      setDraggedId(null);
      setOverId(null);
      document.documentElement.style.cursor = "";
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.documentElement.style.cursor = "";
    };
  }, [draggedId, movePage]);

  return (
    <DragContext.Provider value={{ draggedId, overId, overPosition, startDrag }}>
      {children}
    </DragContext.Provider>
  );
}
