<p align="center">
  <img src="logo.svg" width="110" height="110" alt="DocumentaAI" />
</p>

<h1 align="center">DocumentaAI</h1>

<p align="center">
  Ferramenta de documentação pessoal <strong>offline-first</strong> estilo Notion — editor de blocos, daily notes, canvas, flashcards e integração MCP.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-9480f5?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" alt="platform" />
  <img src="https://img.shields.io/badge/built%20with-Tauri%20v2-FFC131?style=flat-square&logo=tauri&logoColor=white" alt="tauri" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license" />
</p>

---

## Funcionalidades

**Editor**
- Editor de blocos estilo Notion (parágrafos, títulos, listas, tabelas, código com highlight, imagens inline, checkboxes)
- Hierarquia ilimitada de páginas e subpáginas
- Wikilinks `[[página]]` com chip visual e backlinks automáticos
- Auto-save com debounce — seus dados nunca se perdem
- Histórico de versões com diff visual e restauração por clique
- Exportar para Markdown ou PDF
- Importar arquivos `.md`

**Organização**
- Drag-and-drop para reordenar páginas na sidebar
- Favoritos, tags com filtro e ordenação por nome/data
- Busca global (`⌘K`) em todas as páginas
- Lixeira com soft delete e auto-limpeza após 30 dias

**Daily Notes**
- Mini-calendário mensal integrado na sidebar
- Botão "Hoje" cria/abre a nota do dia automaticamente
- Seção "Agenda do dia" mostra lembretes do dia na nota

**Canvas**
- Whiteboard com Excalidraw (lazy-loaded)
- Biblioteca de componentes: básicos, fluxograma, system design, logos de apps, wireframe
- Zoom automático ao abrir, tema sincronizado, i18n pt-BR

**Produtividade**
- Quick Capture global (`⌘⇧Space`) — captura para a daily note sem abrir o app
- Flashcards com algoritmo SM-2 e badge de revisões pendentes
- Lembretes por página com date picker inline
- Snippets / text expand no menu `/`
- Galeria de templates (Reunião, Review Semanal, Projeto, Bullet Journal…)
- Modo apresentação (H1 = slide) com navegação por teclado
- Leitura em voz alta com Web Speech API (PT-BR, controle de velocidade)
- Modo foco (`⌘⇧F`) — sidebar oculta, tipografia espaçada
- Graph view com D3 — mapa de conexões entre páginas
- Temas de cor: Escuro, Claro, Nord, Dracula, Rosé Pine, Solarized
- Backup e restauração do banco de dados com um clique

**MCP (IA)**
- Servidor MCP integrado em `mcp-server/` compatível com Claude Code, Kiro, Cursor e qualquer cliente MCP
- Ferramentas: `list_pages`, `get_page`, `search_pages`, `create_page`, `update_page`, `delete_page`
- Auto-refresh da sidebar ao ganhar foco após operações via MCP

---

## Tech stack

| Camada | Tecnologia |
|---|---|
| Desktop runtime | [Tauri v2](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| Editor | [BlockNote](https://www.blocknotejs.org) |
| Canvas | [Excalidraw](https://excalidraw.com) |
| Estilo | Tailwind CSS v4 |
| Estado | Zustand |
| Banco de dados | SQLite via `tauri-plugin-sql` |
| Ícones | Lucide React |
| Syntax highlight | Shiki |
| Graph view | D3 v7 |

---

## Pré-requisitos

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

---

## Integração MCP

O DocumentaAI inclui um servidor MCP que permite que ferramentas de IA leiam e escrevam páginas diretamente, sem precisar que o app esteja aberto.

### Setup (só uma vez)

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
| `list_pages` | Lista todas as páginas com título, emoji e hierarquia |
| `get_page` | Retorna o conteúdo completo de uma página |
| `search_pages` | Busca páginas por título |
| `create_page` | Cria uma nova página (texto simples ou BlockNote JSON) |
| `update_page` | Atualiza título, conteúdo ou emoji |
| `delete_page` | Remove uma página e todas as subpáginas |

---

## Estrutura do projeto

```
documentaai/
├── src/                        # Frontend React
│   ├── components/
│   │   ├── editor/             # BlockNote + Excalidraw + extensões
│   │   ├── sidebar/            # Árvore de páginas + daily notes
│   │   └── layout/             # AppShell, titlebar
│   ├── store/                  # Estado global (Zustand)
│   ├── lib/                    # db.ts, export, tags, templates…
│   └── types/
├── src-tauri/                  # Backend Rust (Tauri)
│   ├── src/lib.rs              # Comandos + atalho global + tray
│   ├── Cargo.toml
│   └── tauri.conf.json
├── mcp-server/                 # Servidor MCP (Node.js)
└── CLAUDE.md                   # Contexto para desenvolvimento com IA
```

---

## Licença

MIT
