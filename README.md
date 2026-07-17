<p align="center">
  <img src="logo.svg" width="110" height="110" alt="DocumentaAI" />
</p>

<h1 align="center">DocumentaAI</h1>

<p align="center">
  Ferramenta de documentação pessoal <strong>offline-first</strong> estilo Notion — editor de blocos, daily notes, canvas, flashcards, base de conhecimento para agentes de IA e chat com suas anotações.
</p>

<p align="center">
  <a href="https://github.com/gabrielsyphan/documentaai/releases/latest"><img src="https://img.shields.io/github/v/release/gabrielsyphan/documentaai?style=flat-square&color=9480f5" alt="release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Android-lightgrey?style=flat-square" alt="platform" />
  <img src="https://img.shields.io/badge/built%20with-Tauri%20v2-FFC131?style=flat-square&logo=tauri&logoColor=white" alt="tauri" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" />
</p>

<p align="center">
  🌐 <a href="https://gabrielsyphan.github.io/documentaai/"><strong>Site oficial</strong></a> ·
  ⬇️ <a href="https://github.com/gabrielsyphan/documentaai/releases/latest"><strong>Downloads</strong></a>
</p>

---

## Funcionalidades

**Editor**
- Editor de blocos estilo Notion (parágrafos, títulos, listas, tabelas, código com highlight, imagens inline, checkboxes)
- Hierarquia ilimitada de páginas, subpáginas e pastas
- Wikilinks `[[página]]` com chip visual e backlinks automáticos
- Busca dentro da página (`⌘F`) com highlights — ignora acentos
- Auto-save com debounce + histórico de versões com diff visual e restauração
- Exportar Markdown e **PDF real** (com rodapé numerado); importar arquivos `.md`
- **Exportar pasta como PDF "livro"**: capa, sumário com número de página, capítulos numerados e divisórias de seção

**Organização**
- Drag-and-drop para reordenar páginas na sidebar
- Favoritos, tags com filtro e ordenação por nome/data
- Busca global (`⌘K`) em todas as páginas
- Boards estilo Kanban com colunas e cartões
- Lixeira com soft delete e auto-limpeza após 30 dias
- Tela de início com ações rápidas, favoritas e recentes

**Daily Notes**
- Mini-calendário mensal integrado na sidebar
- Botão "Hoje" cria/abre a nota do dia; notas vazias são descartadas sozinhas
- Seção "Agenda do dia" mostra lembretes do dia na nota

**Canvas**
- Whiteboard com Excalidraw (lazy-loaded)
- Biblioteca de componentes: básicos, fluxograma, system design, logos de apps, wireframe
- Zoom automático ao abrir, fundo acompanha o tema do app, i18n pt-BR

**Estudo**
- Flashcards com repetição espaçada (SM-2) e badge de revisões pendentes
- Importar pares `frase - tradução` de uma página como flashcards (com preview e dedup)
- Exportar deck em CSV pronto para o **Anki**
- Tradutor embutido (`⌘T`) via Google Cloud Translation, com medidor do free tier
- Leitura em voz alta com Web Speech API (PT-BR, controle de velocidade)

**IA**
- **Chat com a base de conhecimento** (`⌘J`): agente que busca nas suas páginas e responde citando as fontes — roda em cima do Claude Code ou Kiro CLI já logados na sua máquina, sem chave de API nem custo extra
- **Base de conhecimento via MCP**: busca híbrida (BM25 + embeddings locais com `multilingual-e5-small`) sobre todas as páginas, disponível para Claude Code, Kiro, Cursor e qualquer cliente MCP
- Servidor MCP com CRUD completo de páginas

**Produtividade**
- Quick Capture global (`⌘⇧Space`) — captura para a daily note sem abrir o app, com transcrição por voz no macOS
- Lembretes por página, snippets no menu `/`, galeria de templates
- Modo apresentação (H1 = slide) e modo foco (`⌘⇧F`)
- Graph view com D3 — mapa de conexões entre páginas
- Temas de cor: Escuro, Claro, Nord, Dracula, Rosé Pine, Solarized
- Backup/restauração do banco com um clique e notas de atualização no app

**Mobile e sync**
- App **Android** com o mesmo banco (sidebar vira drawer, touch targets maiores)
- **Sync por rede local** desktop ↔ celular — sem nuvem, sem conta
- Auto-update no desktop via releases do GitHub

---

## Tech stack

