// ── Notas de atualização ──────────────────────────────────────────────────────
// Changelog embutido no app (offline-first): os releases do GitHub têm só a
// tabela de downloads, então as notas em pt-BR vivem aqui. A cada release
// (nova tag), adicionar uma entrada NO TOPO desta lista.

export interface ReleaseNote {
  version: string;
  date: string; // ISO YYYY-MM-DD
  title: string;
  items: string[];
}

export const CHANGELOG: ReleaseNote[] = [
  {
    version: "1.5.0",
    date: "2026-07-17",
    title: "Chat com suas anotações e PDFs de estudo",
    items: [
      "Chat com a base de conhecimento (⌘J ou o botão flutuante): converse com um agente de IA que busca nas suas páginas e responde citando as fontes — usa o Claude Code ou Kiro CLI já logados na sua máquina, sem custo extra",
      "Exportar página como PDF de verdade: arquivo com título, data e páginas numeradas",
      "Exportar pasta como PDF \"livro\": capa, sumário com número de página, um capítulo por item e subpastas viram divisórias de seção com mini-sumário",
      "Notas de atualização: clique na versão no topo da sidebar para ver o que mudou em cada release (um ponto indica novidades ainda não vistas)",
      "Alinhamento das seções Notas diárias e Lixeira na sidebar",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-07-16",
    title: "Estudo turbinado",
    items: [
      "Busca dentro da página com ⌘F / Ctrl+F — ignora acentos, Enter navega entre os resultados",
      "Tradutor embutido (⌘T e botão na sidebar) usando a Cloud Translation API do Google, com medidor do free tier",
      "Flashcards: importar pares \"frase - tradução\" direto da página (com preview), excluir todos de uma vez e exportar o deck em CSV para o Anki",
      "Base de conhecimento para agentes de IA (Claude Code, Kiro, Cursor): busca híbrida — palavras-chave + semântica — sobre suas páginas via MCP",
      "Fundo do canvas agora acompanha o tema de cor do app",
      "Daily notes vazias são descartadas ao navegar por qualquer caminho (calendário, atalhos, início)",
      "Nome do app na sidebar leva à tela de início; favoritos e recentes da home revelam o item na árvore",
      "Rodapé da sidebar reorganizado: ações frequentes visíveis e o resto no menu \"Mais\"",
    ],
  },
  {
    version: "1.3.2",
    date: "2026-07-14",
    title: "Correções",
    items: [
      "Deletar uma página agora move as subpáginas junto para a lixeira (cascata)",
    ],
  },
  {
    version: "1.3.1",
    date: "2026-07-14",
    title: "Correções",
    items: [
      "Páginas com tabelas não quebram mais o editor ao abrir",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-07-13",
    title: "Criação rápida",
    items: [
      "Botão + da árvore de páginas abre um seletor de tipo: Documento, Canvas, Pasta ou Board",
    ],
  },
  {
    version: "1.2.1",
    date: "2026-07-03",
    title: "Desempenho",
    items: [
      "Melhor desempenho no Linux — os ajustes de renderização agora só são aplicados onde são necessários",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-07-03",
    title: "Android e sync local",
    items: [
      "App Android (APK) com o mesmo banco de dados do desktop",
      "Sincronização por rede local entre desktop e celular — sem nuvem, sem conta",
      "Tela de início com ações rápidas, favoritas e páginas recentes",
    ],
  },
  {
    version: "1.1.1",
    date: "2026-07-03",
    title: "Ajustes",
    items: [
      "Tema do canvas sincronizado com o tema do app",
      "Arrastar páginas na árvore espera um instante antes de expandir a pasta de destino",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-07-02",
    title: "Boards",
    items: [
      "Novo tipo de página: Board estilo Kanban com colunas e cartões",
      "Sidebar colapsável",
      "Integração MCP mais robusta e melhorias gerais de UX",
    ],
  },
  {
    version: "1.0.1",
    date: "2026-07-02",
    title: "Ajustes do lançamento",
    items: [
      "Pacote do servidor MCP incluído nos downloads do release",
      "Descoberta automática do banco de dados pelo servidor MCP em mais sistemas",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-02",
    title: "Primeira versão estável 🎉",
    items: [
      "Editor de blocos estilo Notion com hierarquia de páginas, tema claro/escuro e persistência local",
      "Canvas de desenho (Excalidraw) em pt-BR com biblioteca de formas e logos de tecnologia",
      "Daily notes com calendário, favoritos, tags, busca ⌘K e atalhos de teclado",
      "Flashcards com repetição espaçada (SM-2), Quick Capture global e modo apresentação",
      "Backup e restauração completos do banco de dados",
      "Templates, snippets, export Markdown, histórico de versões, backlinks e graph view",
    ],
  },
];

// ── Controle de "novidades não vistas" ────────────────────────────────────────

const SEEN_KEY = "documentaai-changelog-seen";

/** true se o usuário ainda não abriu as notas desta versão do app */
export function hasUnseenChangelog(currentVersion: string): boolean {
  if (!currentVersion) return false;
  return localStorage.getItem(SEEN_KEY) !== currentVersion;
}

export function markChangelogSeen(currentVersion: string) {
  if (currentVersion) localStorage.setItem(SEEN_KEY, currentVersion);
}
