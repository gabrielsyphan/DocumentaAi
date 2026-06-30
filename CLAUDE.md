# DocumentaAI — CLAUDE.md

Ferramenta de documentação pessoal estilo Notion, desktop-first, com planejamento de sync futuro para mobile/web.

## Stack

| Camada | Tecnologia |
|---|---|
| Desktop runtime | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| Editor | BlockNote (editor bloco estilo Notion) |
| Styling | Tailwind CSS v4 |
| Estado | Zustand |
| Storage local | SQLite via `tauri-plugin-sql` |
| Ícones | Lucide React |

## Estrutura de pastas

```
documentaai/
├── src/                        # Frontend React
│   ├── components/
│   │   ├── editor/             # BlockNote + extensões
│   │   ├── sidebar/            # Árvore de páginas
│   │   ├── layout/             # Shell do app (AppShell, titlebar)
│   │   └── ui/                 # Componentes base reutilizáveis
│   ├── store/                  # Estado global Zustand
│   │   ├── pages.store.ts      # Árvore de páginas
│   │   └── ui.store.ts         # Sidebar aberta, tema, etc
│   ├── hooks/                  # Custom hooks React
│   ├── lib/
│   │   └── db.ts               # Camada de acesso ao SQLite
│   ├── types/
│   │   └── index.ts            # Tipos compartilhados
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                  # Backend Rust (Tauri)
│   ├── src/
│   │   ├── main.rs
│   │   └── commands.rs         # Comandos Tauri expostos ao frontend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
├── public/
├── .claude/
│   └── commands/               # Skills deste projeto
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

## Modelo de dados (SQLite)

```sql
CREATE TABLE pages (
  id          TEXT PRIMARY KEY,       -- UUID
  parent_id   TEXT REFERENCES pages(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Sem título',
  emoji       TEXT,
  content     TEXT,                   -- JSON BlockNote blocks
  order_index REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

Não há tabela separada de blocos — o conteúdo do BlockNote é salvo como JSON na coluna `content` da página.

## Comandos de desenvolvimento

```bash
# Instalar dependências (após setup inicial)
npm install

# Desenvolvimento (abre o app Tauri em modo dev)
npm run tauri dev

# Build para produção
npm run tauri build

# Somente frontend (sem Tauri, para testar no browser)
npm run dev
```

## Pré-requisitos do ambiente

- Node.js >= 18 (instalado: v25.2.1)
- Rust + Cargo (via rustup) — **ainda não instalado**
- Tauri CLI v2 (`cargo install tauri-cli`)
- Em macOS: Xcode Command Line Tools (`xcode-select --install`)

## Arquitetura de comunicação Frontend ↔ Tauri

O React chama comandos Rust via `invoke()`:

```typescript
import { invoke } from '@tauri-apps/api/core';

// Exemplo
const pages = await invoke<Page[]>('get_pages');
await invoke('save_page', { page });
```

Os comandos Rust ficam em `src-tauri/src/commands.rs` e são registrados no `main.rs`.

## Decisões de arquitetura

- **Conteúdo como JSON**: O BlockNote serializa blocos em JSON. Guardamos isso direto no SQLite. Simples e sem overhead.
- **IDs como UUID**: Facilita sync futuro — IDs não dependem de auto-increment do banco.
- **Zustand para estado**: Leve, sem boilerplate (Redux seria overkill aqui).
- **Tauri v2**: API mais limpa que v1, melhor modelo de permissões (capabilities).
- **Sem ORM**: Queries SQL diretas via `tauri-plugin-sql` — o schema é simples demais pra justificar ORM.

## Roadmap

### Fase 1 — MVP Desktop ✅ concluída
- [x] Setup do projeto (Tauri + React + Vite + Tailwind)
- [x] Layout base: sidebar + área de edição
- [x] CRUD de páginas (criar, renomear, deletar)
- [x] Hierarquia de páginas (subpáginas estilo Notion)
- [x] Editor BlockNote funcional (com syntax highlighting via Shiki)
- [x] Persistência SQLite
- [x] Tema claro/escuro

### Fase 2 — Qualidade de vida (atual)
- [x] Busca por páginas (⌘K)
- [x] Atalhos de teclado (⌘N, ⌘K)
- [x] Drag-and-drop para reordenar páginas
- [x] Favoritos/estrelas

### Fase 3 — Integração MCP ✅ concluída
- [x] Servidor MCP via **stdio** em `mcp-server/` — `@modelcontextprotocol/sdk` + `better-sqlite3`
- [x] Ferramentas: `list_pages`, `get_page`, `search_pages`, `create_page`, `update_page`, `delete_page`
- [x] Lê o banco em `~/Library/Application Support/com.documentaai.app/documentaai.db` (macOS)
      ou via variável de ambiente `DOCUMENTAAI_DB_PATH`
- [x] Conteúdo trafega como BlockNote JSON; texto plain também é aceito no `create_page`
- [x] Botão de refresh manual (ícone ↻) no rodapé da sidebar com animação de spin
- [x] Auto-refresh ao ganhar foco — ao voltar para o app após usar MCP via Claude/Kiro,
      a sidebar recarrega as páginas automaticamente (`window.addEventListener('focus', load)`)

**Para usar no Claude Code** — adicionar em `~/.claude.json`:
```json
{
  "mcpServers": {
    "documentaai": {
      "command": "node",
      "args": ["/caminho/para/documentaai/mcp-server/dist/index.js"]
    }
  }
}
```
**Setup inicial** (só uma vez):
```bash
cd mcp-server && npm install && npm run build
```

### Fase 4 — Produtividade offline (features de alto impacto)

#### Daily Notes ✅ concluída
- [x] Seção "Daily Notes" na sidebar separada das páginas normais (últimas 7 notas)
- [x] Botão "Hoje" que cria ou abre a nota do dia (título `YYYY-MM-DD`, emoji 📅)
- [x] Nota de hoje marcada com badge "hoje" e ponto cheio ●
- [x] Coluna `type TEXT DEFAULT 'document'` adicionada ao SQLite com migração automática
      (valores: `'document'` | `'daily'` | `'canvas'`)
- [x] Daily notes filtradas da árvore principal de páginas

#### Export ✅ concluído
- [x] Ícone de export aparece ao passar o mouse no título da página
- [x] Export para **Markdown** — serializa BlockNote JSON em `.md` com suporte a
      títulos, listas, checkboxes, negrito, itálico, links, código e blocos de código
- [x] Export para **PDF** via `window.print()` com título da página como nome do arquivo
- [x] Utilitário em `src/lib/export.ts`

#### Templates ✅ concluído
- [x] Galeria de templates pré-prontos: Reunião, Review Semanal, Planejamento de Projeto,
      Bullet Journal, Anotações de Estudo — em `src/lib/templates.ts`
- [x] Botão "Templates" na sidebar abre o modal `TemplateGallery`
- [x] Cria página com título, emoji e conteúdo do template (IDs de bloco removidos para
      evitar conflitos — `stripBlockIds`)
- [x] Opção "Salvar como template" no menu de exportar do editor (persiste em `localStorage`)
- [x] Seção "Meus templates" na galeria com botão de excluir

#### Tags ✅ concluído
- [x] Coluna `tags TEXT NOT NULL DEFAULT '[]'` no SQLite com migração automática
- [x] `Page.tags: string[]` no frontend — serializado/parseado em `db.ts`
- [x] `TagEditor` inline abaixo do título no editor: chips coloridos, Enter/vírgula adiciona, Backspace remove, blur confirma
- [x] Cores determinísticas por nome da tag via hash (`src/lib/tags.ts`)
- [x] Seção "Tags" na sidebar mostra todas as tags únicas como chips clicáveis
- [x] Clicar numa tag filtra a lista de páginas; clicar novamente limpa o filtro

#### Canvas / Whiteboard (Excalidraw) ✅ concluído
- [x] Botão "Nova página" abre picker (Documento / Canvas) — ⌘N continua criando documento
- [x] Ícone `PenTool` na sidebar para páginas do tipo `'canvas'`
- [x] `CanvasEditor.tsx` renderiza `@excalidraw/excalidraw` (lazy-loaded ~2 MB) quando `type === 'canvas'`
- [x] Estado salvo como `{ elements, appState, files }` JSON na coluna `content` com debounce de 600 ms
- [x] Export para PNG/SVG/JSON disponível nativamente pela toolbar do Excalidraw
- [x] Tema claro/escuro sincronizado com o restante do app

### Fase 5 — Qualidade de escrita

#### Leitura em voz alta (Text-to-Speech)
- [ ] Botão "Ler em voz alta" no header da página
- [ ] Usa **Web Speech API** (`window.speechSynthesis`) — gratuito, offline, sem dependências,
      nativo no WebKit/Tauri; no macOS usa as vozes da Apple (ex: Luciana em PT-BR)
- [ ] Extrai texto puro do BlockNote JSON (ignora URLs de imagem, blocos de código, etc.)
- [ ] Controles: play/pause/stop e velocidade de leitura
- [ ] Destaque visual do parágrafo sendo lido (via eventos `onboundary` da API)
- [ ] Seleção de voz disponível no sistema (a API lista todas as vozes instaladas)

#### Focus mode
- [ ] Tela cheia sem sidebar, tipografia maior, zero distrações
- [ ] Toggle via atalho (ex: `⌘⇧F`)

#### Estatísticas
- [ ] Contador de palavras e tempo de leitura estimado no rodapé do editor

#### Histórico de versões
- [ ] Salvar snapshots do conteúdo a cada edição significativa
- [ ] Nova tabela `page_versions` no SQLite (id, page_id, content, saved_at)
- [ ] UI para visualizar e restaurar versões anteriores

#### Backlinks
- [ ] Rodapé da página mostra quais outras páginas referenciam a atual
- [ ] Detectar `[[nome da página]]` no conteúdo JSON como links internos
- [ ] Base para o Graph view futuro

### Fase 6 — Captura e aprendizado

#### Quick capture global
- [ ] Atalho de sistema que abre uma mini-janela mesmo com o app fechado
- [ ] Implementado com `tauri-plugin-global-shortcut` + janela secundária do Tauri
- [ ] Conteúdo capturado vai para inbox ou Daily Note do dia

#### Integração com Ollama (IA local, sem internet)
- [ ] Resumir página atual
- [ ] Continuar/expandir texto selecionado
- [ ] Responder perguntas sobre o conteúdo da página
- [ ] Comunica com Ollama via HTTP local (`http://localhost:11434`)

#### Flashcards / Repetição espaçada
- [ ] Marcar trechos de uma página como cartão de estudo
- [ ] Sistema de revisão com intervalos (algoritmo SM-2 ou similar)
- [ ] Útil para uso educacional / aprendizado com o app

#### Graph view
- [ ] Mapa visual das conexões entre páginas (depende de Backlinks implementado)
- [ ] Renderizado com D3.js ou similar
- [ ] Nós = páginas, arestas = referências entre elas

### Fase 7 — Sync (futuro)
- [ ] Backend (Fastify ou Hono + PostgreSQL)
- [ ] Auth (Clerk ou similar)
- [ ] Sync em tempo real
- [ ] App mobile (React Native ou PWA)

## Contexto para novas conversas

O usuário não domina Tauri nem React — explique conceitos novos brevemente ao introduzi-los. Prefira código completo a fragmentos. Sempre considere que o app deve funcionar offline-first e que haverá sync futuro.
