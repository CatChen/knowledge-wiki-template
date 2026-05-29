---
name: knowledge-wiki-synthesis
description: 'Scan the wiki for cross-cutting connections, implicit relationships, contradictions, and gaps across concepts and summaries, then write synthesis concept files. Use when the user wants to discover non-obvious connections, synthesize the knowledge base, or run a reflection pass after adding new content.'
---

# Knowledge Wiki Synthesis

Discover non-obvious connections across the wiki and write synthesis concept files. Uses a two-phase process: a cheap index-scan to find candidates, then a targeted deep-read to synthesize each one.

## Steps

### 1. Establish the working directory

The knowledge base root is the directory containing this skill's `.claude/` folder. Determine it by resolving the path of the `.claude/` directory upward — the parent of `.claude/` is `KNOWLEDGE_PATH`.

Use `KNOWLEDGE_PATH` for all subsequent steps.

### 2. Find recently updated summaries

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs find-unprocessed-summaries knowledge-wiki-synthesis
```

This outputs a JSON array of summary file paths (relative to `KNOWLEDGE_PATH`) whose `summarized_at` is newer than the last time this skill ran. On the first run (no prior state), it returns all summary files.

Store this list as `RECENT_SUMMARIES`. These paths are used as a priority signal in step 4 — candidates that involve at least one recent summary are ranked higher. They are not an exclusive filter; older summaries and concepts are still considered.

### 3. Load the concept list

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs read-concepts
```

Keep the output in memory for step 4. Each line is one concept entry in the form:

```
- [[Wiki/Concepts/{slug}|{Display Name}]] — {one-line description}
```

### 4. Discover connection candidates

Using only the one-line descriptions from step 3, identify **3–5 strong connection candidates**. Look for:

| Type            | What to look for                                                                   |
| --------------- | ---------------------------------------------------------------------------------- |
| `cross-cutting` | A theme that appears across multiple unrelated summaries or concepts               |
| `relationship`  | Two or more concepts that seem deeply related but are not explicitly linked        |
| `contradiction` | Two summaries or concepts that appear to take opposing positions on the same topic |
| `gap`           | A theme strongly implied by multiple entries but with no dedicated concept article |

**Priority:** Rank higher any candidate that involves at least one entry from `RECENT_SUMMARIES`. If `RECENT_SUMMARIES` is empty (no summaries have been updated since the last run), use your judgment across the whole index.

**Deduplication:** Before proposing a candidate, check whether a concept file already exists at `{KNOWLEDGE_PATH}/Wiki/Concepts/{proposed-slug}.md`. Skip any candidate whose synthesis concept already exists.

For each candidate, record internally:

```
type: cross-cutting | relationship | contradiction | gap
concepts: [slug-a, slug-b, ...]
hypothesis: one sentence describing the connection
files_to_read: [full paths to concept and summary files — prioritize RECENT_SUMMARIES entries and their neighbors]
proposed_slug: lowercase-kebab-case slug for the new concept file
proposed_title: correctly-cased human-readable title
```

If fewer than 2 strong candidates are found, print:

```
Nothing strong enough to synthesize yet. Run again after adding more content.
```

And stop.

### 5. Process each candidate

For each candidate from step 4, run the following sub-steps in order.

---

#### 5a. Read relevant articles

Read each file listed in `files_to_read` using the Read tool. If any file references additional concepts or summaries that seem directly relevant to the hypothesis, read those too. Maximum **8 files** total per candidate.

---

#### 5b. Evaluate synthesis quality

Assess whether the evidence from the files actually supports the hypothesis:

- **Strong evidence** (2+ files directly support the connection) → proceed to 5c and 5d
- **Weak evidence** (only superficial overlap) → note as skipped, do not write a file, continue to next candidate

---

#### 5c. Create the synthesis concept file

1. Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs create "{proposed_slug}" "{proposed_title}" --type Synthesis --icon notepad
   ```
   This creates `Wiki/Concepts/{proposed_slug}.md`. The command prints the file path.

2. Read the file using the Read tool, then edit it to add:
   - **Article body** — insert between `# {proposed_title}` and `## Sources`: 3–5 paragraphs of synthesis in American English. Explain the connection, relationship, contradiction, or gap clearly.
     - For connections: what do these concepts share, and why does it matter?
     - For relationships: how are they related, and what does understanding the relationship reveal?
     - For contradictions: what are the opposing positions, and what might explain the disagreement?
     - For gaps: what is the missing concept, and what would an article about it say?
     Write as a standalone reference — the reader has not read the source articles.
   - **`tags: []`** — replace with relevant lowercase English tags. Use judgement; do not blindly copy all tags from the connected concepts.

3. For each concept this synthesis draws from, add it to the Connected Concepts section (idempotent):
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{proposed_slug}" "{linked-slug}" "{Display Name}"
   ```

4. For each source consulted, add its link (idempotent):
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-source "{proposed_slug}" "{summary-path-without-md}"
   ```
   where `{summary-path-without-md}` is the summary file path with `.md` stripped, e.g. `Wiki/Summaries/Posts/foo.summary`.

---

#### 5d. Update backlinks in connected concept files

For each `{linked-slug}` / `{Display Name}` pair added via `insert-connected-concept` in step 5c.3, back-link that concept's own file to the synthesis:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{linked-slug}" "{proposed_slug}" "{proposed_title}"
```

This appends `- [[Wiki/Concepts/{proposed_slug}|{proposed_title}]]` to the `## Connected Concepts` section of each connected concept file, creating the section before `## Sources` if it does not exist. The operation is idempotent.

---

#### 5e. Update the index

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-concept "{proposed_slug}" "{proposed_title}" "{one-line English description}"
```

---

### 6. Update state

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs set-last-run knowledge-wiki-synthesis
```

### 7. Print summary

```
Synthesized {N} concept(s) from {M} candidate(s):

  ✓ Created: {proposed_slug} — {proposed_title}
      Type: {cross-cutting | relationship | contradiction | gap}
      Connects: {slug-a}, {slug-b}, ...

  ✗ Skipped: {hypothesis} (weak evidence)
      Files consulted: {list}

Suggested follow-up ingestion:
  - {topic} — referenced in {synthesis-slug} but no summary exists yet
```

Omit the "Suggested follow-up ingestion" section if there are no gaps.
