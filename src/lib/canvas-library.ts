// Biblioteca de formas pré-definidas para o Excalidraw
// Cada LibraryItem é um grupo de elementos que aparece no painel de biblioteca (ícone de livro)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = Record<string, any>;

const BASE: Omit<El, "type" | "x" | "y" | "width" | "height"> = {
  angle: 0,
  strokeColor: "#1e1e2e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  roundness: null,
  seed: 1,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  groupIds: [],
  frameId: null,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
};

function rect(id: string, x: number, y: number, w: number, h: number, extra: El = {}): El {
  return { ...BASE, id, type: "rectangle", x, y, width: w, height: h, ...extra };
}

function ellipse(id: string, x: number, y: number, w: number, h: number, extra: El = {}): El {
  return { ...BASE, id, type: "ellipse", x, y, width: w, height: h, ...extra };
}

function diamond(id: string, x: number, y: number, w: number, h: number, extra: El = {}): El {
  return { ...BASE, id, type: "diamond", x, y, width: w, height: h, ...extra };
}

function text(id: string, x: number, y: number, w: number, h: number, txt: string, extra: El = {}): El {
  return {
    ...BASE, id, type: "text", x, y, width: w, height: h,
    text: txt, originalText: txt,
    fontSize: 16, fontFamily: 2,
    textAlign: "center", verticalAlign: "middle",
    baseline: 12, containerId: null, autoResize: true, lineHeight: 1.25,
    ...extra,
  };
}

function arrow(id: string, x: number, y: number, w: number, extra: El = {}): El {
  return {
    ...BASE, id, type: "arrow", x, y, width: w, height: 0,
    points: [[0, 0], [w, 0]],
    startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: "arrow",
    lastCommittedPoint: null,
    ...extra,
  };
}

function rounded(id: string, x: number, y: number, w: number, h: number, extra: El = {}): El {
  return { ...BASE, id, type: "rectangle", x, y, width: w, height: h, roundness: { type: 3 }, ...extra };
}

// ── Grupos de biblioteca ──────────────────────────────────────────────────────

export const CANVAS_LIBRARY = [
  // ── Formas básicas ──────────────────────────────────────────────────────────
  {
    id: "lib-rect",
    status: "unpublished" as const,
    name: "Retângulo",
    created: 1,
    elements: [rect("r1", 0, 0, 160, 80)],
  },
  {
    id: "lib-ellipse",
    status: "unpublished" as const,
    name: "Elipse",
    created: 1,
    elements: [ellipse("e1", 0, 0, 160, 80)],
  },
  {
    id: "lib-diamond",
    status: "unpublished" as const,
    name: "Losango",
    created: 1,
    elements: [diamond("d1", 0, 0, 140, 100)],
  },
  {
    id: "lib-arrow",
    status: "unpublished" as const,
    name: "Seta",
    created: 1,
    elements: [arrow("a1", 0, 0, 120)],
  },
  {
    id: "lib-rounded",
    status: "unpublished" as const,
    name: "Retângulo arredondado",
    created: 1,
    elements: [rounded("rr1", 0, 0, 160, 70)],
  },

  // ── Fluxograma ──────────────────────────────────────────────────────────────
  {
    id: "lib-flow-terminator",
    status: "unpublished" as const,
    name: "Fluxo: Início / Fim",
    created: 1,
    elements: [
      rounded("ft1", 0, 0, 160, 60, { backgroundColor: "#d0f4de" }),
      text("ft2", 0, 0, 160, 60, "Início"),
    ],
  },
  {
    id: "lib-flow-process",
    status: "unpublished" as const,
    name: "Fluxo: Processo",
    created: 1,
    elements: [
      rect("fp1", 0, 0, 160, 70, { backgroundColor: "#dbeafe" }),
      text("fp2", 0, 0, 160, 70, "Processo"),
    ],
  },
  {
    id: "lib-flow-decision",
    status: "unpublished" as const,
    name: "Fluxo: Decisão",
    created: 1,
    elements: [
      diamond("fd1", 0, 0, 160, 100, { backgroundColor: "#fef9c3" }),
      text("fd2", 10, 25, 140, 50, "Decisão?"),
    ],
  },
  {
    id: "lib-flow-full",
    status: "unpublished" as const,
    name: "Fluxo: bloco completo",
    created: 1,
    elements: [
      rounded("ff1", 30, 0, 100, 44, { backgroundColor: "#d0f4de" }),
      text("ff2", 30, 0, 100, 44, "Início"),
      arrow("ff3", 80, 44, 0, { points: [[0,0],[0,40]], height: 40, width: 0 }),
      rect("ff4", 5, 84, 150, 50, { backgroundColor: "#dbeafe" }),
      text("ff5", 5, 84, 150, 50, "Passo 1"),
      arrow("ff6", 80, 134, 0, { points: [[0,0],[0,40]], height: 40, width: 0 }),
      diamond("ff7", 0, 174, 160, 80, { backgroundColor: "#fef9c3" }),
      text("ff8", 15, 190, 130, 48, "OK?"),
    ],
  },

  // ── Wireframe ───────────────────────────────────────────────────────────────
  {
    id: "lib-wf-button",
    status: "unpublished" as const,
    name: "Wireframe: Botão",
    created: 1,
    elements: [
      rounded("wb1", 0, 0, 120, 40, { backgroundColor: "#3b82f6", strokeColor: "#2563eb" }),
      text("wb2", 0, 0, 120, 40, "Botão", { strokeColor: "#ffffff", fontSize: 14 }),
    ],
  },
  {
    id: "lib-wf-input",
    status: "unpublished" as const,
    name: "Wireframe: Campo de texto",
    created: 1,
    elements: [
      text("wi1", 0, 0, 200, 20, "Rótulo", { fontSize: 12, textAlign: "left" }),
      rect("wi2", 0, 24, 200, 36, { backgroundColor: "#f8f9fa" }),
      text("wi3", 8, 24, 184, 36, "Placeholder…", { fontSize: 13, textAlign: "left" }),
    ],
  },
  {
    id: "lib-wf-card",
    status: "unpublished" as const,
    name: "Wireframe: Card",
    created: 1,
    elements: [
      rounded("wc1", 0, 0, 240, 160, { backgroundColor: "#ffffff", roundness: { type: 3 } }),
      rect("wc2", 0, 0, 240, 70, { backgroundColor: "#e5e7eb", roundness: null }),
      text("wc3", 0, 80, 240, 24, "Título do card"),
      text("wc4", 12, 108, 216, 40, "Descrição curta aqui", { fontSize: 13 }),
    ],
  },
  {
    id: "lib-wf-image",
    status: "unpublished" as const,
    name: "Wireframe: Placeholder de imagem",
    created: 1,
    elements: [
      rect("wip1", 0, 0, 200, 140, { backgroundColor: "#e5e7eb" }),
      text("wip2", 0, 50, 200, 40, "🖼", { fontSize: 32 }),
    ],
  },
];
