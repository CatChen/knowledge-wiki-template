---
name: knowledge-wiki-cluster
description: 'Find groups of concepts that share a non-existing implied parent slug, create a parent concept, then fold thin or redundant children into it or skip substantial ones (keep as standalone, linked to parent). Net result: fewer total concepts, with the parent article absorbing content from folded children. Run after accumulating new concepts or when the wiki has clusters of narrowly-named sub-concepts without a parent.'
---

# Knowledge Wiki Cluster

Detect clusters of concepts that share a non-existing implied parent slug, create a parent topic overview, then decide for each child whether to **fold** (merge content into parent and delete the child) or **skip** (keep the child as a standalone concept linked to the parent). The goal is to reduce total concept count by absorbing thin, redundant, or retired sub-concepts into a parent article.

Each concept is grouped under its non-existing prefix ancestors up to (but not including) its nearest existing ancestor — so `apple-watch-ultra` still forms an `[apple-watch]` cluster even when `apple.md` exists. Presents one cluster at a time — you decide whether to create, dismiss (never show again), or skip.

**Resumability:** All Fold/Skip decisions are collected before any files are created or modified. An interruption during the Q&A phase leaves no partial state — simply re-run and the same cluster surfaces again. If interrupted during the batch write phase (after all decisions are collected), the parent file may already exist, which prevents the cluster from surfacing again. In that case, complete the remaining sub-steps manually: write the body if still a skeleton; re-run the `insert-connected-concept` commands (idempotent) for any unlinked children; run `upsert-concept` if the parent is absent from the index. Remaining fold work can be done later via `knowledge-wiki-merge`. Do not re-run the full skill on an existing parent.

## Steps

### 1. Establish the working directory

The knowledge base root is the Git repository root. Run `git rev-parse --show-toplevel` and store the result as `KNOWLEDGE_PATH`.

### 2. Find clusters

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs missing-parent-clusters
```

This outputs `{ "clusters": [...] }` sorted **deepest first** (most hyphens in `impliedParent`), with ties broken by cluster size descending. Each entry has `impliedParent` (the slug that doesn't exist yet) and `children` (array of concept file paths, e.g. `Wiki/Concepts/audi-etron.md`). Previously dismissed clusters are already filtered out.

Derive each child's slug from its filename: `Wiki/Concepts/audi-etron.md` → `audi-etron`. Use this slug wherever `{child-slug}` appears below.

If the `clusters` array is empty, print `No clusters found.` and stop.

### 3. LLM pre-filter

Before presenting clusters to the user, auto-dismiss clusters where the implied parent is a common English modifier rather than a meaningful proper noun or specific topic — e.g. `smart` grouping `smart-home` with `smart-money`, or `the` grouping `the-economist` with `the-expanse`. Children spanning clearly unrelated domains are a reliable signal for auto-dismissal.

For each auto-dismissed cluster:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-cluster-parent "{impliedParent}"
```

Be conservative — a wrongly dismissed cluster requires manually editing `Wiki/.state.json` to recover.

### 4. Present and resolve each cluster

Process one cluster at a time. Use a **separate interaction for each cluster** — never combine multiple clusters into a single question.

Maintain an **in-memory processed set** of `impliedParent` slugs handled in this session. After a Create, exclude already-processed slugs from the refreshed cluster list.

---

#### 4a. Read and summarize

Read every child concept file. Present a brief summary:

```
─────────────────────────────────────
Cluster: [{impliedParent}]  ({N} children)

  {child-slug} — {one-sentence description}
  {child-slug} — {one-sentence description}
  ...
─────────────────────────────────────
```

Derive a human-readable **Display Name** for the implied parent (e.g. `audi` → `Audi`, `apple-watch` → `Apple Watch`, `career` → `Career`).

Then write 1–2 sentences of reasoning: what the children have in common, whether a parent would add meaningful value, and your recommendation.

#### 4b. Ask what to do

A cluster is **strongly recommended** when the implied parent is a clear brand, product line, or named topic with 3+ children that obviously belong under it; otherwise it is **not strongly recommended**. Add `(Recommended)` to the Create label only when strongly recommended. **Never** put `(Recommended)` on Dismiss or Skip.

