---
name: knowledge-wiki-concept
description: "Create or update wiki concept files from knowledge base summaries. Use when the user wants to build or refresh concept articles, populate Wiki/Concepts, or run the concept-creation step after summarizing new files."
---

# Knowledge Wiki Concept

Create or update concept articles in `Wiki/Concepts/` by extracting concepts from summary files that have been updated since the last run.

## Steps

### 1. Establish the working directory

The knowledge base root is the directory containing this skill's `.claude/` folder. Determine it by resolving the path of the `.claude/` directory upward — the parent of `.claude/` is `KNOWLEDGE_PATH`.

Use `KNOWLEDGE_PATH` for all subsequent steps.

### 2. Find summary files to process

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki-state.mjs find-unprocessed-summaries knowledge-wiki-concept
```

This outputs a JSON array of summary file paths (relative to `KNOWLEDGE_PATH`) that are new or updated since the last run. Example:

```json
[
  "Wiki/Summaries/Posts/Alexa, tell me a joke..summary.md",
  "Wiki/Summaries/Posts/Vision Pro 使用体验（Part 1）.summary.md"
]
```

If the array is empty, print `Nothing to process.` and stop.

### 3. Process each summary file

For each path in the array from step 2, run the following sub-steps.

---

#### 3a. Read the summary file

Read the summary file using the Read tool.

Parse the `## Key Concepts` section. Each line has the form:

```
- [[Wiki/Concepts/{concept-slug}|{Display Name}]] — {description}
```

Extract the slug, display name, and description for each concept.

Also note the summary file's `tags` frontmatter field — you may draw on these when choosing concept tags, but only include tags that are genuinely relevant to the concept itself.

Derive the summary's link-path by stripping the `.md` extension from the summary file path, and store it as `{summary-link-path}`. Example: `Wiki/Summaries/Posts/foo.summary.md` → `Wiki/Summaries/Posts/foo.summary`

---

#### 3b. For each concept, create or update its file

**If the concept file does NOT exist**, create it:

1. Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki-concept.mjs create "{concept-slug}" "{Display Name}"
   ```
   This creates `Wiki/Concepts/{concept-slug}.md` with frontmatter and an empty `## Sources` section. The command prints the file path.

2. Read the file using the Read tool, then edit it to add:
   - **Article body** — insert between the `# {Display Name}` line and `## Sources`: a 2–4 paragraph article explaining this concept clearly. Write it as a standalone reference: define the concept, explain why it matters, describe how it works, and note any important variants or related ideas. Assume the reader knows the field but is encountering this concept for the first time.
   - **`tags: []`** — replace with relevant lowercase English tags. You may draw on the summary's `tags` frontmatter field as a starting point, but only include tags that are genuinely relevant to the concept itself.

   **Language:** Always write concept articles in English, regardless of the language of the source summaries. Concepts are the cross-language synthesis layer of the knowledge base. Use American English spelling.

3. Add the source link:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki-concept.mjs insert-source "{concept-slug}" "{summary-link-path}"
   ```

---

**If the concept file DOES exist**, update it:

1. Read the existing file.
2. Add any tags that are relevant to the concept and not already present — use judgement, do not blindly copy all tags from the summary. Never remove existing tags.
3. If the summary introduces information not already covered in the article body, integrate it naturally — extend an existing paragraph or add a new one. Do not duplicate content already there.
4. Add the source link (idempotent — no-op if already present):
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki-concept.mjs insert-source "{concept-slug}" "{summary-link-path}"
   ```

---

#### 3c. Update the index

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki-index.mjs upsert-concept "{concept-slug}" "{Display Name}" "{one-line English description}"
```

---

### 4. Update state

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki-state.mjs set-last-run knowledge-wiki-concept
```

### 5. Print summary

```
Processed {N} summary file(s), created/updated {M} concept(s):
  Created: {concept-slug} — {Display Name}
  Updated: {concept-slug} — {Display Name}
  ...
```
