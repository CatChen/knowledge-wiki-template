---
name: knowledge-wiki-cluster
description: 'Find groups of concepts that share an implied parent slug and handle them: if the parent does not exist, create it; if it already exists, link unconnected children to it. For each child, fold (merge content into parent and delete child) or skip (keep as standalone, linked to parent). Net result: fewer total concepts and a fully linked hierarchy. Run after accumulating new concepts or when the wiki has clusters of narrowly-named sub-concepts without a parent.'
---

# Knowledge Wiki Cluster

Detect clusters of concepts that share an implied parent slug, then decide for each child whether to **fold** (merge content into parent and delete the child) or **skip** (keep the child as a standalone concept linked to the parent). The goal is to reduce total concept count by absorbing thin, redundant, or retired sub-concepts into a parent article.

Two cluster types are handled:
- **New-parent** (`parentExists: false`): the implied parent concept does not exist yet — create it, then fold/skip children.
- **Existing-parent** (`parentExists: true`): the implied parent already exists and these children have not yet been dismissed — fold/skip each one.

For new-parent clusters, each concept is grouped under its non-existing prefix ancestors up to (but not including) its nearest existing ancestor — so `apple-watch-ultra` forms an `[apple-watch]` cluster when `apple-watch.md` is absent, even if `apple.md` exists. For existing-parent clusters, the concept is grouped directly at its nearest existing ancestor. Presents one cluster at a time with a batch fold/skip recommendation — you confirm, override, or dismiss.

## Steps

### 1. Establish the working directory

The knowledge base root is the Git repository root. Run `git rev-parse --show-toplevel` and store the result as `KNOWLEDGE_PATH`.

### 2. Find clusters

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs missing-parent-clusters
```

This outputs `{ "clusters": [...] }` sorted **deepest first** (most hyphens in `impliedParent`), with ties broken by cluster size descending. Both new-parent and existing-parent clusters are interleaved in this single ordering. Each entry has:
- `impliedParent` — the parent slug
- `children` — array of concept file paths (e.g. `Wiki/Concepts/audi-etron.md`)
- `parentExists` — `false` if the parent concept needs to be created; `true` if it already exists and these children have not yet been dismissed

Previously dismissed children are already filtered out.

Derive each child's slug from its filename: `Wiki/Concepts/audi-etron.md` → `audi-etron`. Use this slug wherever `{child-slug}` appears below.

If the `clusters` array is empty, print `No clusters found.` and stop.

### 3. LLM pre-filter

For **new-parent clusters only** (`parentExists: false`), auto-dismiss clusters where the implied parent is a common English modifier rather than a meaningful proper noun or specific topic — e.g. `smart` grouping `smart-home` with `smart-money`, or `the` grouping `the-economist` with `the-expanse`. Children spanning clearly unrelated domains are a reliable signal for auto-dismissal. Skip this filter for existing-parent clusters — the parent's existence already confirms it is a real topic.

For each auto-dismissed cluster, run once per child:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-pair knowledge-wiki-cluster "Wiki/Concepts/{impliedParent}.md" "Wiki/Concepts/{child-slug}.md"
```

Be conservative — wrongly dismissed pairs require manually editing `Wiki/.state.json` to recover.

### 4. Present and resolve each cluster

Process one cluster at a time. Use a **separate interaction for each cluster** — never combine multiple clusters into a single question.

Maintain an **in-memory processed set** of `impliedParent` slugs handled in this session. After creating a parent, exclude already-processed slugs from the refreshed cluster list.

---

#### 4a. Read, summarize, and assess

Determine the **Display Name** for the implied parent before presenting:
- If `parentExists` is `true`, read the parent concept file and take the Display Name from its H1 heading (`# …`). This preserves the exact capitalisation already in use (e.g. `ios` → "iOS", `macos` → "macOS").
- If `parentExists` is `false`, derive a human-readable name from the slug (e.g. `audi` → `Audi`, `apple-watch` → `Apple Watch`, `career` → `Career`).

Read every child concept file. Present a cluster summary as a 3-column table with each child's description and fold/skip recommendation inline. Output the table as markdown (not in a code block) so it renders:

---
**Cluster: {Display Name}  ({N} children, {existing parent | new parent})**

| Child | Description | Recommendation |
|-------|-------------|----------------|
| `{child-slug}` | {one-sentence description} | **Fold** — {reason} |
| `{child-slug}` | {one-sentence description} | **Skip** — {reason} |

---

Then write 1–2 sentences of reasoning: what the children have in common and whether creating a parent would add meaningful value.

Use these criteria — **Fold** for thin, narrow, or low-standalone-value concepts; **Skip** for substantive articles with rich prose, multiple sources, or broad cross-links.

#### 4b. Ask what to do

Use **"What would you like to do with the {Display Name} cluster?"** as the question text. **Never** put `(Recommended)` on Dismiss. The remaining guidance differs by cluster type:

**If `parentExists` is `false`** (new-parent cluster): Add `(Recommended)` to Proceed only when the cluster is a clear brand, product line, or named topic with 3+ children that obviously belong under it **and** at least one child is recommended for folding. If all children are Skip, the parent is still worth creating as an overview but is not strongly recommended.

| # | Option | Description |
|---|--------|-------------|
| 1 | `Proceed` | Create "{Display Name}" and apply the fold/skip recommendations above |
| 2 | `Link all` | Create "{Display Name}" and link all children to it, keeping them standalone |
| 3 | `Fold all` | Create "{Display Name}" and fold every child into it |
| 4 | `Dismiss` | These don't belong together; never show this cluster again (no parent created) |

