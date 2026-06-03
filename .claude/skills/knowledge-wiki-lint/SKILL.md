---
name: knowledge-wiki-lint
description: 'Audit and repair the knowledge wiki. Detects orphan summaries (source deleted), broken wikilinks, and orphan concept files. Run periodically after accumulating new content or reorganizing source files.'
---

# Knowledge Wiki Lint

Health-check and repair the wiki. Runs twelve checks in sequence — each builds on a clean state left by the previous one. JavaScript handles all file-system detection; the LLM handles any repair that requires judgment.

## Setup

### 1. Establish the working directory

The knowledge base root is the Git repository root. Run `git rev-parse --show-toplevel` and store the result as `KNOWLEDGE_PATH`.

Use `KNOWLEDGE_PATH` for all subsequent steps.

---

## Check 1 — Orphan Summaries

_Deletes summary files whose source document has been moved or deleted._

### 2. Find orphan summaries

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs orphan-summaries
```

Output is a JSON object keyed by orphan summary file path (relative to `KNOWLEDGE_PATH`). Each value has a `source` field with the path the summary expected to find, or `null` if the frontmatter had no `source` field.

If the object is empty (`{}`), skip to Check 2 and print `Check 1: no orphan summaries.`

### 3. Delete orphan summary files and remove their index entries

For each key in the output:

1. Delete the file at `{KNOWLEDGE_PATH}/{key}`.
2. Derive the summary's rel-path by stripping the `Wiki/Summaries/` prefix and the `.md` extension from the key. Example: `Wiki/Summaries/Posts/Foo.summary.md` → `Posts/Foo.summary`. Then run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs delete-summary "{rel-path}"
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
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs broken-summary-links
```

Output is a JSON object keyed by missing concept file path. Each value has a `referencedBy` array listing the summary files that link to that missing concept.

If the object is empty (`{}`), skip to Check 3 and print `Check 2: no broken summary → concept links.`

For each missing concept:

#### 4a. Read referencing summaries

Read each file listed in the `referencedBy` array.

#### 4b. Create the concept file

Create `{KNOWLEDGE_PATH}/{key}` following exactly the format and instructions in the `knowledge-wiki-concept` skill (step 3b — "If the concept file does NOT exist"). Draw on all referencing summary files to write the article.

#### 4c. Update the index

Derive the slug from the concept file path (basename without `.md`), and the display name from the `# Title` line of the file just created. Then follow step 3c of the `knowledge-wiki-concept` skill.

---

## Check 3 — Broken Concept → * Links

_Removes dead bullet points from concept files that link to missing targets._

### 5. Find and remove dead bullet points

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs broken-concept-links
```

Output is a JSON object keyed by concept file path. Each value has a `brokenLinks` array of raw wikilink target strings (the text between `[[` and `]]`) that resolve to missing files.

If the object is empty (`{}`), skip to Check 4 and print `Check 3: no broken concept links.`

For each concept file in the output:

1. Derive the slug (basename of the concept file path without `.md`). Example: `Wiki/Concepts/foo-bar.md` → `foo-bar`.
2. For each string in `brokenLinks`, inspect the target to determine which command to run:
   - **If the target starts with `Wiki/Summaries/`** — it is a broken source link. Run:
     ```bash
     node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs delete-source "{slug}" "{broken-link-target}"
     ```
   - **If the target starts with `Wiki/Concepts/`** — it is a broken connected-concept link. Extract the linked slug by stripping the `Wiki/Concepts/` prefix from the target. Example: `Wiki/Concepts/foo-bar` → `foo-bar`. Run:
     ```bash
     node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs delete-connected-concept "{slug}" "{linked-slug}"
     ```
   Double-quote all arguments to protect special characters.

---

## Check 4 — Ungrounded Concepts

_Deletes source-grounded concept files that no longer have any valid source summaries._

### 6. Find and delete ungrounded concepts

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs ungrounded-concepts
```

Output is a JSON array of `type: Concept` file paths whose `## Sources` section has no bullet linking to an existing `Wiki/Summaries/...` file. `type: Synthesis` files are not included.

