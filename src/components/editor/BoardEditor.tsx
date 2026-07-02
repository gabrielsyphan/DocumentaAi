import { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Trash2, X, Check, GripVertical, LayoutGrid, Pencil,
} from "lucide-react";
import { usePagesStore } from "../../store/pages.store";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BoardColumn {
  id: string;
  title: string;
  order: number;
}

export interface BoardCard {
  id: string;
  columnId: string;
  title: string;
  description: string;
  order: number;
  createdAt: string;
}

export interface BoardData {
  columns: BoardColumn[];
  cards: BoardCard[];
}

function makeId() {
  return crypto.randomUUID();
}

function defaultBoard(): BoardData {
  const c1 = makeId(), c2 = makeId(), c3 = makeId();
  return {
    columns: [
      { id: c1, title: "A Fazer", order: 0 },
      { id: c2, title: "Em Andamento", order: 1 },
      { id: c3, title: "Concluído", order: 2 },
    ],
    cards: [],
  };
}

function parseBoard(content: string | null): BoardData {
  if (!content) return defaultBoard();
  try {
    const parsed = JSON.parse(content);
    if (parsed?.columns && parsed?.cards) return parsed;
    return defaultBoard();
  } catch {
    return defaultBoard();
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface CardItemProps {
  card: BoardCard;
  onEdit: (card: BoardCard) => void;
  onDelete: (id: string) => void;
  overlay?: boolean;
}

function CardItem({ card, onEdit, onDelete, overlay }: CardItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { type: "card", card } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !overlay ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`board-card${overlay ? " board-card--overlay" : ""}`}
    >
      <div className="board-card-grip" {...attributes} {...listeners}>
        <GripVertical size={12} />
      </div>
      <button className="board-card-body" onClick={() => onEdit(card)}>
        <span className="board-card-title">{card.title || "Sem título"}</span>
        {card.description && (
          <span className="board-card-desc">{card.description}</span>
        )}
      </button>
      <button
        className="board-card-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
        title="Remover card"
      >
        <X size={11} />
      </button>
    </div>
  );
}

interface ColumnProps {
  column: BoardColumn;
  cards: BoardCard[];
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onAddCard: (columnId: string) => void;
  onEditCard: (card: BoardCard) => void;
  onDeleteCard: (id: string) => void;
}

function ColumnItem({
  column, cards, onRename, onDelete, onAddCard, onEditCard, onDeleteCard,
}: ColumnProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: column.id, data: { type: "column", column } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed) onRename(column.id, trimmed);
    else setDraft(column.title);
    setEditing(false);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const cardIds = cards.map((c) => c.id);

  return (
    <div ref={setNodeRef} style={style} className="board-column">
      <div className="board-column-header">
        <div className="board-column-drag-handle" {...attributes} {...listeners}>
          <GripVertical size={13} />
        </div>

        {editing ? (
          <input
            ref={inputRef}
            className="board-column-title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setDraft(column.title); setEditing(false); }
            }}
          />
        ) : (
          <span
            className="board-column-title"
            onDoubleClick={() => { setDraft(column.title); setEditing(true); }}
          >
            {column.title}
          </span>
        )}

        <span className="board-column-count">{cards.length}</span>

        <div className="board-column-actions">
          {!editing && (
            <button
              className="board-col-btn"
              onClick={() => { setDraft(column.title); setEditing(true); }}
              title="Renomear coluna"
            >
              <Pencil size={11} />
            </button>
          )}
          {confirmDelete ? (
            <>
              <button className="board-col-btn board-col-btn--danger" onClick={() => onDelete(column.id)} title="Confirmar exclusão">
                <Check size={11} />
              </button>
              <button className="board-col-btn" onClick={() => setConfirmDelete(false)} title="Cancelar">
                <X size={11} />
              </button>
            </>
          ) : (
            <button
              className="board-col-btn"
              onClick={() => setConfirmDelete(true)}
              title="Remover coluna"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="board-column-cards">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onEdit={onEditCard}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>
      </div>

      <button
        className="board-add-card-btn"
        onClick={() => onAddCard(column.id)}
      >
        <Plus size={13} /> Adicionar card
      </button>
    </div>
  );
}

// ── Card edit modal ────────────────────────────────────────────────────────────

