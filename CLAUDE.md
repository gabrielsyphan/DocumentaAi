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
- [x] Tema sincronizado com o app: `viewBackgroundColor` fica `"transparent"` e a
      div atrás do canvas pinta `var(--editor-bg)` — no modo escuro o Excalidraw
      inverte as cores do canvas via filtro CSS, então cor sólida sairia errada;
      transparente não é afetado pelo filtro (cores antigas migram ao abrir)

### Fase 5 — Qualidade de escrita

#### Leitura em voz alta (Text-to-Speech) ✅ concluída
- [x] Botão `Volume2` no header da página (aparece ao passar o mouse)
- [x] Usa **Web Speech API** (`window.speechSynthesis`) — gratuito, offline, sem dependências,
      nativo no WebKit/Tauri; no macOS usa as vozes da Apple (seleciona PT-BR automaticamente)
- [x] Extrai texto puro do BlockNote JSON via `src/lib/tts.ts` (ignora código, imagens, mídia)
- [x] Controles em barra fixa no topo do editor: play/pause, stop, velocidade (0.75×–2×)
- [x] Seleção de voz disponível no sistema via `<select>`
- [x] Leitura parágrafo a parágrafo com progresso exibido (ex: 3/12)

#### Busca na página (⌘F / Ctrl+F) ✅ concluída
- [x] Barra flutuante no canto superior direito do editor (`FindInPageBar.tsx`)
- [x] Busca ignora maiúsculas **e acentos** ("reuniao" encontra "Reunião")
- [x] Highlights via **CSS Custom Highlight API** — pinta os resultados sem tocar
      no DOM do ProseMirror (inserir `<mark>` quebraria o editor); fallback por
      seleção em WebViews antigos
- [x] Enter → próximo, Shift+Enter → anterior, Esc fecha; contador "3/12"
- [x] Pré-preenche com o texto selecionado no editor (como nos navegadores)
- [x] Re-busca automaticamente se o conteúdo for editado com a barra aberta

#### Focus mode ✅ concluído
- [x] Sidebar oculta, tipografia maior (17px), line-height mais espaçado
- [x] Toggle via `⌘⇧F` ou botão `Maximize2` no header da página
- [x] Sair com `Escape` ou botão `Minimize2` flutuante (aparece ao hover)

#### Estatísticas ✅ concluída
- [x] Contador de palavras e tempo de leitura estimado na barra de tags (rodapé do editor)
- [x] Atualiza em tempo real a cada tecla digitada

#### Histórico de versões ✅ concluído
- [x] Tabela `page_versions` no SQLite (id, page_id, title, content, saved_at)
- [x] Snapshot salvo automaticamente com debounce de 15s + ao navegar para outra página
- [x] Máximo de 30 versões por página (antigas descartadas automaticamente)
- [x] Botão `History` no topbar abre modal com lista de versões e timestamps relativos
- [x] Botão "Restaurar" substitui o conteúdo atual via `editor.replaceBlocks`

#### Backlinks ✅ concluído
- [x] Rodapé da página mostra quais outras páginas referenciam a atual via `[[título]]`
- [x] Detecta `[[nome da página]]` no JSON armazenado com regex case-insensitive
- [x] Clique no backlink navega para a página de origem
- [x] Base para o Graph view futuro
- [x] **UX de criação:** digitar `[[` no editor abre menu de sugestão com lista de páginas;
      selecionar insere um chip visual inline tipo `wikilink` (custom inline content do BlockNote)
- [x] **Visual no editor:** chip roxo com ícone de link; clicar no chip navega para a página
- [x] **Detecção dupla:** compatível com `[[título]]` texto antigo + novo tipo `wikilink` inline
- [x] **Empty state educativo:** seção de backlinks sempre visível com dica `[[` quando vazia
- [x] Ícone `?` no header da seção mostra tooltip explicando a sintaxe

### Fase 6 — Captura e aprendizado

#### Quick capture global ✅ concluído
- [x] Atalho global `⌘⇧Space` (macOS) / `Ctrl+Shift+Space` (Win/Linux) abre/fecha a janela
- [x] Implementado com `tauri-plugin-global-shortcut` + janela secundária sem decorações
- [x] Conteúdo salvo na Daily Note do dia (cria a nota se ainda não existir)
- [x] Janela se reseta e foca automaticamente ao reabrir
- [x] Drag region no header para mover a janela, `⌘↵` para salvar, `Esc` para fechar
- [x] Vite multi-page: `quick-capture.html` como segundo entry point

