# 知識維基範本

> [English](README.md) | [简体中文](README.zh-CN.md) | 繁體中文（台灣）

一個由 AI 驅動的個人知識維基範本。新增你自己的筆記和文件，AI 技能會自動在 `Wiki/` 目錄中維護一套相互連結的維基。

## 安裝設定

### 1. 安裝 Node.js 24

從 [nodejs.org](https://nodejs.org/) 下載並安裝 Node.js —— 安裝程式會自動設定 `nvm`。然後啟用 `.nvmrc` 中指定的版本：

```shellscript
nvm use
```

### 2. 安裝 ripgrep

根據你的平台，按照 [ripgrep 官方安裝說明](https://github.com/BurntSushi/ripgrep#installation) 進行安裝。

### 3. 安裝 qmd

```shellscript
npm install -g @tobilu/qmd
```

### 4. 建立集合

將 `~/path/to/your/knowledge-wiki` 替換為你的儲存庫實際路徑：

```shellscript
qmd collection add ~/path/to/your/knowledge-wiki --name knowledge
```

### 5. 產生嵌入向量

先建立索引，再產生向量嵌入。`update` 和 `embed` 是兩個獨立步驟 —— `embed` 只處理已在索引中的內容。

預設嵌入模型對 CJK 字元的支援有限。請改用 Qwen 模型以獲得更好的英文、國語及粵語效果：

```shellscript
qmd update --collection knowledge
QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf" qmd embed --collection knowledge
```

首次執行會下載模型，可能需要幾分鐘。

### 6. 設定 git hooks

將 git 指向已追蹤的 hooks 目錄，使索引在每次提交、checkout、合併和 rebase 時自動保持最新：

```shellscript
git config core.hooksPath .githooks
```

Hooks 會自動執行 `qmd update` 和 `qmd embed`（使用 Qwen 模型）。如果未安裝 `qmd`，hooks 會印出提示訊息並正常結束。

### 7. 為 Claude 桌面版設定 MCP 伺服器

合併到 `~/Library/Application Support/Claude/claude_desktop_config.json`：

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

### 8. 為 Claude Code 設定 MCP 伺服器

```shellscript
claude plugin marketplace add tobi/qmd
claude plugin install qmd@qmd
```

### 9. 為 Codex 設定 MCP 伺服器

```shellscript
codex mcp add qmd -- qmd mcp
```

### 10. 新增你的內容

建立任意符合你需求的目錄結構，例如 `Notes/`、`Ideas/`、`Docs/`、`Journals/`。維基技能會掃描儲存庫中所有 Markdown 檔案（排除 `Wiki/`、`.claude/`、`README.md` 及本地化版本、`AGENTS.md` 和 `CLAUDE.md`），因此你新增的任何 `.md` 檔案都可以被摘要處理。

### 11. 使用技能

技能檔案存放在 `.claude/skills/` 目錄中，設計為由 AI 代理呼叫。推薦使用 **Claude Code**（[macOS 桌面應用程式](https://claude.ai/download) 或 [CLI](https://docs.anthropic.com/en/docs/claude-code)）—— 輸入技能名稱作為斜線指令：

```
/knowledge-wiki-summary
```

其他代理（Codex 等）也可以透過指定完整路徑來執行技能，例如：

```
Run the skill at .claude/skills/knowledge-wiki-summary
```

新增或編輯來源檔案後，依序執行這些技能：

| 技能                        | 執行時機                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| `/knowledge-wiki-summary`   | 新增或編輯來源檔案後 —— 在 `Wiki/Summaries/` 中產生或更新摘要檔案           |
| `/knowledge-wiki-concept`   | 執行 summary 之後 —— 在 `Wiki/Concepts/` 中建立或更新概念文章               |
| `/knowledge-wiki-synthesis` | 累積新概念後定期執行 —— 發掘跨領域關聯並撰寫綜合文章                        |
| `/knowledge-wiki-lint`      | 定期執行，尤其是重新整理來源檔案後 —— 修復孤立摘要、失效連結和孤立概念      |
| `/knowledge-wiki-merge`     | 定期執行 —— 互動式工作階段，識別並合併重複的概念文章                        |
| `/knowledge-wiki-enrich`    | 定期執行 —— 使用網路搜尋擴充內容較少的概念文章（< 4 行正文，≤ 2 個來源）    |

定期技能（`/knowledge-wiki-synthesis`、`/knowledge-wiki-lint`、`/knowledge-wiki-enrich`）也可以使用 Claude 桌面應用程式的內建排程功能設定為自動執行，讓維基持續保持最新。