If the array is empty (`[]`), skip to Check 5 and print `Check 4: no ungrounded concepts.`

For each path in the array:

1. Delete the file at `{KNOWLEDGE_PATH}/{path}`.
2. Derive the slug (basename of `{path}` without `.md`). Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs delete-concept "{slug}"
   ```

If any ungrounded concepts were deleted, rerun Check 3 once before continuing to Check 5. The rerun removes any newly broken Connected Concepts entries that pointed to the deleted files. Record removals from the rerun together with the original Check 3 result in the final summary.

---

## Check 5 — Orphan Concepts

_Deletes concept files that nothing links to._

### 7. Find and delete orphan concepts

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs orphan-concepts
```

Output is a JSON object keyed by orphan concept file path.

If the object is empty (`{}`), skip to Check 6 and print `Check 5: no orphan concepts.`

For each key in the output:

1. Delete the file at `{KNOWLEDGE_PATH}/{key}`.
2. Derive the slug (basename of `{key}` without `.md`). Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs delete-concept "{slug}"
   ```

---

## Check 6 — Dead Index Links

_Removes entries from `Wiki/index.md` that point to files that no longer exist on disk._

### 8. Remove dead index links

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs remove-dead-links
```

Output is a JSON object `{ "concepts": N, "summaries": N }` with the count of deleted entries in each section. The script writes the updated index automatically.

If both counts are zero, print `Check 6: no dead index links.` and skip to Check 7.

Otherwise record the counts for the final summary — no further action required.

---

## Check 7 — Missing Summary Index Entries

_Adds index entries for summary files on disk that have no Wikilink in `Wiki/index.md`._

### 9. Find summaries missing from the index

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs find-missing-summaries
```

Output is a JSON array of rel-paths (e.g. `["AvocadoToast/foo.summary"]`).

If the array is empty, print `Check 7: no summary index entries missing.` and skip to Check 8.

### 10. Generate and insert missing summary entries

For each rel-path in the array:

1. Read the summary file at `{KNOWLEDGE_PATH}/Wiki/Summaries/{rel-path}.md`.
2. Generate a one-line English description of the source document from the `## Summary` section.
3. Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-summary "{rel-path}" "{description}"
   ```

---

## Check 8 — Missing Concept Index Entries

_Adds index entries for concept files on disk that have no Wikilink in `Wiki/index.md`._

### 11. Find concepts missing from the index

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs find-missing-concepts
```

Output is a JSON array of slugs (e.g. `["autonomous-driving"]`).

If the array is empty, print `Check 8: no concept index entries missing.` and skip to Check 9.

### 12. Generate and insert missing concept entries

For each slug in the array:

1. Read the concept file at `{KNOWLEDGE_PATH}/Wiki/Concepts/{slug}.md`.
2. Extract the display name from the `# Title` line of the file.
3. Generate a one-line English description from the file's opening prose.
4. Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-concept "{slug}" "{display-name}" "{description}"
   ```

---

## Check 9 — Stale Dismissed Merge Pairs

_Removes entries from the merge dismissal list in `Wiki/.state.json` whose concept files no longer exist._

### 13. Prune stale dismissed pairs

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs prune-merge-pairs
```

Output is a single integer: the number of pairs pruned. If `0`, print `Check 9: no stale dismissed pairs.`

---

## Check 10 — Stale Dismissed Cluster Pairs

_Removes entries from the cluster dismissal list in `Wiki/.state.json` where the child concept file no longer exists on disk. Parent absence is allowed — a pair may have been recorded before the parent was created._

### 14. Prune stale dismissed cluster pairs

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs prune-cluster-pairs
```

Output is a single integer: the number of entries pruned. If `0`, print `Check 10: no stale dismissed cluster pairs.`

---

## Check 11 — Self-Links in Connected Concepts

_Removes Connected Concepts entries where a concept links to itself._

### 15. Find and remove self-links

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs self-links
```