#### Flashcards / Repetição espaçada ✅ concluído
- [x] Tabela `flashcards` no SQLite com algoritmo SM-2 completo
- [x] Botão BookOpen no topbar do editor: cria/gerencia cards (frente pré-preenchida com seleção)
- [x] Sessão de revisão via sidebar: flip frente/verso, Errei/Difícil/OK/Fácil
- [x] Badge vermelho no footer da sidebar mostra cards vencidos hoje
- [x] **Importar da página**: parseia linhas `frente - verso` do conteúdo
      (`src/lib/flashcard-import.ts`) com preview antes de criar; linha sem separador
      é continuação do verso anterior; duplicados (mesma frente) são pulados;
      headings/código ignorados; aceita `-`, `–` e `—` cercados de espaço
- [x] Botão "Excluir todos" (com confirmação em 2 cliques) limpa os cards da página
- [x] **Exportar CSV (Anki)**: gera `.csv` com diretivas `#separator`/`#html` que o
      Anki importa direto; salva via comando Rust `save_text_file` (dialog nativo,
      pois o WebView não baixa arquivos) — desktop-only

#### Graph view ✅ concluído
- [x] Modal fullscreen com grafo de força (D3 v7 + SVG), lazy-loaded
- [x] Nós coloridos por tipo, tamanho proporcional ao grau de conexão
- [x] Detecta `[[título]]` e wikilinks do BlockNote; setas direcionais nas arestas
- [x] Drag, zoom/pan, clique navega para página, tooltip com título completo
- [x] Botão Network no footer da sidebar

### Fase 7 — Conteúdo rico ✅ concluída

#### Imagens inline ✅
- [x] Arrastar/colar imagem do sistema de arquivos (Tauri file drop)
- [x] Colar imagem do clipboard (⌘V / Ctrl+V após Print Screen ou cópia)
- [x] Bloco `/image` via menu de slash commands do BlockNote
- [x] Imagem salva como base64 na coluna `content` — sem dependência de storage externo

#### Tabelas ✅
- [x] Bloco de tabela nativo do BlockNote disponível via `/table` no menu de slash commands
- [x] Incluído em `defaultBlockSpecs` — zero código extra necessário

#### Modo apresentação ✅
- [x] Botão `Presentation` no topbar
- [x] H1 = novo slide; conteúdo entre headings vai para o slide atual
- [x] Navegação com ←/→/espaço/setas; Esc fecha
- [x] Dots de progresso clicáveis; botões Anterior / Próximo
- [x] Renderiza paragraphs, headings, listas, código, imagens
- [x] Tela cheia com tema escuro, tipografia grande, funciona offline

### Fase 8 — Organização avançada ✅ concluída

#### Lixeira ✅
- [x] Coluna `deleted_at TEXT` no SQLite — soft delete com migração automática
- [x] Auto-limpeza de páginas deletadas há mais de 30 dias ao iniciar o app
- [x] Deletar página move para lixeira (não remove imediatamente)
- [x] Seção "Lixeira" colapsável no rodapé da sidebar com contador
- [x] Restaurar página ou excluir definitivamente; botão "Esvaziar lixeira"

#### Calendário de daily notes ✅
- [x] Mini-calendário mensal na seção Daily Notes (substituiu lista simples)
- [x] Navegação por mês (← →), dias com nota marcados com ponto
- [x] Dia de hoje destacado; dia selecionado com fundo colorido
- [x] Clicar num dia abre ou cria a nota daquele dia

#### Ordenação e filtros na sidebar ✅
- [x] Botão de ordenação no header "Páginas": Padrão / A–Z / Editado / Criado
- [x] Quando ordenação != Padrão exibe lista plana ordenada (sem hierarquia)
- [x] Estado de ordenação no `ui.store` (persiste durante a sessão)

### Fase 9 — Produtividade ✅ concluída

#### Snippets / text expand ✅
- [x] Snippets embutidos: Reunião, Revisão Semanal, Anotações de Estudo, Bullet Journal
- [x] Menu `/` do editor estendido com grupo "Snippets" (usando `getDefaultReactSlashMenuItems` +
      itens customizados) — ex: digitar `/reuniao` insere o template de reunião
- [x] "Salvar como snippet" no menu de exportar — salvo em `localStorage` via `src/lib/snippets.ts`
- [x] Snippets do usuário aparecem no menu `/` sob o mesmo grupo "Snippets"

#### Lembretes em páginas ✅
- [x] Coluna `reminder_date TEXT` no SQLite com migração automática
- [x] Botão Bell no topbar do editor abre date picker inline
- [x] Quando um lembrete é definido, o bell muda de aparência (BellOff → Bell)
- [x] Ao abrir a daily note de um dia, seção "Agenda do dia" mostra todas as
      páginas com `reminder_date === date` (sem modificar o conteúdo da nota)

