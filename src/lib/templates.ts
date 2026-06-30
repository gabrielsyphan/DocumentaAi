export interface Template {
  id: string;
  name: string;
  /** Nome do ícone Lucide (built-in) ou emoji (custom, vindo da página salva) */
  icon: string;
  isLucideIcon: boolean;
  description: string;
  content: object[];
  isCustom?: boolean;
  createdAt?: string;
}

// ── Helpers para construir blocos BlockNote sem IDs ───────────────────────────

function t(text: string, styles: Record<string, boolean> = {}) {
  return { type: "text", text, styles };
}

function p(...items: object[]) {
  return { type: "paragraph", props: {}, content: items, children: [] };
}

function h(level: 1 | 2 | 3, text: string) {
  return { type: "heading", props: { level }, content: [t(text)], children: [] };
}

function bullet(text: string, children: object[] = []) {
  return { type: "bulletListItem", props: {}, content: [t(text)], children };
}

function num(text: string) {
  return { type: "numberedListItem", props: {}, content: [t(text)], children: [] };
}

function todo(text: string, checked = false) {
  return { type: "checkListItem", props: { checked }, content: [t(text)], children: [] };
}

// ── Templates pré-prontos ─────────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: "meeting",
    name: "Reunião",
    icon: "ClipboardList",
    isLucideIcon: true,
    description: "Pauta, participantes, decisões e próximos passos",
    content: [
      h(2, "Reunião"),
      p(t("Data: "), t("__/__/____", { bold: true }), t("   Horário: "), t("__:__", { bold: true })),
      p(),
      h(3, "Participantes"),
      bullet(""),
      bullet(""),
      p(),
      h(3, "Pauta"),
      num(""),
      num(""),
      num(""),
      p(),
      h(3, "Anotações"),
      p(t("")),
      p(),
      h(3, "Decisões"),
      bullet(""),
      bullet(""),
      p(),
      h(3, "Próximos passos"),
      todo(""),
      todo(""),
      todo(""),
    ],
  },
  {
    id: "weekly-review",
    name: "Review Semanal",
    icon: "CalendarCheck",
    isLucideIcon: true,
    description: "Reflexão da semana: conquistas, aprendizados e próximas prioridades",
    content: [
      h(2, "Review Semanal"),
      p(t("Semana de "), t("__/__", { bold: true }), t(" a "), t("__/__", { bold: true })),
      p(),
      h(3, "O que foi feito"),
      bullet(""),
      bullet(""),
      bullet(""),
      p(),
      h(3, "O que ficou pendente"),
      bullet(""),
      bullet(""),
      p(),
      h(3, "Aprendizados"),
      bullet(""),
      bullet(""),
      p(),
      h(3, "Como foi minha energia / humor"),
      p(t("")),
      p(),
      h(3, "Prioridades da próxima semana"),
      todo(""),
      todo(""),
      todo(""),
    ],
  },
  {
    id: "project-plan",
    name: "Planejamento de Projeto",
    icon: "FolderKanban",
    isLucideIcon: true,
    description: "Objetivo, escopo, cronograma e riscos",
    content: [
      h(2, "Planejamento de Projeto"),
      p(t("Status: "), t("Em andamento", { bold: true })),
      p(),
      h(3, "Objetivo"),
      p(t("")),
      p(),
      h(3, "Escopo"),
      h(3, "Dentro do escopo"),
      bullet(""),
      bullet(""),
      h(3, "Fora do escopo"),
      bullet(""),
      bullet(""),
      p(),
      h(3, "Recursos necessários"),
      bullet(""),
      bullet(""),
      p(),
      h(3, "Marcos"),
      todo(""),
      todo(""),
      todo(""),
      p(),
      h(3, "Riscos"),
      bullet(""),
      bullet(""),
    ],
  },
  {
    id: "bullet-journal",
    name: "Bullet Journal",
    icon: "NotebookPen",
    isLucideIcon: true,
    description: "Log diário com tarefas, eventos e notas",
    content: [
      h(2, "Bullet Journal"),
      p(t("Data: "), t("__/__/____", { bold: true })),
      p(),
      h(3, "Log do dia"),
      todo(""),
      todo(""),
      todo(""),
      bullet(""),
      bullet(""),
      p(),
      h(3, "Foco de hoje"),
      p(t("")),
      p(),
      h(3, "Notas rápidas"),
      p(t("")),
      p(),
      h(3, "Reflexão do dia"),
      p(t("")),
    ],
  },
  {
    id: "study-notes",
    name: "Anotações de Estudo",
    icon: "GraduationCap",
    isLucideIcon: true,
    description: "Tópico, conceitos-chave, resumo e questões para revisar",
    content: [
      h(2, "Anotações de Estudo"),
      p(t("Fonte: "), t("", {})),
      p(t("Data: "), t("__/__/____", { bold: true })),
      p(),
      h(3, "Conceitos-chave"),
      bullet(""),
      bullet(""),
      bullet(""),
      p(),
      h(3, "Resumo"),
      p(t("")),
      p(),
      h(3, "Insights / Conexões"),
      bullet(""),
      bullet(""),
      p(),
      h(3, "Questões para revisar"),
      todo(""),
      todo(""),
      p(),
      h(3, "Referências"),
      bullet(""),
    ],
  },
];

// ── Custom templates (localStorage) ──────────────────────────────────────────

const STORAGE_KEY = "documentaai_custom_templates";

export function getCustomTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(template: Template): void {
  const existing = getCustomTemplates().filter((t) => t.id !== template.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, template]));
}

export function deleteCustomTemplate(id: string): void {
  const filtered = getCustomTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

// Remove IDs dos blocos para que BlockNote gere IDs frescos ao criar a página
export function stripBlockIds(blocks: object[]): object[] {
  return (blocks as Record<string, unknown>[]).map((b) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = b;
    if (Array.isArray(rest.children)) {
      rest.children = stripBlockIds(rest.children as object[]);
    }
    return rest;
  });
}