Output is a JSON object keyed by concept file path. If empty (`{}`), print `Check 11: no self-links.` and skip to Check 12.

For each concept file in the output:

1. Derive the slug (basename without `.md`). Example: `Wiki/Concepts/foo-bar.md` → `foo-bar`.
2. Remove the self-referencing Connected Concepts entry:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs delete-connected-concept "{slug}" "{slug}"
   ```

---

## Check 12 — Duplicate Concept Links in Summaries

_Consolidates Key Concepts entries where the same concept wikilink appears more than once in the same summary, typically caused by merging or folding multiple concepts into a single parent._

### 16. Find summaries with duplicate concept links

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs duplicate-concept-links
```

Output is a JSON object keyed by summary file path. Each value is an array of `{ conceptPath, lines }` objects — one per duplicated concept, listing all the lines that reference it. If empty (`{}`), print `Check 12: no duplicate concept links.` and skip to Final Steps.

### 17. Consolidate duplicate entries

For each summary file and each duplicated concept within it:

1. Read all duplicate lines for that concept.
2. Derive the concept slug from `conceptPath` (basename without `.md`). Example: `Wiki/Concepts/hong-kong.md` → `hong-kong`.
3. Extract the display name from any duplicate line (the `|Display Name` part of the wikilink). If the links are bare (no `|` alias), read the concept file's `# Title` line and use that as the display name.
4. Write a single combined description that merges the key facts from all duplicate entries. **Write the description in the same language as the original entries.** Example:
   - Line 1: `- [[Wiki/Concepts/hong-kong|Hong Kong]] — Gray market goods helping both economies`
   - Line 2: `- [[Wiki/Concepts/hong-kong|Hong Kong]] — Disney used it as negotiating leverage`
   - Combined description: `Gray market goods trade channel and Disney's negotiating leverage for mainland market entry`
5. Delete all duplicate entries for that concept. Pass all fields via a single-quoted heredoc so that summary paths containing quotes or other shell-special characters are safe:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-summary.mjs delete-concept - <<'EOF'
   {summary-rel-path}
   {concept-slug}
   EOF
   ```
6. Insert the single combined entry the same way — all four fields via heredoc, one per line:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-summary.mjs insert-concept - <<'EOF'
   {summary-rel-path}
   {concept-slug}
   {display-name}
   {combined-description}
   EOF
   ```

---

## Final Steps

### 18. Print summary

Print the header, then a markdown table (not in a code block) with one row per check. Output the table so it renders:

---
**Knowledge Wiki Lint**

| Check | Result | Details |
|-------|--------|---------|
| 1 · Orphan Summaries | Deleted {N} \| None | {comma-separated Display Names, or omit cell if none} |
| 2 · Broken Summary → Concept Links | Created {N} \| None | {comma-separated Display Names, or omit cell if none} |
| 3 · Broken Concept → * Links | Removed {N} \| None | {M} concept file(s) affected, or omit cell if none |
| 4 · Ungrounded Concepts | Deleted {N} \| None | {comma-separated Display Names, or omit cell if none} |
| 5 · Orphan Concepts | Deleted {N} \| None | {comma-separated Display Names, or omit cell if none} |
| 6 · Dead Index Links | Removed {N} \| None | {M} concept(s), {K} summary(s), or omit cell if none |
| 7 · Missing Summary Index Entries | Added {N} \| None |  |
| 8 · Missing Concept Index Entries | Added {N} \| None |  |
| 9 · Stale Dismissed Merge Pairs | Pruned {N} \| None |  |
| 10 · Stale Dismissed Cluster Pairs | Pruned {N} \| None |  |
| 11 · Self-Links in Connected Concepts | Removed {N} \| None | {M} concept file(s) affected, or omit cell if none |
| 12 · Duplicate Concept Links in Summaries | Consolidated {N} \| None | across {M} summary file(s), or omit cell if none |

---

Use `None` in the Result column when a check found nothing to fix. Omit the Details cell content (leave the cell empty) when there are no meaningful details beyond what the Result column already conveys.