interface CardModalProps {
  card: BoardCard;
  columnTitle: string;
  onSave: (updated: Partial<BoardCard>) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function CardModal({ card, columnTitle, onSave, onClose, onDelete }: CardModalProps) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);

  function handleSave() {
    onSave({ title: title.trim() || "Sem título", description });
    onClose();
  }

  return (
    <div className="board-modal-overlay" onClick={onClose}>
      <div className="board-modal" onClick={(e) => e.stopPropagation()}>
        <div className="board-modal-header">
          <span className="board-modal-column-label">
            <LayoutGrid size={12} /> {columnTitle}
          </span>
          <button className="board-modal-close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <input
          className="board-modal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título do card"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />

        <textarea
          className="board-modal-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição (opcional)..."
          rows={5}
        />

        <div className="board-modal-footer">
          <button
            className="board-modal-delete"
            onClick={() => { onDelete(card.id); onClose(); }}
          >
            <Trash2 size={13} /> Remover
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="board-modal-cancel" onClick={onClose}>Cancelar</button>
            <button className="board-modal-save" onClick={handleSave}>
              <Check size={13} /> Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main BoardEditor ───────────────────────────────────────────────────────────

interface Props {
  pageId: string;
}

export default function BoardEditor({ pageId }: Props) {
  const { pages, updatePage } = usePagesStore();
  const page = pages.find((p) => p.id === pageId);

  const [board, setBoard] = useState<BoardData>(() => parseBoard(page?.content ?? null));
  const [activeDragCard, setActiveDragCard] = useState<BoardCard | null>(null);
  const [activeDragColumn, setActiveDragColumn] = useState<BoardColumn | null>(null);
  const [editingCard, setEditingCard] = useState<BoardCard | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Reset when switching pages
  useEffect(() => {
    setBoard(parseBoard(page?.content ?? null));
    setEditingCard(null);
  }, [pageId]);

  const save = useCallback(
    (data: BoardData) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updatePage(pageId, { content: JSON.stringify(data) });
      }, 600);
    },
    [pageId, updatePage]
  );

  // Save immediately when navigating away
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      setBoard((current) => {
        updatePage(pageId, { content: JSON.stringify(current) });
        return current;
      });
    };
  }, [pageId, updatePage]);

  function update(updater: (prev: BoardData) => BoardData) {
    setBoard((prev) => {
      const next = updater(prev);
      save(next);
      return next;
    });
  }

  // ── Column CRUD ──

  function addColumn() {
    const maxOrder = board.columns.reduce((m, c) => Math.max(m, c.order), -1);
    update((b) => ({
      ...b,
      columns: [...b.columns, { id: makeId(), title: "Nova coluna", order: maxOrder + 1 }],
    }));
  }

  function renameColumn(id: string, title: string) {
    update((b) => ({
      ...b,
      columns: b.columns.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  }

  function deleteColumn(id: string) {
    update((b) => ({
      columns: b.columns.filter((c) => c.id !== id),
      cards: b.cards.filter((card) => card.columnId !== id),
    }));
  }

  // ── Card CRUD ──

  function addCard(columnId: string) {
    const colCards = board.cards.filter((c) => c.columnId === columnId);
    const maxOrder = colCards.reduce((m, c) => Math.max(m, c.order), -1);
    const newCard: BoardCard = {
      id: makeId(),
      columnId,
      title: "",
      description: "",
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
    };
    update((b) => ({ ...b, cards: [...b.cards, newCard] }));
    setEditingCard(newCard);
  }

  function saveCard(id: string, patch: Partial<BoardCard>) {
    update((b) => ({
      ...b,
      cards: b.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
    if (editingCard?.id === id) {
      setEditingCard((prev) => prev ? { ...prev, ...patch } : null);
    }
  }

  function deleteCard(id: string) {
    update((b) => ({ ...b, cards: b.cards.filter((c) => c.id !== id) }));
    if (editingCard?.id === id) setEditingCard(null);
  }

  // ── DnD ──

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function onDragStart(event: DragStartEvent) {
    const { type, card, column } = event.active.data.current as {
      type: string; card?: BoardCard; column?: BoardColumn;
    };
    if (type === "card" && card) setActiveDragCard(card);
    if (type === "column" && column) setActiveDragColumn(column);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as { type: string; card?: BoardCard };
    if (activeData.type !== "card") return;

    const activeCard = activeData.card!;
    const overId = over.id as string;

    // Determine target column
    const overData = over.data.current as { type?: string; card?: BoardCard; column?: BoardColumn } | undefined;
    const targetColumnId =
      overData?.type === "column" ? over.id as string :
      overData?.type === "card" ? overData.card!.columnId :
      null;

    if (!targetColumnId || activeCard.columnId === targetColumnId) return;

    // Move card to new column
    update((b) => ({
      ...b,
      cards: b.cards.map((c) =>
        c.id === activeCard.id ? { ...c, columnId: targetColumnId, order: -1 } : c
      ),
    }));

    // Keep activeDragCard in sync so DragOverlay reflects updated state
    setActiveDragCard((prev) => prev ? { ...prev, columnId: targetColumnId } : null);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragCard(null);
    setActiveDragColumn(null);

    if (!over || active.id === over.id) return;

    const activeData = active.data.current as { type: string; card?: BoardCard; column?: BoardColumn };

    if (activeData.type === "column") {
      update((b) => {
        const oldIdx = b.columns.findIndex((c) => c.id === active.id);
        const newIdx = b.columns.findIndex((c) => c.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return b;
        const reordered = arrayMove(b.columns, oldIdx, newIdx).map((c, i) => ({
          ...c,
          order: i,
        }));
        return { ...b, columns: reordered };
      });
      return;
    }

    if (activeData.type === "card") {
      update((b) => {
        const overData = over.data.current as { type?: string; card?: BoardCard } | undefined;
        const targetColumnId =
          overData?.type === "card" ? overData.card!.columnId :
          overData?.type === "column" ? over.id as string :
          null;

        if (!targetColumnId) return b;

        const colCards = b.cards
          .filter((c) => c.columnId === targetColumnId)
          .sort((a, z) => a.order - z.order);

        const movedCard = b.cards.find((c) => c.id === active.id);
        if (!movedCard) return b;

        const updatedCard = { ...movedCard, columnId: targetColumnId };

        let reordered: BoardCard[];
        const overCardIdx = colCards.findIndex((c) => c.id === over.id);

        if (overCardIdx === -1) {
          // Dropped on column header or empty space → append
          reordered = [...colCards.filter((c) => c.id !== active.id), updatedCard];
        } else {
          const withoutActive = colCards.filter((c) => c.id !== active.id);
          const insertIdx = withoutActive.findIndex((c) => c.id === over.id);
          withoutActive.splice(insertIdx >= 0 ? insertIdx : withoutActive.length, 0, updatedCard);
          reordered = withoutActive;
        }

        const reorderedWithOrder = reordered.map((c, i) => ({ ...c, order: i }));
        const otherCards = b.cards.filter(
          (c) => c.columnId !== targetColumnId && c.id !== active.id
        );

        return { ...b, cards: [...otherCards, ...reorderedWithOrder] };
      });
    }
  }

  // ── Render ──

  const sortedColumns = [...board.columns].sort((a, b) => a.order - b.order);
  const columnIds = sortedColumns.map((c) => c.id);

  function titleChange(e: React.ChangeEvent<HTMLInputElement>) {
    updatePage(pageId, { title: e.target.value });
  }

  const editingCardColumn = editingCard
    ? board.columns.find((c) => c.id === editingCard.columnId)
    : null;

  return (
    <div className="board-editor">
      <div className="editor-topbar">
        <input
          className="page-title-input"
          value={page?.title ?? ""}
          onChange={titleChange}
          placeholder="Sem título"
        />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="board-canvas">
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            {sortedColumns.map((col) => {
              const colCards = board.cards
                .filter((c) => c.columnId === col.id)
                .sort((a, b) => a.order - b.order);
              return (
                <ColumnItem
                  key={col.id}
                  column={col}
                  cards={colCards}
                  onRename={renameColumn}
                  onDelete={deleteColumn}
                  onAddCard={addCard}
                  onEditCard={setEditingCard}
                  onDeleteCard={deleteCard}
                />
              );
            })}
          </SortableContext>

          <button className="board-add-column-btn" onClick={addColumn}>
            <Plus size={14} /> Nova coluna
          </button>
        </div>

        <DragOverlay>
          {activeDragCard && (
            <CardItem
              card={activeDragCard}
              onEdit={() => {}}
              onDelete={() => {}}
              overlay
            />
          )}
          {activeDragColumn && (
            <div className="board-column board-column--overlay">
              <div className="board-column-header">
                <span className="board-column-title">{activeDragColumn.title}</span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {editingCard && (
        <CardModal
          card={editingCard}
          columnTitle={editingCardColumn?.title ?? ""}
          onSave={(patch) => saveCard(editingCard.id, patch)}
          onClose={() => setEditingCard(null)}
          onDelete={deleteCard}
        />
      )}
    </div>
  );
}
