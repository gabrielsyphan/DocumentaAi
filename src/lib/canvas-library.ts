// Biblioteca de formas pré-definidas para o Excalidraw
// Cada LibraryItem é um grupo que aparece no painel de biblioteca (ícone de livro)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = Record<string, any>;

const BASE: El = {
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
function rounded(id: string, x: number, y: number, w: number, h: number, extra: El = {}): El {
  return { ...BASE, id, type: "rectangle", x, y, width: w, height: h, roundness: { type: 3 }, ...extra };
}
function text(id: string, x: number, y: number, w: number, h: number, txt: string, extra: El = {}): El {
  return {
    ...BASE, id, type: "text", x, y, width: w, height: h,
    text: txt, originalText: txt,
    fontSize: 14, fontFamily: 2,
    textAlign: "center", verticalAlign: "middle",
    baseline: 12, containerId: null, autoResize: true, lineHeight: 1.25,
    ...extra,
  };
}
function arrow(id: string, x: number, y: number, pts: number[][], extra: El = {}): El {
  const [last] = pts.slice(-1);
  return {
    ...BASE, id, type: "arrow", x, y,
    width: Math.abs(last[0]), height: Math.abs(last[1]),
    points: pts,
    startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: "arrow",
    lastCommittedPoint: null,
    ...extra,
  };
}

// Helper: cria um item de biblioteca
function item(id: string, name: string, elements: El[]) {
  return { id, status: "unpublished" as const, name, created: 1, elements };
}

// ── 1. Formas básicas ─────────────────────────────────────────────────────────

const BASICS = [
  item("lib-rect",     "Retângulo",              [rect("r1", 0, 0, 160, 80)]),
  item("lib-ellipse",  "Elipse",                 [ellipse("e1", 0, 0, 160, 80)]),
  item("lib-diamond",  "Losango",                [diamond("d1", 0, 0, 140, 100)]),
  item("lib-rounded",  "Retângulo arredondado",  [rounded("rr1", 0, 0, 160, 70)]),
  item("lib-arrow",    "Seta",                   [arrow("a1", 0, 0, [[0,0],[120,0]])]),
  item("lib-dblarrow", "Seta dupla",             [arrow("da1", 0, 0, [[0,0],[120,0]], { startArrowhead: "arrow" })]),
];

// ── 2. Fluxograma ─────────────────────────────────────────────────────────────

const FLOWCHART = [
  item("lib-flow-start", "Fluxo: Início / Fim", [
    rounded("fs1", 0, 0, 160, 54, { backgroundColor: "#d0f4de", strokeColor: "#22c55e" }),
    text("fs2", 0, 0, 160, 54, "Início / Fim"),
  ]),
  item("lib-flow-proc", "Fluxo: Processo", [
    rect("fp1", 0, 0, 160, 60, { backgroundColor: "#dbeafe", strokeColor: "#3b82f6" }),
    text("fp2", 0, 0, 160, 60, "Processo"),
  ]),
  item("lib-flow-dec", "Fluxo: Decisão", [
    diamond("fd1", 0, 0, 160, 100, { backgroundColor: "#fef9c3", strokeColor: "#eab308" }),
    text("fd2", 14, 28, 132, 44, "Decisão?"),
  ]),
  item("lib-flow-io", "Fluxo: Entrada / Saída", [
    // parallelogram via diamond rotated — use simple rect with label
    rect("fi1", 0, 0, 160, 60, { backgroundColor: "#f3e8ff", strokeColor: "#a855f7" }),
    text("fi2", 0, 0, 160, 60, "Entrada / Saída"),
  ]),
];

// ── 3. System Design ─────────────────────────────────────────────────────────

const SD_BLUE   = "#dbeafe"; const SD_BLUE_S   = "#3b82f6";
const SD_GREEN  = "#dcfce7"; const SD_GREEN_S  = "#22c55e";
const SD_ORANGE = "#ffedd5"; const SD_ORANGE_S = "#f97316";
const SD_PURPLE = "#f3e8ff"; const SD_PURPLE_S = "#a855f7";
const SD_RED    = "#fee2e2"; const SD_RED_S    = "#ef4444";
const SD_TEAL   = "#ccfbf1"; const SD_TEAL_S   = "#14b8a6";
const SD_GRAY   = "#f1f5f9"; const SD_GRAY_S   = "#64748b";

const SYSTEM_DESIGN = [
  // Cliente Web
  item("sd-web-client", "SD: Cliente Web", [
    rounded("sdwc1", 0, 0, 140, 90, { backgroundColor: SD_GRAY, strokeColor: SD_GRAY_S }),
    // "tela"
    rect("sdwc2", 14, 10, 112, 58, { backgroundColor: "#e2e8f0", strokeColor: SD_GRAY_S, strokeWidth: 1 }),
    // barra de tabs
    rect("sdwc3", 14, 10, 112, 12, { backgroundColor: "#cbd5e1", strokeColor: SD_GRAY_S, strokeWidth: 1 }),
    text("sdwc4", 0, 72, 140, 18, "Cliente Web", { fontSize: 11, strokeColor: SD_GRAY_S }),
  ]),

  // Cliente Mobile
  item("sd-mobile", "SD: Cliente Mobile", [
    rounded("sdm1", 20, 0, 80, 120, { backgroundColor: SD_GRAY, strokeColor: SD_GRAY_S }),
    rect("sdm2", 30, 14, 60, 80, { backgroundColor: "#e2e8f0", strokeColor: SD_GRAY_S, strokeWidth: 1 }),
    ellipse("sdm3", 47, 100, 26, 10, { backgroundColor: SD_GRAY_S, strokeColor: SD_GRAY_S }),
    text("sdm4", 0, 126, 120, 16, "Cliente Mobile", { fontSize: 11, strokeColor: SD_GRAY_S }),
  ]),

  // Servidor / Serviço
  item("sd-service", "SD: Serviço / Servidor", [
    rect("sds1", 0, 0, 160, 64, { backgroundColor: SD_BLUE, strokeColor: SD_BLUE_S }),
    // ícone de servidor (linhas horizontais)
    rect("sds2", 12, 12, 24, 8, { backgroundColor: SD_BLUE_S, strokeColor: SD_BLUE_S, strokeWidth: 1 }),
    rect("sds3", 12, 24, 24, 8, { backgroundColor: SD_BLUE_S, strokeColor: SD_BLUE_S, strokeWidth: 1 }),
    rect("sds4", 12, 36, 24, 8, { backgroundColor: SD_BLUE_S, strokeColor: SD_BLUE_S, strokeWidth: 1 }),
    text("sds5", 40, 8, 108, 48, "Serviço", { fontSize: 15, strokeColor: SD_BLUE_S }),
  ]),

  // Banco de dados (cilindro)
  item("sd-database", "SD: Banco de Dados", [
    // corpo
    rect("sdd1", 10, 16, 120, 80, { backgroundColor: SD_BLUE, strokeColor: SD_BLUE_S }),
    // tampa superior
    ellipse("sdd2", 10, 4, 120, 28, { backgroundColor: SD_BLUE, strokeColor: SD_BLUE_S }),
    // borda inferior (ilusão de profundidade)
    ellipse("sdd3", 10, 80, 120, 24, { backgroundColor: SD_BLUE, strokeColor: SD_BLUE_S }),
    text("sdd4", 10, 48, 120, 32, "Banco de\nDados", { fontSize: 13, strokeColor: SD_BLUE_S }),
  ]),

  // Cache / Redis
  item("sd-cache", "SD: Cache", [
    rect("sdc1", 0, 0, 140, 64, { backgroundColor: SD_RED, strokeColor: SD_RED_S }),
    ellipse("sdc2", 10, 8, 36, 14, { backgroundColor: SD_RED_S, strokeColor: SD_RED_S }),
    ellipse("sdc3", 10, 26, 36, 14, { backgroundColor: SD_RED_S, strokeColor: SD_RED_S }),
    text("sdc4", 50, 8, 80, 48, "Cache", { fontSize: 15, strokeColor: SD_RED_S }),
  ]),

  // Fila / Message Queue
  item("sd-queue", "SD: Fila / Queue", [
    rect("sdq1", 0, 16, 170, 48, { backgroundColor: SD_ORANGE, strokeColor: SD_ORANGE_S }),
    // "pacotes" na fila
    rect("sdq2", 12, 24, 28, 32, { backgroundColor: SD_ORANGE_S, strokeColor: SD_ORANGE_S, strokeWidth: 1 }),
    rect("sdq3", 46, 24, 28, 32, { backgroundColor: SD_ORANGE_S, strokeColor: SD_ORANGE_S, strokeWidth: 1 }),
    rect("sdq4", 80, 24, 28, 32, { backgroundColor: SD_ORANGE_S, strokeColor: SD_ORANGE_S, strokeWidth: 1 }),
    arrow("sdq5", 112, 38, [[0,0],[46,0]], { strokeColor: SD_ORANGE_S }),
    text("sdq6", 0, 66, 170, 18, "Fila / Queue", { fontSize: 11, strokeColor: SD_ORANGE_S }),
  ]),

  // API Gateway
  item("sd-api-gateway", "SD: API Gateway", [
    diamond("sdg1", 0, 0, 160, 100, { backgroundColor: SD_PURPLE, strokeColor: SD_PURPLE_S }),
    text("sdg2", 24, 26, 112, 48, "API\nGateway", { fontSize: 13, strokeColor: SD_PURPLE_S }),
  ]),

  // Load Balancer
  item("sd-load-balancer", "SD: Load Balancer", [
    rounded("sdlb1", 0, 0, 160, 64, { backgroundColor: SD_GREEN, strokeColor: SD_GREEN_S }),
    // ícone de balança simplificado (linhas)
    rect("sdlb2", 78, 16, 4, 28, { backgroundColor: SD_GREEN_S, strokeColor: SD_GREEN_S, strokeWidth: 1 }),
    rect("sdlb3", 42, 16, 76, 4, { backgroundColor: SD_GREEN_S, strokeColor: SD_GREEN_S, strokeWidth: 1 }),
    ellipse("sdlb4", 38, 22, 18, 12, { backgroundColor: SD_GREEN_S, strokeColor: SD_GREEN_S }),
    ellipse("sdlb5", 104, 22, 18, 12, { backgroundColor: SD_GREEN_S, strokeColor: SD_GREEN_S }),
    text("sdlb6", 0, 44, 160, 18, "Load Balancer", { fontSize: 12, strokeColor: SD_GREEN_S }),
  ]),

  // CDN
  item("sd-cdn", "SD: CDN", [
    rounded("sdcdn1", 0, 0, 160, 60, { backgroundColor: SD_TEAL, strokeColor: SD_TEAL_S }),
    text("sdcdn2", 0, 0, 160, 60, "CDN", { fontSize: 18, strokeColor: SD_TEAL_S }),
  ]),

  // Microserviço
  item("sd-microservice", "SD: Microserviço", [
    rounded("sdms1", 10, 0, 120, 52, { backgroundColor: SD_BLUE, strokeColor: SD_BLUE_S }),
    text("sdms2", 10, 0, 120, 52, "Microserviço", { fontSize: 12, strokeColor: SD_BLUE_S }),
  ]),

  // Zona / Cloud Region (fronteira)
  item("sd-cloud-region", "SD: Zona / Nuvem", [
    rounded("sdcr1", 0, 0, 360, 240, {
      backgroundColor: "transparent",
      strokeColor: SD_GRAY_S,
      strokeStyle: "dashed",
      strokeWidth: 1,
    }),
    text("sdcr2", 8, 6, 120, 20, "☁ Zona / Nuvem", { fontSize: 12, strokeColor: SD_GRAY_S, textAlign: "left" }),
  ]),

  // Arquitetura básica (template completo)
  item("sd-arch-template", "SD: Template de arquitetura", [
    // Client
    rounded("sat1", 20, 0, 120, 52, { backgroundColor: SD_GRAY, strokeColor: SD_GRAY_S }),
    text("sat2", 20, 0, 120, 52, "🌐 Cliente", { fontSize: 13, strokeColor: SD_GRAY_S }),
    // seta client → lb
    arrow("sat3", 80, 52, [[0,0],[0,48]], { strokeColor: "#64748b" }),
    // Load Balancer
    rounded("sat4", 20, 100, 120, 48, { backgroundColor: SD_GREEN, strokeColor: SD_GREEN_S }),
    text("sat5", 20, 100, 120, 48, "Load Balancer", { fontSize: 12, strokeColor: SD_GREEN_S }),
    // seta lb → service
    arrow("sat6", 80, 148, [[0,0],[0,48]], { strokeColor: "#64748b" }),
    // Serviço
    rect("sat7", 20, 196, 120, 52, { backgroundColor: SD_BLUE, strokeColor: SD_BLUE_S }),
    text("sat8", 20, 196, 120, 52, "Serviço API", { fontSize: 13, strokeColor: SD_BLUE_S }),
    // seta service → db
    arrow("sat9", 80, 248, [[0,0],[0,48]], { strokeColor: "#64748b" }),
    // Database
    rect("sat10", 26, 296, 108, 52, { backgroundColor: SD_BLUE, strokeColor: SD_BLUE_S }),
    ellipse("sat11", 26, 284, 108, 28, { backgroundColor: SD_BLUE, strokeColor: SD_BLUE_S }),
    text("sat12", 26, 308, 108, 28, "Banco de Dados", { fontSize: 11, strokeColor: SD_BLUE_S }),
  ]),
];

// ── 4. Logos / Tech Badges ────────────────────────────────────────────────────

function badge(id: string, name: string, label: string, bg: string, stroke: string, textColor = "#fff"): El[] {
  return [
    rounded(`${id}b`, 0, 0, 130, 50, { backgroundColor: bg, strokeColor: stroke }),
    text(`${id}t`, 0, 0, 130, 50, label, { strokeColor: textColor, fontSize: 15, fontFamily: 2 }),
  ];
}

const LOGOS = [
  // Frontend
  item("logo-react",      "Logo: React",       badge("lr",  "React",      "⚛ React",       "#0f172a",  "#61DAFB", "#61DAFB")),
  item("logo-vue",        "Logo: Vue.js",       badge("lv",  "Vue",        "◆ Vue.js",       "#1a4731",  "#42b883", "#42b883")),
  item("logo-angular",    "Logo: Angular",      badge("la",  "Angular",    "▲ Angular",      "#7f0000",  "#DD0031", "#DD0031")),
  item("logo-svelte",     "Logo: Svelte",       badge("lsv", "Svelte",     "◎ Svelte",       "#7c1d06",  "#FF3E00", "#FF3E00")),
  item("logo-nextjs",     "Logo: Next.js",      badge("lnx", "Nextjs",     "▲ Next.js",      "#000000",  "#ffffff", "#ffffff")),
  item("logo-typescript", "Logo: TypeScript",   badge("lts", "TypeScript", "TS TypeScript",  "#1e3a5f",  "#3178C6", "#fff")),

  // Backend
  item("logo-nodejs",     "Logo: Node.js",      badge("lnj", "Nodejs",     "⬡ Node.js",      "#14532d",  "#339933", "#fff")),
  item("logo-python",     "Logo: Python",       badge("lpy", "Python",     "🐍 Python",       "#1e3a5f",  "#3776AB", "#fff")),
  item("logo-go",         "Logo: Go",           badge("lgo", "Go",         "Go",             "#003d5b",  "#00ACD7", "#fff")),
  item("logo-rust",       "Logo: Rust",         badge("lru", "Rust",       "⚙ Rust",          "#3b1504",  "#CE422B", "#fff")),
  item("logo-java",       "Logo: Java",         badge("ljv", "Java",       "☕ Java",          "#7c2d12",  "#f89820", "#fff")),
  item("logo-dotnet",     "Logo: .NET",         badge("lnt", "Dotnet",     ".NET",           "#3b0764",  "#512BD4", "#fff")),

  // Banco de dados
  item("logo-postgres",   "Logo: PostgreSQL",   badge("lpg", "Postgres",   "🐘 PostgreSQL",   "#1e3a5f",  "#336791", "#fff")),
  item("logo-mysql",      "Logo: MySQL",        badge("lmy", "MySQL",      "🐬 MySQL",         "#3b2314",  "#4479A1", "#fff")),
  item("logo-mongodb",    "Logo: MongoDB",      badge("lmg", "Mongo",      "🍃 MongoDB",       "#14532d",  "#47A248", "#fff")),
  item("logo-redis",      "Logo: Redis",        badge("lrd", "Redis",      "Redis",           "#7f1d1d",  "#DC382D", "#fff")),
  item("logo-sqlite",     "Logo: SQLite",       badge("lsl", "SQLite",     "SQLite",          "#1e3a5f",  "#003B57", "#fff")),

  // Infra / Cloud
  item("logo-docker",     "Logo: Docker",       badge("ldk", "Docker",     "🐳 Docker",        "#1e3a5f",  "#2496ED", "#fff")),
  item("logo-k8s",        "Logo: Kubernetes",   badge("lk8", "K8s",        "☸ Kubernetes",    "#1e3a5f",  "#326CE5", "#fff")),
  item("logo-aws",        "Logo: AWS",          badge("law", "AWS",        "☁ AWS",            "#3b1504",  "#FF9900", "#fff")),
  item("logo-gcp",        "Logo: Google Cloud", badge("lgc", "GCP",        "☁ Google Cloud",  "#1e3a5f",  "#4285F4", "#fff")),
  item("logo-azure",      "Logo: Azure",        badge("laz", "Azure",      "☁ Azure",          "#1e3a5f",  "#0089D6", "#fff")),

  // Mensageria / Infra adicional
  item("logo-kafka",      "Logo: Kafka",        badge("lkf", "Kafka",      "Kafka",           "#1a1a1a",  "#888", "#fff")),
  item("logo-rabbitmq",   "Logo: RabbitMQ",     badge("lrb", "RabbitMQ",   "🐰 RabbitMQ",      "#3b1504",  "#FF6600", "#fff")),
  item("logo-nginx",      "Logo: Nginx",        badge("lng", "Nginx",      "N Nginx",         "#14532d",  "#009639", "#fff")),
  item("logo-graphql",    "Logo: GraphQL",      badge("lgq", "GraphQL",    "◈ GraphQL",       "#3b0764",  "#E10098", "#fff")),
];

// ── Wireframe ────────────────────────────────────────────────────────────────

const WIREFRAME = [
  item("lib-wf-button", "Wireframe: Botão", [
    rounded("wb1", 0, 0, 120, 40, { backgroundColor: "#3b82f6", strokeColor: "#2563eb" }),
    text("wb2", 0, 0, 120, 40, "Botão", { strokeColor: "#ffffff", fontSize: 14 }),
  ]),
  item("lib-wf-input", "Wireframe: Campo de texto", [
    text("wi1", 0, 0, 200, 20, "Rótulo", { fontSize: 12, textAlign: "left" }),
    rect("wi2", 0, 24, 200, 36, { backgroundColor: "#f8f9fa" }),
    text("wi3", 8, 24, 184, 36, "Placeholder…", { fontSize: 13, textAlign: "left" }),
  ]),
  item("lib-wf-card", "Wireframe: Card", [
    rounded("wc1", 0, 0, 240, 160, { backgroundColor: "#ffffff", roundness: { type: 3 } }),
    rect("wc2", 0, 0, 240, 70, { backgroundColor: "#e5e7eb", roundness: null }),
    text("wc3", 0, 80, 240, 24, "Título do card"),
    text("wc4", 12, 108, 216, 40, "Descrição curta aqui", { fontSize: 13 }),
  ]),
  item("lib-wf-image", "Wireframe: Placeholder de imagem", [
    rect("wip1", 0, 0, 200, 140, { backgroundColor: "#e5e7eb" }),
    text("wip2", 0, 50, 200, 40, "🖼", { fontSize: 32 }),
  ]),
  item("lib-wf-navbar", "Wireframe: Navbar", [
    rect("wn1", 0, 0, 400, 48, { backgroundColor: "#1e293b", strokeColor: "#334155" }),
    rounded("wn2", 12, 10, 80, 28, { backgroundColor: "#334155", strokeColor: "#475569" }),
    text("wn3", 12, 10, 80, 28, "Logo", { fontSize: 13, strokeColor: "#94a3b8" }),
    text("wn4", 140, 10, 60, 28, "Início", { fontSize: 13, strokeColor: "#e2e8f0" }),
    text("wn5", 210, 10, 70, 28, "Sobre", { fontSize: 13, strokeColor: "#94a3b8" }),
    text("wn6", 290, 10, 80, 28, "Contato", { fontSize: 13, strokeColor: "#94a3b8" }),
  ]),
];

export const CANVAS_LIBRARY = [
  ...BASICS,
  ...FLOWCHART,
  ...SYSTEM_DESIGN,
  ...LOGOS,
  ...WIREFRAME,
];
