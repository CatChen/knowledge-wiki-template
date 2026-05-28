---
name: knowledge-wiki-lint
description: 'Audit and repair the knowledge wiki. Detects orphan summaries (source deleted), broken wikilinks, and orphan concept files. Run periodically after accumulating new content or reorganising source files.'
---

# Knowledge Wiki Lint

Health-check and repair the wiki. Runs four checks in sequence — each builds on a clean state left by the previous one. JavaScript handles all file-system detection; the LLM handles any repair that requires judgment.

## Setup

### 1. Establish the working directory

The knowledge base root is the directory containing this skill's `.claude/` folder. Determine it by resolving the path of the `.claude/` directory upward — the parent of `.claude/` is `KNOWLEDGE_PATH`.

Use `KNOWLEDGE_PATH` for all subsequent steps.

---

## Check 1 — Orphan Summaries

_Deletes summary files whose source document has been moved or deleted._

### 2. Find orphan summaries

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/find-orphan-summaries.mjs
```

Output is a JSON object keyed by orphan summary file path (relative to `KNOWLEDGE_PATH`). Each value has a `source` field with the path the summary expected to find, or `null` if the frontmatter had no `source` field.

If the object is empty (`{}`), skip to Check 2 and print `Check 1: no orphan summaries.`

### 3. Delete orphan summary files and remove their index entries

For each key in the output:

1. Delete the file at `{KNOWLEDGE_PATH}/{key}`.
2. Derive the summary's rel-path by stripping the `Wiki/Summaries/` prefix and the `.md` extension from the key. Example: `Wiki/Summaries/Posts/Foo.summary.md` → `Posts/Foo.summary`. Then run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki-index.mjs delete-summary "{rel-path}"
   ```

After processing all orphans, delete any now-empty directories under `Wiki/Summaries/`:

```bash
find {KNOWLEDGE_PATH}/Wiki/Summaries -type d -empty -delete
```

---

## Check 2 — Broken Summary → Concept Links

_Creates missing concept files referenced by summaries._

### 4. Find and repair broken summary → concept links

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/find-broken-summary-links.mjs
```

Output is a JSON object keyed by missing concept file path. Each value has a `referencedBy` array listing the summary files that link to that missing concept.

If the object is empty (`{}`), skip to Check 3 and print `Check 2: no broken summary → concept links.`

For each missing concept:

#### 4a. Read referencing summaries

Read each file listed in the `referencedBy` array.

#### 4b. Create the concept file

Create `{KNOWLEDGE_PATH}/{key}` following exactly the format and instructions in `.claude/skills/knowledge-wiki-concept/SKILL.md` under step 3b ("If the concept file does NOT exist"). Draw on all referencing summary files to write the article.

#### 4c. Update the index

Derive the slug from the concept file path (basename without `.md`), and the display name from the `# Title` line of the file just created. Then follow step 3c of `.claude/skills/knowledge-wiki-concept/SKILL.md`.

---

## Check 3 — Broken Concept → * Links

_Removes dead bullet points from concept files that link to missing targets._

### 5. Find and remove dead bullet points

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/find-broken-concept-links.mjs
```

Output is a JSON object keyed by concept file path. Each value has a `brokenLinks` array of raw wikilink target strings (the text between `[[` and `]]`) that resolve to missing files.

If the object is empty (`{}`), skip to Check 4 and print `Check 3: no broken concept links.`

For each concept file in the output:

1. Derive the slug (basename of the concept file path without `.md`). Example: `Wiki/Concepts/foo-bar.md` → `foo-bar`.
2. For each string in `brokenLinks`, inspect the target to determine which command to run:
   - **If the target starts with `Wiki/Summaries/`** — it is a broken source link. Run:
     ```bash
     node {KNOWLEDGE_PATH}/scripts/wiki-concept.mjs delete-source "{slug}" "{broken-link-target}"
     ```
   - **If the target starts with `Wiki/Concepts/`** — it is a broken connected-concept link. Extract the linked slug by stripping the `Wiki/Concepts/` prefix from the target. Example: `Wiki/Concepts/foo-bar` → `foo-bar`. Run:
     ```bash
     node {KNOWLEDGE_PATH}/scripts/wiki-concept.mjs delete-connected-concept "{slug}" "{linked-slug}"
     ```
   Double-quote all arguments to protect special characters.

---

## Check 4 — Orphan Concepts

_Deletes concept files that nothing links to._

### 6. Find and delete orphan concepts

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/find-orphan-concepts.mjs
```

