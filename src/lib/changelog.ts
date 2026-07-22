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
    version: "1.9.0",
    date: "2026-07-22",
    title: "Ações de IA no editor + som no Arcade",
    items: [
      "Novo botão \"Continuar com IA\" na barra de formatação: selecione um trecho e o agente continua o texto no mesmo idioma e tom, usando o resto da página como contexto para ficar coerente com o que você já escreveu",
      "Chat: dois atalhos novos com o texto da página aberta — \"Resumir esta página\" e \"Perguntar só sobre esta página\" (usa o texto direto, sem depender do índice de busca)",
      "Arcade: efeitos sonoros de acerto/erro em todos os jogos, com botão de alto-falante no topo para desativar",
    ],
  },
  {
    version: "1.8.1",
    date: "2026-07-22",
    title: "Busca de conteúdo + correção do modo apresentação",
    items: [
      "A busca ⌘K agora encontra também texto dentro das páginas, não só no título — mostra um trecho com o termo destacado e, ao selecionar, já pula direto para ele na página",
      "Corrigido o modo apresentação: slides com conteúdo maior que a tela começavam cortados no meio; agora sempre começam do topo",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-07-19",
    title: "Arcade turbinado",
    items: [
      "Três jogos novos no Arcade: Monte a frase (ordene as palavras embaralhadas), Jogo da memória (encontre os pares frente ↔ verso) e Palavra oculta (forca com 6 vidas e o verso como dica)",
      "Modo misto: uma sessão sorteia até 4 partes entre os jogos disponíveis — um pouco de cada, como as lições do Duolingo",
      "Cada jogo entra no ar automaticamente quando você tem cards compatíveis (ex.: frases com 2+ palavras liberam o Monte a frase)",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-07-19",
    title: "Arcade de flashcards",
    items: [
      "Novo Arcade (botão de controle no rodapé da sidebar): treine seus flashcards jogando, com XP, níveis, combos e sequência de dias praticados",
      "Quatro jogos: múltipla escolha (teclas 1–4), combinar pares contra o relógio, digitar a resposta (tolerante a pequenos typos) e ouvir e escrever (o app fala em inglês e você transcreve)",
      "As rodadas priorizam os cards vencidos e os que você mais erra — e jogar não altera o agendamento das suas revisões",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-07-18",
    title: "Modo estudo de idiomas",
    items: [
      "Flashcards em PDF: novo menu \"Exportar PDF\" no painel de flashcards com três formatos de estudo — folha de estudo (frente | verso com linha de dobra para se testar), cartões recortáveis (frente e verso alinhados para impressão duplex) e quiz com gabarito",
      "Os cards que você mais erra ganham destaque nos PDFs, com base no seu histórico de revisões",
      "Corrigir meu inglês: com uma página aberta, um clique no chat (⌘J) envia o seu texto para correção — versão corrigida, erros explicados em português e flashcards sugeridos prontos para importar",
      "Novo template \"Diário em inglês\" para praticar escrita todos os dias",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-07-17",
    title: "Chat sem fricção",
    items: [
      "O chat com a base agora se instala sozinho: se o servidor de busca (mcp-server) não estiver na máquina, um clique em \"Instalar automaticamente\" baixa, instala e compila tudo (requer Node.js)",
      "Tela de configuração do chat com passo a passo manual como alternativa",
    ],
  },
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