#### Importar Markdown ✅
- [x] Botão "Importar MD" na sidebar abre seletor de arquivos (multi-select)
- [x] `src/lib/markdown-import.ts` converte `.md` para BlockNote JSON:
      headings, listas, checkboxes, código, bold/italic/strike/code inline, links
- [x] Cria uma página por arquivo com o nome do arquivo como título

### Fase 10 — Visual e UX ✅ concluída

#### Temas de cor ✅
- [x] 6 paletas: Escuro (padrão), Claro, Nord, Dracula, Rosé Pine, Solarized
- [x] Cada tema define variáveis CSS completas (sidebar, editor, bordas, accent, scrollbar)
- [x] Seletor de tema: fileira de dots coloridos dentro do menu "Mais" (⋯) do footer
      da sidebar — clique aplica na hora, sem fechar o menu (dá para experimentar)
- [x] Tema salvo em `localStorage` e aplicado imediatamente ao trocar
- [x] Toggle claro/escuro preservado; BlockNote recebe `"dark"|"light"` corretamente

#### Diff visual de versões ✅
- [x] Botão "Comparar" ao lado de "Restaurar" em cada versão do histórico
- [x] Diff LCS (sem dependências externas) linha a linha entre versão e conteúdo atual
- [x] Linhas adicionadas em verde, removidas em vermelho, iguais em cinza
- [x] Botão "Restaurar esta versão" diretamente na tela de diff

### Fase 11 — Integração com IA local

#### Tradutor (Google Cloud Translation API) ✅ concluído
- [x] Painel modal estilo Google Tradutor: botão `Languages` no rodapé da sidebar + atalho ⌘T
- [x] Traduz enquanto digita (debounce 600ms), direções Auto / EN→PT / PT→EN,
      botão de inverter, copiar resultado, contador de caracteres
- [x] Modo Auto detecta o idioma; se a origem já é PT, refaz a chamada para EN
- [x] Chave de API do usuário no `localStorage` (`src/lib/translate.ts`) — primeira
      abertura mostra passo a passo de como criar a chave no Google Cloud
- [x] Chamada REST v2 direto do frontend (googleapis libera CORS; CSP do Tauri é null)
- [x] Free tier: 500k caracteres/mês
- [x] Medidor de consumo mensal no painel: a API não expõe a cota via chave, então
      cada caractere enviado é contado localmente (`localStorage`, zera por mês);
      barra de progresso com alerta em 80% (laranja) e 95% (vermelho); no modo
      auto as duas chamadas contam

#### Ollama / APIs externas
- [ ] Resumir página atual com um clique
- [ ] Continuar/expandir texto selecionado
- [ ] Responder perguntas sobre o conteúdo da página
- [ ] Suporte a Ollama (`http://localhost:11434`) e APIs externas com chave configurável pelo usuário

### Fase 12 — App Mobile Android (Tauri v2) ✅ concluída

Mesmo codebase do desktop — o Tauri v2 compila o app React existente para Android.
Distribuição por APK sideload (sem Play Store), assinado com keystore própria.

- [x] Projeto Android em `src-tauri/gen/android` (versionado — o CI builda a partir dele)
- [x] Compilação condicional: plugins desktop-only (updater, process, autostart,
      global-shortcut, tray) atrás de `#[cfg(desktop)]`; `tauri.android.conf.json`
      define só a janela main (Android não tem múltiplas janelas)
- [x] Capabilities separadas por plataforma (`default`/`quick-capture` desktop; `mobile`)
- [x] `MainActivity.kt` aplica window insets (status bar/gestos/teclado) — Android 15+
      força edge-to-edge
- [x] UI mobile: sidebar vira drawer (hambúrguer + backdrop), botões de ação sempre
      visíveis, touch targets maiores, topbar em duas linhas, scroll liberado
      (`touch-action: pan-y`) e drag-and-drop por long-press (400ms + vibração)
- [x] Desktop-only escondidos no mobile: TTS, export MD/PDF, atalhos de teclado
- [x] Keystore em `~/.android/documentaai-release.jks` (senha em
      `src-tauri/gen/android/keystore.properties`, fora do git) — **fazer backup!**
- [x] Job `build-android` no release.yml: APK universal assinado anexado ao release
      (requer secrets `ANDROID_KEYSTORE_B64` e `ANDROID_KEYSTORE_PASSWORD`)

### Fase 13 — Sync por rede local ✅ concluída

Sem nuvem, sem conta: o desktop roda um servidor HTTP (`axum`, porta 7420) e o
celular sincroniza quando está na mesma rede Wi-Fi.

- [x] Servidor em `src-tauri/src/sync_server.rs` (desktop-only), comandos Tauri
      `sync_server_start/stop/status`; SQLite via sqlx com `foreign_keys(false)`
      (FK ligada quebrava inserção de subpáginas e o CASCADE apagaria filhos)