| # | Option | Description |
|---|--------|-------------|
| 1 | `Create "{Display Name}"` | Create the parent concept and decide what to do with each child |
| 2 | `Dismiss` | These don't belong together; never show this cluster again |
| 3 | `Skip` | Leave for now; show again next run |

**If `AskUserQuestion` is available**, invoke it with these options. **If unavailable**, print as a numbered list; accept `1`, `2`, `3`, or `stop` (halt all remaining clusters). Users may also type "stop" in the Other field.

---

#### 4c. If Create was selected

**Collect Fold/Skip decisions for all children before creating any files.**

Process one child at a time. Write 1–2 sentences of reasoning. Recommend **Fold** for:
- Thin concepts (short prose, few sources) whose content would naturally be a section of the parent
- Narrow sub-topics more useful as context within the parent than as standalone articles
- Concepts that add little value when found independently

Recommend **Skip** for:
- Substantive articles with rich prose and multiple sources
- Cross-cutting concepts linked from many other concepts
- Topics genuinely distinct and useful to find independently

**If `AskUserQuestion` is available**, ask with these options (add `(Recommended)` to whichever applies):

| # | Option | Description |
|---|--------|-------------|
| 1 | `Fold "{child-display-name}" into "{Display Name}"` | Merge child's content into parent, then delete child |
| 2 | `Skip "{child-display-name}"` | Keep child standalone; will be linked to parent |

**If `AskUserQuestion` is unavailable**, print as a numbered list. Accept: `1` (Fold), `2` (Skip), `done` (stop asking and proceed with decisions collected so far — unprocessed children will be treated as Skip), or `stop` (halt all remaining clusters).

Record each decision in memory. Do not create or edit any files until all children have been decided (or `done`/`stop` was entered).

**After collecting all decisions, create and populate the parent concept:**

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs create "{impliedParent}" "{Display Name}"
```

This creates `Wiki/Concepts/{impliedParent}.md`.

**Write the initial parent article body:**

Read the file, then insert a 1–3 paragraph topic overview between `# {Display Name}` and `## Sources`. Write it as a factual reference — what this topic is and what sub-concepts exist under it. Keep it concise; each Fold will enrich the body incrementally. Use American English spelling. Update the existing `tags: []` field with the union of tags from the child files, keeping only those that genuinely describe the parent topic.

**Link all children bidirectionally (idempotent):**

For each child, derive its display name from its H1 heading (`# …`). Run both commands — the first adds the child to the parent's Connected Concepts, the second adds the parent to the child's:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{impliedParent}" "{child-slug}" "{child-display-name}"
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{child-slug}" "{impliedParent}" "{Display Name}"
```

Run this for every child regardless of fold/skip decision.

**Update the index:**

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-concept "{impliedParent}" "{Display Name}" "{one-line English description}"
```

**Execute folds:**

For each child where Fold was chosen, execute the `knowledge-wiki-merge` step 3c with this mapping:
- **primary** = parent: slug `{impliedParent}`, display name `{Display Name}`, path `Wiki/Concepts/{impliedParent}.md`
- **secondary** = child: slug `{child-slug}`, display name `{child-display-name}`, path `Wiki/Concepts/{child-slug}.md`

**Wrap up:**

This runs whether or not all children were processed. Add `{impliedParent}` to the in-memory processed set. Re-run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs missing-parent-clusters
```

Replace your working cluster list with this fresh output, excluding any slug already in the processed set.

---

#### 4d. If Dismiss was selected

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-cluster-parent "{impliedParent}"
```

Add `{impliedParent}` to the processed set and continue. (No refresh needed — no concept files were created.)

#### 4e. If Skip was selected

Add `{impliedParent}` to the processed set and continue. (No refresh needed — no concept files were created.)

#### 4f. If "stop"

Exit the loop and proceed to step 5.

---

### 5. Print summary

```
Knowledge Wiki Cluster

Auto-dismissed {N} cluster(s) (meaningless prefix):
  - [{impliedParent}]

Created {N} concept(s):
  - {impliedParent} — {Display Name}
      Folded {Nf} child(ren): {child-slug}, {child-slug}, ...
      Not folded {Nn} child(ren): {child-slug}, {child-slug}, ...

Dismissed {N} cluster(s):
  - [{impliedParent}]

Skipped {N} cluster(s).
[Omit any section with 0 items.]
```
