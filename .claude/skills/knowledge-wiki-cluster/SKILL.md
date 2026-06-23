---
name: knowledge-wiki-cluster
description: 'Find groups of concepts that share an implied parent slug and handle them: if the parent does not exist, create it; if it already exists, link unconnected children to it. For each child, fold (merge content into parent and delete child), link (keep as standalone, linked to parent), or merge into a sibling that already covers its content. Net result: fewer total concepts and a fully linked hierarchy. Run after accumulating new concepts or when the wiki has clusters of narrowly-named sub-concepts without a parent.'
---

# Knowledge Wiki Cluster

Detect clusters of concepts that share an implied parent slug, then decide for each child whether to **fold** (merge content into parent and delete the child) or **link** (keep the child as a standalone concept linked to the parent). The goal is to reduce total concept count by absorbing thin, redundant, or retired sub-concepts into a parent article.

Two cluster types are handled:
- **New-parent** (`parentExists: false`): the implied parent concept does not exist yet — create it, then fold/link/merge children.
- **Existing-parent** (`parentExists: true`): the implied parent already exists and these children have not yet been dismissed — fold/link/merge each one.

For new-parent clusters, each concept is grouped under its non-existing prefix ancestors up to (but not including) its nearest existing ancestor — so `apple-watch-ultra` forms an `[apple-watch]` cluster when `apple-watch.md` is absent, even if `apple.md` exists. For existing-parent clusters, the concept is grouped directly at its nearest existing ancestor. Presents one cluster at a time with a batch recommendation — you confirm, override, or dismiss.

Within a cluster, children may also be merged into each other (**sibling merging**) before any folding into the parent. A child judged not worth folding into the parent — an **Anchor** — can absorb another child's content if that child — a **Fold-candidate** — is a strict subset of the Anchor's content. The absorbed Fold-candidate is merged into the Anchor and deleted; the Anchor is recommended to stay standalone and is not expected to be folded into the parent.

## Steps

### 1. Establish the working directory

The knowledge base root is the Git repository root. Run `git rev-parse --show-toplevel` and store the result as `KNOWLEDGE_PATH`.

### 2. Find clusters

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/candidates.mjs find-implied-parent-concepts
```

This outputs `{ "clusters": [...] }` sorted **deepest first** (most hyphens in `impliedParent`), with ties broken by cluster size descending. Both new-parent and existing-parent clusters are interleaved in this single ordering. Each entry has:
- `impliedParent` — the parent slug
- `children` — array of `{ path, dismissed }` objects, where `path` is the concept file path (e.g. `Wiki/Concepts/audi-etron.md`) and `dismissed` is `true` if this child was previously dismissed from this cluster pair, `false` otherwise
- `parentExists` — `false` if the parent concept needs to be created; `true` if it already exists

A cluster appears only when it has at least the usual number of `dismissed: false` children (≥2 for new-parent, ≥1 for existing-parent). Previously dismissed children are included with `dismissed: true` as potential Anchor targets for sibling merges.

Derive each child's slug from its `path` field: `Wiki/Concepts/audi-etron.md` → `audi-etron`. Use this slug wherever `{child-slug}` appears below.

If the `clusters` array is empty, print `No clusters found.` and stop.

### 3. LLM pre-filter

For **new-parent clusters only** (`parentExists: false`), auto-dismiss clusters where the implied parent is a common English modifier rather than a meaningful proper noun or specific topic — e.g. `smart` grouping `smart-home` with `smart-money`, or `the` grouping `the-economist` with `the-expanse`. Children spanning clearly unrelated domains are a reliable signal for auto-dismissal. Skip this filter for existing-parent clusters — the parent's existence already confirms it is a real topic.

For each auto-dismissed cluster, run once per child:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-pair knowledge-wiki-cluster "Wiki/Concepts/{impliedParent}.md" "Wiki/Concepts/{child-slug}.md"
```

Be conservative — wrongly dismissed pairs require manually editing `Wiki/.state.json` to recover.

### 4. Present and resolve each cluster