- [x] Modal Sync (botão no rodapé da sidebar): no desktop mostra IP:porta em
      destaque + QR code e liga/desliga o servidor; no mobile, campo com máscara
      de IP (pontos e `:` automáticos) + três ações
- [x] Três modos: **Sincronizar** (merge last-write-wins por `updated_at`, propaga
      deleções), **Baixar do desktop** e **Enviar p/ desktop** (direcionais forçados:
      sobrescrevem/criam sem nunca deletar — recriam páginas deletadas no destino)
- [x] Merge seguro com a FK `parent_id`: upsert `ON CONFLICT DO UPDATE` (nunca
      `INSERT OR REPLACE`, que dispara DELETE+CASCADE) e ordenação topológica
- [x] Soft delete/restore agora atualizam `updated_at` (sem isso deleções não
      propagariam no merge)
- [x] Android: cleartext HTTP liberado no manifest (LAN não tem TLS)

### Fase 14 — Home screen ✅ concluída
- [x] Tela inicial (sem página aberta) em `src/components/home/HomeScreen.tsx`:
      saudação por hora + data, ações rápidas (nova página, canvas, nota de hoje,
      buscar, templates), favoritas em chips, recentes em grid
- [x] Visual sóbrio (sem emojis/gradientes), fade-in em cascata discreto
- [x] Clicar em favorito **ou recente** revela o item na árvore (expande ancestrais +
      scroll) — helper compartilhado em `src/lib/reveal.ts`, usado também pela sidebar
- [x] Nome "DocumentaAI" na sidebar é clicável e volta para a tela de início

### Organização do rodapé da sidebar
O rodapé mostra só o uso frequente: **Flashcards** (badge de vencidos) e **Tradutor**.
O resto vive no menu "Mais" (⋯, abre para cima, itens com rótulo): Recarregar,
Sync rede local, Graph view, Exportar/Importar backup e o seletor de tema (dots).
A confirmação de restaurar backup é um modal central via portal (não ancora mais
no botão, que agora fica dentro do menu).

### Fase 16 — Base de conhecimento (RAG local via MCP)

#### Busca híbrida ✅ concluída (Fase 1 do plano)
- [x] `mcp-server/knowledge.ts`: índice em `knowledge.db` AO LADO do banco principal
      (dado derivado — fora de backup/sync; rebuild automático se apagado ou se
      `SCHEMA_VERSION` mudar via `PRAGMA user_version`)
- [x] Indexação **incremental** por `pages.updated_at` a cada busca (páginas
      `document`+`daily` não deletadas); chunks de **~400 chars** com overlap de
      linha inteira — chunks de 1200 chars diluíam o embedding e arruinavam o
      ranking (testado); título fica FORA do texto embedado (só no FTS e exibição)
- [x] Léxico: SQLite **FTS5/BM25** (`unicode61 remove_diacritics 2`)
- [x] Semântico: `@huggingface/transformers` + **Xenova/multilingual-e5-small**
      (q8, ~112 MB baixados 1x p/ `~/.cache/huggingface`, CPU, offline após download;
      prefixos `query:`/`passage:` são obrigatórios no e5); KNN por cosseno em
      memória (brute force — escala pessoal não precisa de vector DB)
- [x] Fusão dos rankings por **RRF** (Reciprocal Rank Fusion, k=60)
- [x] Embeddings calculados em segundo plano; busca degrada graciosamente para
      léxico puro com nota explicativa enquanto o modelo baixa/processa
- [x] Tools MCP: `search_knowledge(query, max_results)`,
      `list_knowledge_sources()`, `reindex_knowledge()` (warm-up, aguarda tudo)
- [x] Funciona no Claude Code, Kiro (IDE e CLI) e Cursor via MCP já configurado

#### Chat embutido (Fase 2 do plano — próximo)
- [ ] Painel de chat no app conversando com agente headless: `claude -p
      --output-format stream-json` (usa a assinatura logada) e `kiro-cli chat
      --no-interactive` como engines selecionáveis
- [ ] Restringir tools do agente à leitura da base (`--allowedTools`/`--trust-tools`)
- [ ] Streaming das respostas + citação das páginas-fonte

### Fase 15 — Sync na nuvem (futuro distante)
- [ ] Backend (Fastify ou Hono + PostgreSQL)
- [ ] Auth (Clerk ou similar)
- [ ] Sync em tempo real

## Contexto para novas conversas

O usuário não domina Tauri nem React — explique conceitos novos brevemente ao introduzi-los. Prefira código completo a fragmentos. Sempre considere que o app deve funcionar offline-first e que haverá sync futuro.
