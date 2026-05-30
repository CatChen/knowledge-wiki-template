---
name: knowledge-wiki-cluster
description: 'Find groups of concepts that share a non-existing implied parent slug, and interactively create topic overview concepts to cover them. Each concept is grouped under its non-existing prefix ancestors up to its nearest existing ancestor — so apple-watch-ultra still forms an [apple-watch] cluster even when apple.md exists. Run after accumulating new concepts or when the wiki has clusters of narrowly-named sub-topics without a parent.'
---

# Knowledge Wiki Cluster

Detect clusters of concepts that share a non-existing implied parent slug, then interactively create topic overview concepts for them. Each concept is grouped under its non-existing prefix ancestors up to (but not including) its nearest existing ancestor — so `apple-watch-ultra` still forms an `[apple-watch]` cluster even when `apple.md` exists. Presents one cluster at a time — you decide whether to create the parent concept, dismiss (never show again), or skip.

## Steps

### 1. Establish the working directory

The knowledge base root is the Git repository root. Run `git rev-parse --show-toplevel` and store the result as `KNOWLEDGE_PATH`.

Use `KNOWLEDGE_PATH` for all subsequent steps.

### 2. Find clusters

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs missing-parent-clusters
```

This outputs `{ "clusters": [...] }` sorted **deepest first** (most hyphens in `impliedParent`), with ties broken by cluster size descending. Each entry has `impliedParent` (the slug that doesn't exist yet) and `children` (array of concept file paths, e.g. `Wiki/Concepts/audi-etron.md`). Previously dismissed clusters are already filtered out. Each concept is grouped under its non-existing prefix ancestors up to (but not including) its nearest existing ancestor — for example, `apple-watch-ultra` appears in `[apple-watch]` even when `apple.md` exists, because `apple-watch` itself is still missing.

The deepest-first ordering enables bottom-up creation: after creating a deeper concept (e.g. `overwatch-2`), a refresh surfaces it as a new child inside the shallower cluster (e.g. `[overwatch]`).

Derive each child's slug by taking the basename of its path without the `.md` extension (e.g. `Wiki/Concepts/audi-etron.md` → `audi-etron`). Use this derived slug wherever `{child-slug}` appears in subsequent steps.

If the `clusters` array is empty, print `No clusters found.` and stop.

### 3. LLM pre-filter

Before presenting clusters to the user, review the list and auto-dismiss clusters where the implied parent is a common English modifier rather than a meaningful proper noun or specific topic — e.g. `smart` grouping `smart-home` with `smart-money`, or `the` grouping `the-economist` with `the-expanse`. Children spanning clearly unrelated domains (finance + games, policy + hardware) are a reliable signal for auto-dismissal.

For each auto-dismissed cluster, call:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-cluster-parent "{impliedParent}"
```

Be conservative: dismiss only clusters you are confident are meaningless. A wrongly dismissed cluster is hidden from all future runs and requires manually editing `Wiki/.state.json` to recover.

### 4. Present and resolve each cluster

Process one cluster at a time. Use a **separate interaction for each cluster** — never combine multiple clusters into a single question, even if you intend to recommend the same action for several in a row.

For each remaining cluster, work through the following sub-steps in order.

---

#### 4a. Read and summarize the cluster

Read all child concept files. Present a brief summary:

```
─────────────────────────────────────
Cluster: [{impliedParent}]  ({N} children)

  {child-slug} — {one-sentence description}
  {child-slug} — {one-sentence description}
  ...
─────────────────────────────────────
```

Derive a human-readable **Display Name** for the implied parent (e.g. `audi` → `Audi`, `apple-watch` → `Apple Watch`, `career` → `Career`).

Then write 1–2 sentences of reasoning visible to the user: explain what the children have in common, whether a parent concept would add meaningful value, and state your recommendation. Examples:
- *"All 6 children describe distinct Apple products and services — a parent concept would serve as a useful index linking them. Creating recommended."*
- *"Both children cover dream-related topics but are thin standalone concepts; it's unclear whether a* `Dream` *parent would add value beyond what the two articles already provide."*

