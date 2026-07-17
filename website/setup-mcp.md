# DocumentaAI — Setup do servidor MCP

Estas instruções são para um agente de IA (Claude Code, Cursor, Kiro…) configurar o
servidor MCP do DocumentaAI na máquina do usuário. Execute os passos abaixo.

## Pré-requisitos

- **Node.js >= 18** — verifique com `node --version`; se faltar, peça ao usuário para instalar em https://nodejs.org
- App **DocumentaAI** instalado e aberto ao menos uma vez (para o banco de dados existir)

## 1. Baixar e compilar o servidor

Instale numa pasta permanente (ex: `~/documentaai-mcp`):

```bash
mkdir -p ~/documentaai-mcp && cd ~/documentaai-mcp
curl -sL -f -o mcp.zip "https://github.com/gabrielsyphan/documentaai/releases/latest/download/documentaai-mcp-server.zip"

# Extraia conforme o sistema:
#   macOS:   ditto -x -k mcp.zip .
#   Linux:   unzip -o mcp.zip
#   Windows: tar -xf mcp.zip

cd mcp-server
npm install
npm run build
```

O arquivo final fica em `~/documentaai-mcp/mcp-server/dist/index.js` — anote o **caminho absoluto**.

> Alternativa: se o usuário tem o repositório clonado, use `<repo>/mcp-server`
> (`npm install && npm run build`) e aponte para `<repo>/mcp-server/dist/index.js`.

## 2. Registrar no cliente MCP

Use o caminho absoluto do passo 1 no lugar de `<CAMINHO>`.

### Claude Code

```bash
claude mcp add --scope user documentaai -- node <CAMINHO>
```

Ou manualmente, em `~/.claude.json`:

```json
{
  "mcpServers": {
    "documentaai": {
      "command": "node",
      "args": ["<CAMINHO>"]
    }
  }
}
```

### Cursor

Em `~/.cursor/mcp.json` (global) ou `.cursor/mcp.json` do projeto, mesmo JSON acima.

### Kiro

Em `~/.kiro/settings/mcp.json` (usuário) ou `.kiro/settings/mcp.json` do workspace, mesmo JSON acima.

## 3. Banco de dados

O servidor encontra o banco sozinho nos caminhos padrão do app
(ex. macOS: `~/Library/Application Support/com.documentaai.app/documentaai.db`).
Se ele reclamar que não achou, defina a variável de ambiente `DOCUMENTAAI_DB_PATH`
na configuração MCP apontando para o `.db`.

## 4. Testar

Reinicie o cliente MCP e chame a tool `list_pages` — deve listar as páginas do usuário.

Nota: na primeira chamada de `search_knowledge` (busca semântica), um modelo de
embeddings (~112 MB) é baixado uma única vez para `~/.cache/huggingface`; depois
disso tudo funciona offline. Não trate a demora inicial como erro.

## Ferramentas disponíveis

| Tool | Função |
|---|---|
| `search_knowledge` | Busca híbrida (palavras-chave + semântica) com trechos e página-fonte |
| `list_knowledge_sources` / `reindex_knowledge` | Estado e rebuild do índice |
| `list_pages` / `list_children` / `get_page` | Navegação e leitura |
| `search_pages` / `search_content` | Busca por título/texto |
| `create_page` / `update_page` / `append_to_page` / `delete_page` | Escrita |
| `move_page` / `manage_tags` / `get_daily_note` | Organização e daily notes |
