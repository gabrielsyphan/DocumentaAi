// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SnippetBlock = Record<string, any>;

export interface Snippet {
  id: string;
  name: string;
  trigger: string;
  blocks: SnippetBlock[];
  isBuiltin?: boolean;
}

const STORAGE_KEY = "documentaai-snippets-v1";

function todayBR() {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function p(text: string) {
  return { type: "paragraph", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text, styles: {} }], children: [] };
}
function h(level: number, text: string) {
  return { type: "heading", props: { level, textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text, styles: {} }], children: [] };
}
function bullet(text = "") {
  return { type: "bulletListItem", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text, styles: {} }], children: [] };
}
function numbered(text = "") {
  return { type: "numberedListItem", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text, styles: {} }], children: [] };
}
function check(text = "", checked = false) {
  return { type: "checkListItem", props: { checked, textColor: "default", backgroundColor: "default", textAlignment: "left" }, content: [{ type: "text", text, styles: {} }], children: [] };
}

export const BUILTIN_SNIPPETS: Snippet[] = [
  {
    id: "builtin-reuniao",
    name: "Reunião",
    trigger: "reuniao",
    isBuiltin: true,
    blocks: [
      h(2, `Reunião — ${todayBR()}`),
      h(3, "Participantes"),
      bullet(),
      h(3, "Pauta"),
      bullet(),
      h(3, "Ações"),
      check(),
    ],
  },
  {
    id: "builtin-semanal",
    name: "Revisão Semanal",
    trigger: "semanal",
    isBuiltin: true,
    blocks: [
      h(2, "Revisão Semanal"),
      h(3, "O que fiz bem"),
      bullet(),
      h(3, "O que pode melhorar"),
      bullet(),
      h(3, "Prioridades da próxima semana"),
      numbered(),
    ],
  },
  {
    id: "builtin-estudo",
    name: "Anotações de Estudo",
    trigger: "estudo",
    isBuiltin: true,
    blocks: [
      h(2, "Tópico:"),
      h(3, "Conceitos-chave"),
      bullet(),
      h(3, "Dúvidas"),
      bullet(),
      h(3, "Resumo"),
      p(""),
    ],
  },
  {
    id: "builtin-bullet",
    name: "Bullet Journal",
    trigger: "bullet",
    isBuiltin: true,
    blocks: [
      h(2, todayBR()),
      h(3, "Tarefas"),
      check(),
      h(3, "Eventos"),
      bullet(),
      h(3, "Notas"),
      p(""),
    ],
  },
];

export function loadCustomSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveCustomSnippet(snippet: Snippet): void {
  const snippets = loadCustomSnippets();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...snippets, snippet]));
}

export function deleteCustomSnippet(id: string): void {
  const snippets = loadCustomSnippets().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
}

export function getAllSnippets(): Snippet[] {
  return [...BUILTIN_SNIPPETS, ...loadCustomSnippets()];
}
