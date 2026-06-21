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

#### 3a. Read the source file

**If the source file is 1500 lines or fewer**, read it directly with the Read tool in the main context and proceed to step 3b.

**If the source file is over 1500 lines**, spawn a subagent to read the full source. Brief the subagent with:
- The source file path: `{KNOWLEDGE_PATH}/{source_path}`
- The full step 3b content-generation instructions (copy the entire section into the prompt)

Instruct the subagent to:
1. Read the full source file using the Read tool, using `offset`/`limit` for subsequent pages if the file is truncated
2. Generate and return all of the following (do not write any files):
   - Tags (3–8 lowercase English tags, comma-separated)
   - Title (in source language)
   - `## Summary` content (2–4 sentences in source language)
   - `## Key Concepts` bullets (in source language)
   - `## Notable Details` content (in source language)
   - A one-line English description of the source document (used in step 3d)

When the subagent returns, skip the generation part of step 3b and proceed directly to the `create` command in step 3c, using the content the subagent returned.

---

#### 3b. Generate the summary content

**Language:** Write the title, summary prose, and key points in the same language as the source document. If the source is in Mandarin, write in Mandarin. If in Cantonese, write in Cantonese. Only fall back to English if the source language is ambiguous or mixed. Section headers (`## Summary`, `## Key Concepts`) stay in English regardless of source language. When writing in English, use American English spelling (e.g. "realize" not "realise", "organize" not "organise").

Generate the following content from the source document:

1. **`tags`** — 3–8 lowercase English tags based on content, comma-separated

2. **Title** — infer from content or filename, in source language

3. **`## Summary`** — 2–4 sentences in source language summarizing the document's main subject, argument, or purpose

4. **`## Key Concepts`** — a bulleted list of 3–8 key concepts this source covers, each formatted as:
   ```
   - [[Wiki/Concepts/{concept-slug}|{Display Name}]] — {brief description in source language}
   ```
   - Concept slugs are always lowercase English kebab-case regardless of source language.
   - Display Name is the correctly-cased human-readable title **always in English**, regardless of source language (e.g. `[[Wiki/Concepts/restful-api|RESTful API]]`). Infer the English concept name from the source text — don't derive it mechanically from the slug.
   - Concept files may not exist yet — broken links are acceptable here.

5. **`## Notable Details`** — any specific facts, figures, quotes, findings, or techniques worth preserving verbatim, in source language

---

#### 3c. Write the summary file

First, generate a unique temp file path:

```bash
mktemp /tmp/wiki_summary_body.XXXXXX
```

The command prints the path (e.g. `/tmp/wiki_summary_body.aB3xYz`). Store this as `{tmpfile}`.

Use the Write tool to write the generated content to `{tmpfile}`:

```
# Title

## Summary
...

## Key Concepts
- [[Wiki/Concepts/example-concept|Example Concept]] — brief description

## Notable Details
...
```

Then pipe it into `create` and clean up:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-summary.mjs create "{source_path}" --tags "[tag1, tag2, tag3]" < "{tmpfile}" && rm "{tmpfile}"
```

The script writes all frontmatter (`source`, `hash`, `summarized_at`, `type`, `_icon`) and the `## Backlinks` section automatically, then prints the summary file path. Store this as `{summary_path}`.

If `create` exits with an error (e.g. source file not found), do not proceed. Run `ls "{KNOWLEDGE_PATH}/$(dirname "{source_path}")"` to find the exact filename on disk, then retry with the correct path.

---

#### 3d. Update the index

Derive the summary's rel-path by stripping the `Wiki/Summaries/` prefix and the `.md` extension from `{summary_path}`.

Example: `Wiki/Summaries/Posts/Buy Me a Coffee.summary.md` → `Posts/Buy Me a Coffee.summary`

Generate a one-line English description of the source document. If a subagent was used in step 3a, use the description it returned instead of generating a new one.

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