Process one cluster at a time. Use a **separate interaction for each cluster** — never combine multiple clusters into a single question, even if you intend to recommend the same action for several in a row. When using `AskUserQuestion`, pass **exactly one question per call**. Never use the multi-question form to batch clusters.

Maintain an **in-memory processed set** of `impliedParent` slugs handled in this session. After creating a parent, exclude already-processed slugs from the refreshed cluster list.

---

#### 4a. Read, summarize, and assess

Determine the **Display Name** for the implied parent before presenting:
- If `parentExists` is `true`, read the parent concept file and take the Display Name from its H1 heading (`# …`). This preserves the exact capitalisation already in use (e.g. `ios` → "iOS", `macos` → "macOS").
- If `parentExists` is `false`, derive a human-readable name from the slug (e.g. `audi` → `Audi`, `apple-watch` → `Apple Watch`, `career` → `Career`).

Read every child concept file, then classify each one in two passes:

1. **Fold vs. Anchor.** `dismissed: true` children are **Anchors** automatically — the previous decision that they don't belong as primary children of this parent stands; no independent judgment needed. For `dismissed: false` children, independently judge each as a **Fold-candidate** (thin, narrow, or low-standalone-value — would fold into the parent) or an **Anchor** (substantive: rich prose, multiple sources, or broad cross-links — would stay standalone). This judgment must not depend on any other child in the cluster.
2. **Sibling merges.** For each `dismissed: false` Fold-candidate, check whether its content is a **strict subset** of any Anchor's content in the same cluster (whether that Anchor is `dismissed: true` or `dismissed: false`) — i.e. the Fold-candidate adds nothing the Anchor doesn't already cover, not merely "related" or "similar". If so, recommend **Merge into `{anchor-slug}`** instead of Fold. Anchors only absorb — an Anchor is recommended to stay standalone and is not expected to be folded or merged away.

Present a cluster summary as a 3-column table with each child's description and recommendation inline. Output the table as a **normal assistant message** (not in a code block) so it renders — this message must be sent **before** calling any interactive question tool:

---
**Cluster: {Display Name}  ({N} children, {existing parent | new parent})**