| Camada | Tecnologia |
|---|---|
| Desktop/mobile runtime | [Tauri v2](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| Editor | [BlockNote](https://www.blocknotejs.org) |
| Canvas | [Excalidraw](https://excalidraw.com) |
| Estilo | Tailwind CSS v4 |
| Estado | Zustand |
| Banco de dados | SQLite via `tauri-plugin-sql` |
| Busca semântica | FTS5 + [transformers.js](https://huggingface.co/docs/transformers.js) (embeddings em CPU) |
| PDF | pdfmake |
| Sync local | axum (HTTP na LAN) |
| Ícones | Lucide React |
| Syntax highlight | Shiki |
| Graph view | D3 v7 |

---

## Download

Instaladores para **macOS (Apple Silicon)**, **Windows** e **Linux (AppImage)** na [página de releases](https://github.com/gabrielsyphan/documentaai/releases/latest). O app se atualiza sozinho nas versões seguintes.

> O APK Android está temporariamente fora dos releases (build em manutenção); versões anteriores continuam funcionando e sincronizando normalmente.

---

## Pré-requisitos (desenvolvimento)

- **Node.js** >= 18 — [nodejs.org](https://nodejs.org)
- **Rust** — instale via [rustup.rs](https://rustup.rs):
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)

---

## Instalação e desenvolvimento

```bash
# 1. Clone o repositório
git clone https://github.com/gabrielsyphan/documentaai.git
cd documentaai

# 2. Instale as dependências
npm install

# 3. Inicie em modo desenvolvimento (abre o app Tauri)
npm run tauri dev
```

Na primeira execução o Cargo compila o backend Rust — demora alguns minutos. As seguintes são rápidas graças ao cache incremental.

### Build para produção

```bash
npm run tauri build
```

O instalador é gerado em `src-tauri/target/release/bundle/`.

---

## Dados locais

O banco SQLite fica salvo em:

| Sistema | Caminho |
|---|---|
| macOS | `~/Library/Application Support/com.documentaai.app/documentaai.db` |
| Linux | `~/.local/share/com.documentaai.app/documentaai.db` |
| Windows | `%APPDATA%\com.documentaai.app\documentaai.db` |

O índice da base de conhecimento (`knowledge.db`) fica na mesma pasta — é derivado e pode ser apagado sem perda (reconstrói sozinho).

---

## Integração MCP

O DocumentaAI inclui um servidor MCP que permite que ferramentas de IA leiam, escrevam e **busquem semanticamente** nas páginas, sem precisar que o app esteja aberto.

> **Requisito:** Node.js >= 18 instalado na máquina ([nodejs.org](https://nodejs.org))

### Setup — instalação via download (app instalado sem o código-fonte)

1. Baixe `documentaai-mcp-server.zip` na [página de releases](https://github.com/gabrielsyphan/documentaai/releases/latest)
2. Extraia em qualquer pasta permanente (ex: `~/documentaai-mcp/`)
3. Dentro da pasta extraída, rode:

```bash
npm install
npm run build
```

4. Anote o caminho completo até `dist/index.js` — você vai usá-lo na configuração abaixo

### Setup — clonado do repositório

```bash
cd mcp-server
npm install
npm run build
```

### Configuração no Claude Code

Adicione em `~/.claude.json`:

```json
{
  "mcpServers": {
    "documentaai": {
      "command": "node",
      "args": ["/caminho/absoluto/para/documentaai/mcp-server/dist/index.js"]
    }
  }
}
```

### Ferramentas disponíveis

| Ferramenta | Descrição |
|---|---|
| `search_knowledge` | **Busca híbrida (palavras-chave + semântica)** — retorna os trechos mais relevantes com a página-fonte |
| `list_knowledge_sources` | Lista as páginas indexadas na base de conhecimento |
| `reindex_knowledge` | Reconstrói o índice e calcula todos os embeddings (warm-up) |
| `list_pages` / `list_children` | Lista páginas com título, emoji e hierarquia |
| `get_page` | Retorna o conteúdo completo de uma página |
| `search_pages` / `search_content` | Busca por título ou texto simples |
| `create_page` / `update_page` / `delete_page` | CRUD de páginas (texto simples ou BlockNote JSON) |
| `append_to_page` | Acrescenta linhas sem sobrescrever o conteúdo |
| `move_page` / `manage_tags` | Reorganiza hierarquia e tags |
| `get_daily_note` | Abre (ou cria) a daily note de uma data |

> Na primeira busca semântica, o modelo de embeddings (~112 MB) é baixado uma única vez para `~/.cache/huggingface` — depois disso tudo roda offline, em CPU.

---

## Site

A landing page em [gabrielsyphan.github.io/documentaai](https://gabrielsyphan.github.io/documentaai/) é publicada automaticamente pelo GitHub Pages: qualquer push que altere a pasta `website/` dispara o workflow [`pages.yml`](.github/workflows/pages.yml) e o site atualiza sozinho.

---

## Estrutura do projeto

```
documentaai/
├── src/                        # Frontend React
│   ├── components/
│   │   ├── editor/             # BlockNote + Excalidraw + boards + pastas
│   │   ├── sidebar/            # Árvore de páginas + daily notes + lixeira
│   │   ├── chat/               # Chat com a base de conhecimento
│   │   ├── translate/          # Tradutor embutido
│   │   ├── flashcards/         # Criação, revisão, import e export
│   │   ├── changelog/          # Notas de atualização
│   │   ├── home/               # Tela de início
│   │   └── layout/             # AppShell, titlebar
│   ├── store/                  # Estado global (Zustand)
│   ├── lib/                    # db, export, pdf-export, translate, changelog…
│   └── types/
├── src-tauri/                  # Backend Rust (Tauri)
│   ├── src/lib.rs              # Comandos + atalho global + tray + speech
│   ├── src/chat_agent.rs       # Spawn do agente CLI (Claude/Kiro) p/ o chat
│   ├── src/sync_server.rs      # Servidor HTTP de sync na LAN
│   └── gen/android/            # Projeto Android
├── mcp-server/                 # Servidor MCP (Node.js)
│   ├── index.ts                # Tools CRUD + registro
│   └── knowledge.ts            # Base de conhecimento (FTS5 + embeddings)
├── website/                    # Landing page (publicada via GitHub Pages)
└── CLAUDE.md                   # Contexto para desenvolvimento com IA
```

---

## Licença

MIT