Users may also type `skip` (leave for now; show again next run), `review one by one` (create parent then decide each child individually), or `stop` (halt all remaining clusters) in the Other field.

**If `parentExists` is `true`** (existing-parent cluster): Add `(Recommended)` to Proceed when at least one child is recommended for folding.

| # | Option | Description |
|---|--------|-------------|
| 1 | `Proceed` | Ensure bidirectional links to "{Display Name}" and apply the fold/skip recommendations above |
| 2 | `Link all` | Link all children to "{Display Name}" but keep them standalone |
| 3 | `Fold all` | Link all children to "{Display Name}" and fold every child into it |
| 4 | `Dismiss` | The slug prefix is coincidental; never show this cluster again (no links created) |

Users may also type `skip` (leave for now; show again next run), `review one by one` (link to parent then decide each child individually), or `stop` (halt all remaining clusters) in the Other field.

When using an interactive question/options tool, keep the question text short: **"What would you like to do with the {Display Name} cluster?"** Do not cram the summary, reasoning, or option details into one long question line.

The user must still be able to see the full decision context while choosing: the cluster summary, recommendation reasoning, all four options, and the extra accepted inputs. This context may be in the tool's body/details area, or in an immediately preceding assistant message if that message remains expanded and visible while the dialog is open. If the available question tool cannot keep that context visible together with the options, do not use it for this prompt. Instead, render the summary, reasoning, numbered options, and reply instructions as one normal markdown message, then wait for the user's reply. Accept 1, 2, 3, or 4; also accept `skip`, `review one by one`, or `stop` to halt all remaining clusters.

---

#### 4c. If Proceed, Link all, Fold all, or Review one by one was selected

Record decisions in memory based on the selection:
- **Proceed**: fold the children listed under Recommend Fold; skip the rest
- **Link all**: skip every child
- **Fold all**: fold every child
- **Review one by one**: ask about each child individually (see below), then proceed

Do not create or edit any files until all decisions are collected. If `stop` was entered at any point, proceed to section 4f without creating any files.

**Review one by one:** Process one child at a time. Present your recommendation and reasoning for that child, then ask:

When using an interactive question/options tool, keep the question text short: **"What should happen to {child-display-name}?"** Do not cram the recommendation, reasoning, or option details into one long question line.

The user must still be able to see the full decision context while choosing: the child recommendation, reasoning, both options, and the `done`/`stop` instructions. This context may be in the tool's body/details area, or in an immediately preceding assistant message if that message remains expanded and visible while the dialog is open. If the available question tool cannot keep that context visible together with the options, do not use it for this prompt. Instead, render the recommendation, reasoning, numbered options, and reply instructions as one normal markdown message, then wait for the user's reply.

Use these options (add `(Recommended)` to whichever applies):

| # | Option | Description |
|---|--------|-------------|
| 1 | `Fold "{child-display-name}" into "{Display Name}"` | Merge child's content into parent, then delete child |
| 2 | `Skip "{child-display-name}"` | Keep child standalone; will be linked to parent |

Accept: `1` (Fold), `2` (Skip), `done` (proceed with decisions collected so far — unprocessed children will be treated as Skip), or `stop`.

If `stop` was entered, proceed to section 4f without creating any files.

**After collecting all decisions, create and populate the parent concept:**

If `parentExists` is `true`, the parent concept file already exists — skip ahead to **Link all children bidirectionally**.

If `parentExists` is `false`, run these steps:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs create "{impliedParent}" "{Display Name}" --type Synthesis --icon notepad
```

This creates `Wiki/Concepts/{impliedParent}.md`.

Read the file, then insert a 1–3 paragraph topic overview between `# {Display Name}` and `## Sources`. Write it as a factual reference — what this topic is and what sub-concepts exist under it. Keep it concise; each Fold will enrich the body incrementally. Use American English spelling. Update the existing `tags: []` field with the union of tags from the child files, keeping only those that genuinely describe the parent topic.

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-concept "{impliedParent}" "{Display Name}" "{one-line English description}"
```

**Link all children bidirectionally (idempotent):**

For each child, derive its display name from its H1 heading (`# …`). Run both commands — the first adds the child to the parent's Connected Concepts, the second adds the parent to the child's:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{impliedParent}" "{child-slug}" "{child-display-name}"
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{child-slug}" "{impliedParent}" "{Display Name}"
```

Run this for every child regardless of fold/skip decision.

**Record skipped children:**

For each child where Skip was chosen, record a dismissed pair so the child is not re-evaluated in future runs. Run this after the link commands above succeed:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-pair knowledge-wiki-cluster "Wiki/Concepts/{impliedParent}.md" "Wiki/Concepts/{child-slug}.md"
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

#### 4d. If Dismiss or "skip" was selected

**If Dismiss:** run `dismiss-pair` once per child so each individual relationship is suppressed rather than the whole parent slug:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-pair knowledge-wiki-cluster "Wiki/Concepts/{impliedParent}.md" "Wiki/Concepts/{child-slug}.md"
```

If new children appear under the same parent later, they will resurface — only the specific children dismissed here are suppressed.

**If "skip"** (leave for now; show again next run): make no state changes. Simply add `{impliedParent}` to the in-memory processed set for this session so it is not presented again during the current run.

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