| Child | Description | Recommendation |
|-------|-------------|----------------|
| `{child-slug}` | {one-sentence description} | **Fold** — {reason} |
| `{child-slug}` | {one-sentence description} | **Link** — {reason} |
| `{child-slug}` *(dismissed)* | {one-sentence description} | **Link** — previously dismissed; auto-classified as Anchor |
| `{child-slug}` | {one-sentence description} | **Merge into `{anchor-slug}`** — {reason: what subset of the anchor's content this duplicates} |

---

Then write 1–2 sentences of reasoning: what the children have in common, whether creating a parent would add meaningful value, and call out any proposed sibling merges.

#### 4b. Ask what to do

Use **"What would you like to do with the {Display Name} cluster?"** as the question text. **Never** put `(Recommended)` on Dismiss. The remaining guidance differs by cluster type:

**If `parentExists` is `false`** (new-parent cluster): Add `(Recommended)` to Proceed only when the cluster is a clear brand, product line, or named topic with 3+ children that obviously belong under it **and** at least one child is recommended for folding or merging into a sibling.

| # | Option | Description |
|---|--------|-------------|
| 1 | `Proceed` | Create "{Display Name}" and apply the recommendations above (fold, link, or merge into a sibling) |
| 2 | `Link all` | Create "{Display Name}" and link all children to it, keeping them standalone (overrides any sibling-merge recommendations) |
| 3 | `Fold all` | Create "{Display Name}" and fold every child into it (overrides any sibling-merge recommendations) |
| 4 | `Dismiss` | These don't belong together; never show this cluster again (no parent created) |

Users may also type `skip` (leave for now; show again next run), `review one by one` (create parent then decide each child individually), or `stop` (halt all remaining clusters) in the Other field.

**If `parentExists` is `true`** (existing-parent cluster): Add `(Recommended)` to Proceed when at least one child is recommended for folding or merging into a sibling.

| # | Option | Description |
|---|--------|-------------|
| 1 | `Proceed` | Ensure bidirectional links to "{Display Name}" and apply the recommendations above (fold, link, or merge into a sibling) |
| 2 | `Link all` | Link all children to "{Display Name}" but keep them standalone (overrides any sibling-merge recommendations) |
| 3 | `Fold all` | Link all children to "{Display Name}" and fold every child into it (overrides any sibling-merge recommendations) |
| 4 | `Dismiss` | The slug prefix is coincidental; never show this cluster again (no links created) |

Users may also type `skip` (leave for now; show again next run), `review one by one` (link to parent then decide each child individually), or `stop` (halt all remaining clusters) in the Other field.

When using an interactive question/options tool, keep the question text short: **"What would you like to do with the {Display Name} cluster?"** Do not cram the summary, reasoning, or option details into one long question line.

The user must still be able to see the full decision context while choosing: the cluster summary, recommendation reasoning, all four options, and the extra accepted inputs. This context may be in the tool's body/details area, or in an immediately preceding assistant message if that message remains expanded and visible while the dialog is open. If the available question tool cannot keep that context visible together with the options, do not use it for this prompt. Instead, render the summary, reasoning, numbered options, and reply instructions as one normal markdown message, then wait for the user's reply. Accept 1, 2, 3, or 4; also accept `skip`, `review one by one`, or `stop` to halt all remaining clusters.

---

#### 4c. Collecting and executing decisions

Do not create or edit any files until all decisions are collected. If `stop` is entered at any point during decision collection, proceed to section 4f without creating any files.

#### 4c.1 If Proceed

Record the 4a table recommendations as final decisions — Fold into the parent, Link (Anchor), or Merge into `{anchor-slug}` for each child. Proceed to **4c.5**.

#### 4c.2 If Link all

Record every `dismissed: false` child as Link (standalone), overriding any sibling-merge or fold recommendations. `dismissed: true` children are unaffected — they remain background Anchors. Proceed to **4c.5**.

#### 4c.3 If Fold all

Record every `dismissed: false` child as Fold into the parent, overriding any sibling-merge recommendations. `dismissed: true` children are never folded — they are Anchors by definition and remain standalone. Proceed to **4c.5**.

#### 4c.4 If Review one by one

Process sibling-merge candidates first, then remaining children.

For each Anchor that has one or more Fold-candidates recommended to merge into it (per the 4a table), present your reasoning, then ask:

When using an interactive question/options tool, keep the question text short: **"Merge {Fold-candidate display name(s)} into {Anchor display name}?"** Do not cram the recommendation, reasoning, or option details into one long question line.

The user must still be able to see the full decision context while choosing: the recommendation, reasoning, both options, and the `done`/`stop` instructions. This context may be in the tool's body/details area, or in an immediately preceding assistant message if that message remains expanded and visible while the dialog is open. If the available question tool cannot keep that context visible together with the options, do not use it for this prompt. Instead, render the recommendation, reasoning, numbered options, and reply instructions as one normal markdown message, then wait for the user's reply.

Use these options (add `(Recommended)` to whichever applies):

| # | Option | Description |
|---|--------|-------------|
| 1 | `Merge into "{Anchor display name}"` | Merge the listed child(ren)'s content into "{Anchor display name}", then delete them. "{Anchor display name}" stays standalone |
| 2 | `Decline` | Keep the listed child(ren) separate; each will be reviewed individually below |

Accept: `1` (Merge), `2` (Decline), `done` (proceed with decisions collected so far — unprocessed Anchors are treated as Decline and unprocessed remaining children are treated as Link), or `stop`.

If `stop` was entered, proceed to section 4f without creating any files.

If declined, each listed Fold-candidate falls back to individual review below.

For every remaining `dismissed: false` child — Fold-candidates not absorbed by an Anchor (via Decline or no Anchor match), and `dismissed: false` Anchors — process one at a time. (`dismissed: true` Anchors are not re-evaluated here; they only appear as sibling-merge targets in the Anchor-confirmation step above.) Present your recommendation and reasoning for that child, then ask:

When using an interactive question/options tool, keep the question text short: **"What should happen to {child-display-name}?"** Do not cram the recommendation, reasoning, or option details into one long question line.

The user must still be able to see the full decision context while choosing: the child recommendation, reasoning, both options, and the `done`/`stop` instructions. This context may be in the tool's body/details area, or in an immediately preceding assistant message if that message remains expanded and visible while the dialog is open. If the available question tool cannot keep that context visible together with the options, do not use it for this prompt. Instead, render the recommendation, reasoning, numbered options, and reply instructions as one normal markdown message, then wait for the user's reply.

Use these options (add `(Recommended)` to whichever applies):

| # | Option | Description |
|---|--------|-------------|
| 1 | `Fold "{child-display-name}" into "{Display Name}"` | Merge child's content into parent, then delete child |
| 2 | `Link "{child-display-name}"` | Keep child standalone; will be linked to parent |

Accept: `1` (Fold), `2` (Link), `done` (proceed with decisions collected so far — unprocessed children will be treated as Link), or `stop`.

If `stop` was entered, proceed to section 4f without creating any files.

#### 4c.5 After collecting decisions

If `parentExists` is `true`, the parent concept file already exists — skip ahead to **Execute sibling merges**.

If `parentExists` is `false` and at least one `dismissed: false` child has a final outcome of Fold or Link, create the parent concept:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs create "{impliedParent}" "{Display Name}" --type Synthesis --icon notepad
```

This creates `Wiki/Concepts/{impliedParent}.md`.

Read the file, then insert a 1–3 paragraph topic overview between `# {Display Name}` and `## Sources`. Write it as a factual reference — what this topic is and what sub-concepts exist under it. Keep it concise; each Fold will enrich the body incrementally. Use American English spelling. Update the existing `tags: []` field with the union of tags from the child files, keeping only those that genuinely describe the parent topic.

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-concept "{impliedParent}" "{Display Name}" "{one-line English description}"
```

**Execute sibling merges:**

For each child whose final outcome is Merge into `{anchor-slug}`, execute the `knowledge-wiki-merge` step 3c with this mapping:
- **primary** = anchor: slug `{anchor-slug}`, display name `{anchor-display-name}`, path `Wiki/Concepts/{anchor-slug}.md`
- **secondary** = child: slug `{child-slug}`, display name `{child-display-name}`, path `Wiki/Concepts/{child-slug}.md`

Run this before linking or folding — a merged-away child is deleted and must not be linked to the parent or folded into it.

**Link children bidirectionally (idempotent):**

For each `dismissed: false` child with final outcome Link, derive its display name from its H1 heading (`# …`). Run both commands — the first adds the child to the parent's Connected Concepts, the second adds the parent to the child's:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{impliedParent}" "{child-slug}" "{child-display-name}"
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{child-slug}" "{impliedParent}" "{Display Name}"
```

`dismissed: true` Anchors are never linked to the parent, even if they absorbed a sibling merge — the previous decision not to connect them stands.

**Record linked children:**

For each `dismissed: false` child where Link was chosen, record a dismissed pair so the child is not re-evaluated in future runs. (`dismissed: true` children already have a dismissed pair recorded — do not run this for them.) Run this after the link commands above succeed:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-pair knowledge-wiki-cluster "Wiki/Concepts/{impliedParent}.md" "Wiki/Concepts/{child-slug}.md"
```

**Execute folds:**

For each `dismissed: false` child where Fold was chosen, execute the `knowledge-wiki-merge` step 3c with this mapping:
- **primary** = parent: slug `{impliedParent}`, display name `{Display Name}`, path `Wiki/Concepts/{impliedParent}.md`
- **secondary** = child: slug `{child-slug}`, display name `{child-display-name}`, path `Wiki/Concepts/{child-slug}.md`

**Wrap up:**

This runs whether or not all children were processed. Add `{impliedParent}` to the in-memory processed set. Re-run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/candidates.mjs find-implied-parent-concepts
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

Merged {N} child(ren) into sibling(s):
  - {child-slug} → {anchor-slug}

Dismissed {N} cluster(s):
  - [{impliedParent}]

Skipped {N} cluster(s).
[Omit any section with 0 items.]
```
