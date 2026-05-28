# Knowledge Wiki Template

A template for building a personal knowledge wiki powered by AI. Add your own notes and documents; the AI skills maintain an interconnected wiki in `Wiki/` automatically.

## Setup

### 1. Install Node.js 24

Download and install Node.js from [nodejs.org](https://nodejs.org/) — the installer sets up `nvm` automatically. Then activate the version pinned in `.nvmrc`:

```shellscript
nvm use
```

### 2. Install ripgrep

Follow the [official ripgrep installation instructions](https://github.com/BurntSushi/ripgrep#installation) for your platform.

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

### 10. Add Your Content

Create any folder structure that fits your needs — for example `Notes/`, `Ideas/`, `Docs/`, `Journals/`. The wiki skills scan all Markdown files in the repo (excluding `Wiki/`, `.claude/`, `README.md`, `AGENTS.md`, and `CLAUDE.md`), so any `.md` file you add becomes eligible for summarization.

### 11. Use the Skills

The skills live in `.claude/skills/` and are designed to be invoked by an AI agent. **Claude Code** (the [macOS desktop app](https://claude.ai/download) or [CLI](https://docs.anthropic.com/en/docs/claude-code)) is the recommended tool — type the skill name as a slash command:

```
/knowledge-wiki-summary
```

Other agents (Codex, etc.) can also run the skills by specifying the full path, for example:

```
Run the skill at .claude/skills/knowledge-wiki-summary
```

Run the skills in order after adding or editing source files:

| Skill                       | When to run                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/knowledge-wiki-summary`   | After adding or editing source files — generates or refreshes summary files in `Wiki/Summaries/`                           |
| `/knowledge-wiki-concept`   | After running summary — creates or updates concept articles in `Wiki/Concepts/`                                            |
| `/knowledge-wiki-synthesis` | Periodically after accumulating new concepts — discovers cross-cutting connections and writes synthesis articles           |
| `/knowledge-wiki-lint`      | Periodically, especially after reorganizing source files — repairs orphan summaries, broken wikilinks, and orphan concepts |
| `/knowledge-wiki-merge`     | Periodically — interactive session to identify and merge duplicate concept articles                                        |
| `/knowledge-wiki-enrich`    | Periodically — expands thin concept articles (< 4 prose lines, ≤ 2 sources) using web search                              |

The periodic skills (`/knowledge-wiki-synthesis`, `/knowledge-wiki-lint`, `/knowledge-wiki-enrich`) can also be configured to run on a schedule using the Claude desktop app's built-in scheduling feature, so the wiki stays fresh automatically.