Output is a JSON object keyed by orphan concept file path.

If the object is empty (`{}`), skip to Check 5 and print `Check 4: no orphan concepts.`

For each key in the output:

1. Delete the file at `{KNOWLEDGE_PATH}/{key}`.
2. Derive the slug (basename of `{key}` without `.md`). Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki-index.mjs delete-concept "{slug}"
   ```

---

## Check 5 — Dead Index Links

_Removes entries from `Wiki/index.md` that point to files that no longer exist on disk._

### 7. Remove dead index links

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki-index.mjs remove-dead-links
```

Output is a JSON object `{ "concepts": N, "summaries": N }` with the count of deleted entries in each section. The script writes the updated index automatically.

If both counts are zero, print `Check 5: no dead index links.` and skip to Check 6.

Otherwise record the counts for the final summary — no further action required.

---

## Check 6 — Missing Summary Index Entries

_Adds index entries for summary files on disk that have no Wikilink in `Wiki/index.md`._

### 8. Find summaries missing from the index

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki-index.mjs find-missing-summaries
```

Output is a JSON array of rel-paths (e.g. `["AvocadoToast/foo.summary"]`).

If the array is empty, print `Check 6: no summary index entries missing.` and skip to Check 7.

### 9. Generate and insert missing summary entries

For each rel-path in the array:

1. Read the summary file at `{KNOWLEDGE_PATH}/Wiki/Summaries/{rel-path}.md`.
2. Generate a one-line English description of the source document from the `## Summary` section.
3. Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki-index.mjs upsert-summary "{rel-path}" "{description}"
   ```

---

## Check 7 — Missing Concept Index Entries

_Adds index entries for concept files on disk that have no Wikilink in `Wiki/index.md`._

### 10. Find concepts missing from the index

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki-index.mjs find-missing-concepts
```

Output is a JSON array of slugs (e.g. `["autonomous-driving"]`).

If the array is empty, print `Check 7: no concept index entries missing.` and skip to Check 8.

### 11. Generate and insert missing concept entries

For each slug in the array:

1. Read the concept file at `{KNOWLEDGE_PATH}/Wiki/Concepts/{slug}.md`.
2. Extract the display name from the `# Title` line of the file.
3. Generate a one-line English description from the file's opening prose.
4. Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki-index.mjs upsert-concept "{slug}" "{display-name}" "{description}"
   ```

---

## Check 8 — Stale Dismissed Merge Pairs

_Removes entries from the merge dismissal list in `Wiki/.state.json` whose concept files no longer exist._

### 12. Prune stale dismissed pairs

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki-state.mjs prune-merge-pairs
```

Output is a single integer: the number of pairs pruned. If `0`, print `Check 8: no stale dismissed pairs.`

---

## Final Steps

### 13. Print summary

```
Knowledge Wiki Lint

Check 1 · Orphan Summaries
  Deleted {N} orphan summary file(s):
    - {Display Name} (source: {source})
  [or: No orphan summaries found.]

Check 2 · Broken Summary → Concept Links
  Created {N} missing concept file(s): {Display Name}, ...
  [or: No broken summary → concept links found.]

Check 3 · Broken Concept → * Links
  Removed {N} dead bullet point(s) from {M} concept file(s).
  [or: No broken concept links found.]

Check 4 · Orphan Concepts
  Deleted {N} orphan concept file(s): {Display Name}, ...
  [or: No orphan concepts found.]

Check 5 · Dead Index Links
  Removed {N} dead link(s) from Wiki/index.md ({M} concept(s), {K} summary(s)).
  [or: No dead index links found.]

Check 6 · Missing Summary Index Entries
  Added {N} missing summary entr(y/ies) to Wiki/index.md.
  [or: No summary index entries missing.]

Check 7 · Missing Concept Index Entries
  Added {N} missing concept entr(y/ies) to Wiki/index.md.
  [or: No concept index entries missing.]

Check 8 · Stale Dismissed Merge Pairs
  Pruned {N} stale pair(s).
  [or: No stale dismissed pairs.]
```
