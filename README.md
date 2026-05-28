# Knowledge Wiki Template

A template for building a personal knowledge wiki powered by AI. Add your own notes and documents; the AI skills maintain an interconnected wiki in `Wiki/` automatically.

## Setup

### 1. Use the correct Node version

This repo requires Node.js 24. With nvm:

```shellscript
nvm use
```

### 2. Install ripgrep

```shellscript
brew install ripgrep
```

### 3. Install qmd

```shellscript
npm install -g @tobilu/qmd
```

### 4. Create the collection

Replace `~/path/to/your/knowledge-wiki` with the actual path to your repo:

```shellscript
qmd collection add ~/path/to/your/knowledge-wiki --name knowledge
```

### 5. Generate embeddings

First index the files, then generate vector embeddings. `update` and `embed` are separate steps — `embed` only operates on what is already in the index.

The default embedding model has limited CJK coverage. Use the Qwen model instead to get good results across English, Mandarin, and Cantonese:

```shellscript
qmd update --collection knowledge
QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf" qmd embed --collection knowledge
```

The first run downloads the model and may take a few minutes.

### 6. Configure git hooks

Point git at the tracked hooks directory so the index stays up to date automatically on every commit, checkout, merge, and rebase:

```shellscript
git config core.hooksPath .githooks
```

The hooks run `qmd update` and `qmd embed` (with the Qwen model) automatically. If `qmd` is not installed they print a notice and exit cleanly.

### 7. Set up MCP server for Claude

Merge into `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "qmd": {
      "command": "qmd",
      "args": ["mcp"]
    }
  }
}
```

### 8. Set up MCP server for Claude Code

```shellscript
claude plugin marketplace add tobi/qmd
claude plugin install qmd@qmd
```

### 9. Set up MCP server for Codex

```shellscript
codex mcp add qmd -- qmd mcp
```

## Adding Your Content

Create any folder structure that fits your needs — for example `Notes/`, `Ideas/`, `Docs/`, `Journals/`. The wiki skills scan all Markdown files in the repo (excluding `Wiki/` itself and `.claude/`), so any `.md` file you add becomes eligible for summarization.

## Wiki Skills

The `Wiki/` directory is maintained by a set of Claude Code skills. Run them in order after adding or editing source files.

| Skill                       | When to run                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/knowledge-wiki-summary`   | After adding or editing source files — generates or refreshes summary files in `Wiki/Summaries/`                           |
| `/knowledge-wiki-concept`   | After running summary — creates or updates concept articles in `Wiki/Concepts/`                                            |
| `/knowledge-wiki-synthesis` | Periodically after accumulating new concepts — discovers cross-cutting connections and writes synthesis articles           |
| `/knowledge-wiki-lint`      | Periodically, especially after reorganizing source files — repairs orphan summaries, broken wikilinks, and orphan concepts |
| `/knowledge-wiki-merge`     | Periodically — interactive session to identify and merge duplicate concept articles                                        |
| `/knowledge-wiki-enrich`    | Periodically — expands thin concept articles (< 4 prose lines, ≤ 2 sources) using web search                              |
