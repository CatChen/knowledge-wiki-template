# 知识维基模板

> [English](README.md) | 简体中文 | [繁體中文](README.zh-TW.md)

一个由 AI 驱动的个人知识维基模板。添加你自己的笔记和文档，AI 技能会自动在 `Wiki/` 目录中维护一套相互关联的维基。

## 安装配置

### 1. 安装 Node.js 24

从 [nodejs.org](https://nodejs.org/) 下载并安装 Node.js —— 安装程序会自动配置 `nvm`。然后激活 `.nvmrc` 中指定的版本：

```shellscript
nvm use
```

### 2. 安装 ripgrep

根据你的平台，按照 [ripgrep 官方安装说明](https://github.com/BurntSushi/ripgrep#installation) 进行安装。

### 3. 安装 qmd

```shellscript
npm install -g @tobilu/qmd
```

### 4. 创建集合

将 `~/path/to/your/knowledge-wiki` 替换为你的仓库实际路径：

```shellscript
qmd collection add ~/path/to/your/knowledge-wiki --name knowledge
```

### 5. 生成嵌入向量

先索引文件，再生成向量嵌入。`update` 和 `embed` 是两个独立步骤 —— `embed` 只处理已在索引中的内容。

默认嵌入模型对 CJK 字符的支持有限。请改用 Qwen 模型以获得更好的英文、普通话及粤语效果：

```shellscript
qmd update --collection knowledge
QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf" qmd embed --collection knowledge
```

首次运行会下载模型，可能需要几分钟。

### 6. 配置 git 钩子

将 git 指向已跟踪的钩子目录，使索引在每次提交、检出、合并和变基时自动保持最新：

```shellscript
git config core.hooksPath .githooks
```

钩子会自动运行 `qmd update` 和 `qmd embed`（使用 Qwen 模型）。如果未安装 `qmd`，钩子会打印提示信息并正常退出。

### 7. 为 Claude 桌面版配置 MCP 服务器

合并到 `~/Library/Application Support/Claude/claude_desktop_config.json`：

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

### 8. 为 Claude Code 配置 MCP 服务器

```shellscript
claude plugin marketplace add tobi/qmd
claude plugin install qmd@qmd
```

### 9. 为 Codex 配置 MCP 服务器

```shellscript
codex mcp add qmd -- qmd mcp
```

### 10. 添加你的内容

创建任意适合你需求的目录结构，例如 `Notes/`、`Ideas/`、`Docs/`、`Journals/`。维基技能会扫描仓库中所有 Markdown 文件（排除 `Wiki/`、`.claude/`、`README.md` 及本地化版本、`AGENTS.md` 和 `CLAUDE.md`），因此你添加的任何 `.md` 文件都可以被摘要处理。

### 11. 使用技能

技能文件存放在 `.claude/skills/` 目录中，设计为由 AI 智能体调用。推荐使用 **Claude Code**（[macOS 桌面应用](https://claude.ai/download) 或 [CLI](https://docs.anthropic.com/en/docs/claude-code)）—— 输入技能名称作为斜杠命令：

```
/knowledge-wiki-summary
```

其他智能体（Codex 等）也可以通过指定完整路径来运行技能，例如：

```
Run the skill at .claude/skills/knowledge-wiki-summary
```

添加或编辑源文件后，按顺序运行这些技能：

| 技能                        | 运行时机                                                               |
| --------------------------- | ---------------------------------------------------------------------- |
| `/knowledge-wiki-summary`   | 添加或编辑源文件后 —— 在 `Wiki/Summaries/` 中生成或刷新摘要文件        |
| `/knowledge-wiki-concept`   | 运行 summary 之后 —— 在 `Wiki/Concepts/` 中创建或更新概念文章          |
| `/knowledge-wiki-synthesis` | 积累新概念后定期运行 —— 发现跨领域联系并撰写综合文章                   |
| `/knowledge-wiki-lint`      | 定期运行，尤其是重新组织源文件后 —— 修复孤立摘要、断链和孤立概念       |
| `/knowledge-wiki-merge`     | 定期运行 —— 交互式会话，识别并合并重复的概念文章                                       |
| `/knowledge-wiki-cluster`   | 定期运行 —— 交互式会话，为缺少父概念的相关子概念集群创建主题概览概念文章               |
| `/knowledge-wiki-enrich`    | 定期运行 —— 使用网络搜索扩展内容较少的概念文章（< 4 行正文，≤ 2 个来源）               |

定期技能（`/knowledge-wiki-synthesis`、`/knowledge-wiki-lint`、`/knowledge-wiki-enrich`）也可以使用 Claude 桌面应用的内置定时功能配置为按计划运行，让维基自动保持最新。
