---
name: knowledge-wiki-summary
description: 'Generate or refresh wiki summaries for knowledge base markdown files. Use when the user wants to summarize notes, update the wiki, compile stale summaries, or process new knowledge base files into Wiki/Summaries.'
---

# Knowledge Wiki Summary

Batch process all stale or new knowledge base files and write their wiki summaries. Incremental — only processes files whose content has changed since the last summary was written.

## Steps

### 1. Establish the working directory

The knowledge base root is the Git repository root. Run `git rev-parse --show-toplevel` and store the result as `KNOWLEDGE_PATH`.

Use `KNOWLEDGE_PATH` for all subsequent steps.

### 2. Find files that need summarizing

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-summary.mjs list-stale
```

Output format:

```json
{ "sources": ["Posts/Buy Me a Coffee.md", ...] }
```

Each entry is a source file path relative to `KNOWLEDGE_PATH`.

If `sources` is empty, print `Nothing to summarize.` and stop.

### 3. Process each file

For each entry in `sources`, run the following sub-steps in order.

---

#### 3a. Create the summary skeleton

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-summary.mjs create "{source_path}"
```

The script reads the source file, computes the hash, writes `source`, `hash`, `summarized_at`, `type`, `_icon`, and the `## Backlinks` entry automatically, then prints the summary file path. Store this path as `{summary_path}`.

---

#### 3b. Fill in the summary content

**If the source file is 1500 lines or fewer**, read it directly with the Read tool and proceed to fill in the skeleton in the main context. Go to step 3c.

**If the source file is over 1500 lines**, spawn a subagent to read the full source and fill in the skeleton. Brief the subagent with:
- The source file path: `{KNOWLEDGE_PATH}/{source_path}`
- The summary file path: `{KNOWLEDGE_PATH}/{summary_path}`
- The full step 3c instructions (copy the entire section into the prompt)

Instruct the subagent to:
1. Read the full source file using the Read tool, using `offset`/`limit` for subsequent pages if the file is truncated
2. Edit the summary file to fill in the content per step 3c
3. Return a one-line English description of the source document (used in step 3d)

When the subagent returns, **skip step 3c**. Use the description it returned in step 3d.

---

#### 3c. Edit the skeleton (direct-read path only; skip if subagent was used)

The skeleton already has all frontmatter and the `## Backlinks` section filled in. Read the file at `{KNOWLEDGE_PATH}/{summary_path}` using the Read tool, then edit it to complete:

**Language:** Write the title, summary prose, and key points in the same language as the source document. If the source is in Mandarin, write in Mandarin. If in Cantonese, write in Cantonese. Only fall back to English if the source language is ambiguous or mixed. Section headers (`## Summary`, `## Key Concepts`) stay in English regardless of source language. When writing in English, use American English spelling (e.g. "realize" not "realise", "organize" not "organise").

Fill in each of these fields:

1. **Title** — replace `# ` with `# {Title in source language: infer from content or filename}`

2. **`tags: []`** — replace with `tags: [{3–8 lowercase English tags based on content, comma-separated}]`

3. **`## Summary`** — add 2–4 sentences in source language summarizing the document's main subject, argument, or purpose

4. **`## Key Concepts`** — add a bulleted list of 3–8 key concepts this source covers, each formatted as:
   ```
   - [[Wiki/Concepts/{concept-slug}|{Display Name}]] — {brief description in source language}
   ```
   - Concept slugs are always lowercase English kebab-case regardless of source language.
   - Display Name is the correctly-cased human-readable title **always in English**, regardless of source language (e.g. `[[Wiki/Concepts/restful-api|RESTful API]]`). Infer the English concept name from the source text — don't derive it mechanically from the slug.
   - Concept files may not exist yet — broken links are acceptable here.

5. **`## Notable Details`** — add any specific facts, figures, quotes, findings, or techniques worth preserving verbatim, in source language

---

#### 3d. Update the index

Derive the summary's rel-path by stripping the `Wiki/Summaries/` prefix and the `.md` extension from `{summary_path}`.

Example: `Wiki/Summaries/Posts/Buy Me a Coffee.summary.md` → `Posts/Buy Me a Coffee.summary`

Generate a one-line English description of the source document. If a subagent was used in step 3b, use the description it returned instead of generating a new one.

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-summary "{rel-path}" "{one-line description}"
```

---

### 4. Print summary

```
Summarized {N} file(s):
  - {source_path} → {summary_path}
  - {source_path} → {summary_path}
  ...
```
