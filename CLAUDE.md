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

### Fase 3 — Integração MCP (próxima)
- [ ] Servidor MCP via **stdio** (Opção A): processo Node.js separado que lê/escreve
      diretamente no SQLite do DocumentaAI
- [ ] Ferramentas a expor: `list_pages`, `get_page`, `search_pages`, `create_page`,
      `update_page`, `delete_page`
- [ ] Stack: `@modelcontextprotocol/sdk` + `better-sqlite3`; pasta `mcp-server/` na raiz
- [ ] O AI tool (Claude Code, Kiro) spawna o processo automaticamente via config
      `~/.claude.json` — app não precisa estar aberto
- [ ] Conteúdo trafega como BlockNote JSON (a IA lê e escreve o mesmo formato do editor)

### Fase 4 — Produtividade offline (features de alto impacto)

#### Daily Notes
- [ ] Botão/atalho na sidebar que abre (ou cria) a página do dia atual
- [ ] Nomenclatura automática por data (ex: `2025-06-30`)
- [ ] Seção dedicada "Daily Notes" na sidebar separada das páginas normais

#### Templates
- [ ] Galeria de templates pré-prontos: reunião, review semanal, planejamento de projeto,
      bullet journal, anotações de estudo
- [ ] Usuário cria página a partir de template (JSON BlockNote pré-montado)
- [ ] Permitir salvar qualquer página existente como template personalizado

#### Tags
- [ ] Labels coloridas em páginas (`#trabalho`, `#pessoal`, `#ideia`, etc.)
- [ ] Filtrar/buscar páginas por tag
- [ ] Nova coluna `tags TEXT` no SQLite (array JSON)
- [ ] Complementa a hierarquia — uma página pode ter múltiplos contextos sem duplicar

#### Export
- [ ] Export para **PDF** (via `window.print()` com CSS de impressão limpo)
- [ ] Export para **Markdown** (serializar BlockNote JSON → `.md`)
- [ ] Export de página única ou subárvore inteira

#### Canvas / Whiteboard (Excalidraw)
- [ ] Novo tipo de página: `type TEXT DEFAULT 'document'` na tabela `pages`
      (valores possíveis: `'document'` | `'canvas'`)
- [ ] Ao criar página, usuário escolhe entre Documento (BlockNote) ou Canvas (Excalidraw)
- [ ] Ícone diferente na sidebar para distinguir os dois tipos (ex: 🖼️ vs 📄)
- [ ] Renderizar `@excalidraw/excalidraw` quando `type === 'canvas'`
- [ ] Estado do canvas salvo como JSON na coluna `content` — mesmo mecanismo de
      debounce/autosave já existente
- [ ] Export do canvas para PNG/SVG (Excalidraw já oferece nativamente)
- [ ] Alternativa avaliada: `@tldraw/tldraw` (UI mais polida, mesmo modelo de dados)
- [ ] Casos de uso: diagramas de arquitetura, fluxogramas, mapas mentais, esboços

### Fase 5 — Qualidade de escrita

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