#### 4b. Ask what to do

Before asking, assess whether creating the parent concept is strongly warranted. A cluster is **strongly recommended** when the implied parent is a clear brand, product line, or named topic, and has 3 or more children that obviously belong under it. A cluster is **not strongly recommended** when it has only 2 children, or when the children's connection feels tenuous after reading them.

**Never add "(Recommended)" to Dismiss or Skip** — not in the label, not anywhere. These options are always neutral.

**If the cluster is strongly recommended**, put `(Recommended)` in the Create label:

| # | Option | Description |
|---|--------|-------------|
| 1 | `Create "{Display Name}" (Recommended)` | Create a new topic overview concept and link all children to it |
| 2 | `Dismiss` | These don't belong together; never show this cluster again |
| 3 | `Skip` | Leave for now; show again next run |

**If the cluster is not strongly recommended**, omit `(Recommended)`:

| # | Option | Description |
|---|--------|-------------|
| 1 | `Create "{Display Name}"` | Create a new topic overview concept and link all children to it |
| 2 | `Dismiss` | These don't belong together; never show this cluster again |
| 3 | `Skip` | Leave for now; show again next run |

**If `AskUserQuestion` is available**, invoke it with these three options. **If unavailable** (e.g. Codex), print them as a numbered list and ask the user to reply with 1, 2, or 3 (or "stop" to halt all remaining clusters). Wait for a reply before proceeding.

Users may type "stop" in the Other field (or reply "stop") to halt processing of remaining clusters.

---

#### 4c. If Create was selected

1. **Create the concept file:**

   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs create "{impliedParent}" "{Display Name}"
   ```

   This creates `Wiki/Concepts/{impliedParent}.md`. The command prints the file path.

2. **Write the article body:** Read the file, then edit it to insert a 1–3 paragraph topic overview between `# {Display Name}` and `## Sources`. Write it as a factual reference — what this brand, product line, or topic is, and what the sub-concepts cover. This is a topic index, not an analytical synthesis; keep it factual and concise. Use American English spelling. For `tags: []`, draw on the union of tags already present across the child concept files as a starting point — keep only those that genuinely describe the parent topic itself, not tags that are specific to one child's narrow scope.

3. **Link children as Connected Concepts** (idempotent):

   For each child concept, derive its display name from the `# Title` line of its concept file. Then run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{impliedParent}" "{child-slug}" "{child display name from # Title}"
   ```

4. **Back-link children to the new parent** (idempotent):

   For each child concept, run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{child-slug}" "{impliedParent}" "{Display Name}"
   ```

5. **Update the index:**

   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-concept "{impliedParent}" "{Display Name}" "{one-line English description}"
   ```

6. **Refresh the cluster list:** The newly created concept file may now appear as a child inside a shallower cluster (e.g. creating `overwatch-2` makes it a child of `[overwatch]`). Re-run:

   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs missing-parent-clusters
   ```

   Replace your working cluster list with this fresh output before continuing. Skip this refresh after Dismiss or Skip — no files changed, so the list is still valid.

---

#### 4d. If Dismiss was selected

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-cluster-parent "{impliedParent}"
```

Continue to the next cluster.

#### 4e. If Skip was selected

Continue to the next cluster without recording anything.

#### 4f. If "stop"

Exit the loop immediately. Proceed to step 5.

---

### 5. Print summary

```
Knowledge Wiki Cluster

Auto-dismissed {N} cluster(s) (meaningless prefix):
  - [{impliedParent}]

Created {N} concept(s):
  - {impliedParent} — {Display Name}  ({N} children linked)

Dismissed {N} cluster(s):
  - [{impliedParent}]

Skipped {N} cluster(s).
[Omit any section with 0 items.]
```
