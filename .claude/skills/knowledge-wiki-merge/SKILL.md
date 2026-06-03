---
name: knowledge-wiki-merge
description: 'Interactively find and merge duplicate concept files in the knowledge wiki. Presents candidate pairs one at a time and asks whether to merge, dismiss, or skip each one. Run after accumulating new concepts or when the wiki feels redundant.'
---

# Knowledge Wiki Merge

Detect duplicate concept pairs and interactively merge them. Presents one pair at a time — you decide whether to merge, dismiss (never show again), or skip. Merging is destructive and irreversible, so each decision is confirmed before execution.

## Steps

### 1. Establish the working directory

The knowledge base root is the Git repository root. Run `git rev-parse --show-toplevel` and store the result as `KNOWLEDGE_PATH`.

Use `KNOWLEDGE_PATH` for all subsequent steps.

### 2. Find and filter duplicate candidates

**Structural candidates** are pairs detected by shared source material — concept files that share two or more `## Sources` entries. Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs duplicate-concepts
```

This script automatically filters out previously dismissed pairs from `Wiki/.state.json`. Output is `{ "candidates": [...] }` sorted by shared source count descending. Tag each as `detection: "structural"`.

**LLM pre-filter (structural only):** Before proceeding, review the structural candidates and eliminate any pair that is clearly about different topics despite sharing sources — pairs where the shared sources happen to cover two unrelated ideas (e.g. `applescript` and `email-marketing` appearing in the same AppleScript email tutorial). For each eliminated pair, call:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-pair knowledge-wiki-merge {pathA} {pathB}
```

where `pathA` and `pathB` are the full relative paths (e.g. `Wiki/Concepts/applescript.md`). Be conservative: only dismiss pairs you are confident are unrelated. A wrongly auto-dismissed pair is hidden from all future runs and requires manually editing `Wiki/.state.json` to recover.

**Semantic candidates** are pairs identified by conceptual overlap — synonyms, one being a strict subset of the other, or articles that would naturally be merged — without necessarily sharing sources. Perform this pass by running:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs read-concepts
```

This outputs all concept entries with their one-line descriptions. Use your judgment to identify semantically overlapping pairs from this list. Tag each as `detection: "semantic"`. Pairs found by both structural and semantic methods are tagged `detection: "structural+semantic"`. Skip the LLM pre-filter for semantic candidates — they were already identified by LLM judgment.

If no candidates remain, print `No duplicate candidates found.` and stop.

### 3. Present and resolve each candidate

Process one candidate at a time. Use a **separate interaction for each pair** — never combine multiple pairs into a single question, even if you intend to recommend the same action for several in a row.

For each remaining candidate pair, work through the following sub-steps in order.

---

#### 3a. Summarize the pair

Read both concept files. Present a brief summary as a markdown table (not in a code block) so it renders:

---
**Candidate pair** (shared sources: {N}, detection: {structural | semantic | structural+semantic})

| Concept | Description |
|---------|-------------|
| **{Display Name A}** | {one-sentence description} |
| **{Display Name B}** | {one-sentence description} |

---

#### 3b. Determine recommended direction and ask what to do

Before asking, determine which concept should be the primary by applying these factors in order:

1. **Semantic scope** (primary factor): the broader or more general concept is the primary; the narrower or more specific concept merges into it
2. **Prose depth**: if scope is similar, more paragraphs → likely primary
3. **Source count**: if prose is similar, more sources → likely primary

Ask the user what to do using **exactly four options** as follows.

**Always include both merge directions.** Never drop one because you think it is obviously wrong — the user makes that call.

**Never add "(Recommended)" to Dismiss or Skip** — not in the label, not in the description, not anywhere. These options are always neutral.

**If a clear primary can be determined**, put `(Recommended)` after the recommended merge option and place it first:

| # | Option | Description |
|---|--------|-------------|
| 1 | `Merge {Secondary} → {Primary} (Recommended)` | `{Secondary}` is deleted; its content is merged into `{Primary}` |
| 2 | `Merge {Primary} → {Secondary}` | `{Primary}` is deleted; reverse direction |
| 3 | `Dismiss` | They are distinct; never show this pair again |
| 4 | `Skip` | Leave for now; show again next run |

**If no clear primary can be determined** (both concepts are similarly scoped, similarly long, and have similar source counts), state this explicitly. Do not add `(Recommended)` to any option:

| # | Option | Description |
|---|--------|-------------|
| 1 | `Merge {Display Name A} → {Display Name B}` | `{A}` is deleted; its content is merged into `{B}` |
| 2 | `Merge {Display Name B} → {Display Name A}` | `{B}` is deleted; its content is merged into `{A}` |
| 3 | `Dismiss` | They are distinct; never show this pair again |
| 4 | `Skip` | Leave for now; show again next run |

When using an interactive question/options tool, keep the question text short: **"What would you like to do with this candidate pair?"** Do not cram the summary, reasoning, or option details into one long question line.

The user must still be able to see the full decision context while choosing: the candidate summary, recommendation reasoning, all four options, and the `stop` instruction. This context may be in the tool's body/details area, or in an immediately preceding assistant message if that message remains expanded and visible while the dialog is open. If the available question tool cannot keep that context visible together with the options, do not use it for this prompt. Instead, render the summary, reasoning, numbered options, and reply instructions as one normal markdown message, then wait for the user's reply. Accept 1, 2, 3, or 4 (or "stop" to halt all remaining pairs).

#### 3c. If a Merge option was selected

State the direction explicitly before executing:

> **Primary:** {Display Name} (`{primary-path}`)
> **Secondary:** {Display Name} (`{secondary-path}`) — will be merged in and deleted

Then execute:

1. **Integrate prose**: Add any information from the secondary's body not already covered in the primary — extend existing paragraphs or add new ones. Write in the primary's established voice and style, using American English spelling (e.g. "organize" not "organise", "recognize" not "recognise"). Convert any British spellings from the secondary's text before integrating.

2. **Merge tags**: Take the union of the `tags` arrays from both concepts' frontmatter. Preserve the primary's existing tag order, then append any tags from the secondary that are not already present. If either concept's frontmatter omits the `tags` field entirely, treat it as an empty array. Use this combined list as the primary's new `tags` value.

3. **Write the primary file** back to disk with the integrated prose from step 1 and the merged tags from step 2 — Sources and Connected Concepts will be handled by the scripts below.

4. **Merge Sources**: For each `## Sources` entry in the secondary, extract the summary path (the content between `[[` and `]]`) and run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-source "{primary-slug}" "{summary-path}"
   ```
   The command is idempotent — entries already in the primary are skipped automatically.

5. **Merge Connected Concepts**: For each `## Connected Concepts` entry in the secondary, extract the linked slug and display name (from `[[Wiki/Concepts/{slug}|{Display Name}]]`), then run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-concept.mjs insert-connected-concept "{primary-slug}" "{linked-slug}" "{Display Name}"
   ```
   The command is idempotent — entries already in the primary are skipped automatically.

6. **Update backlinks**: Run:

   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/update-concept-backlinks.mjs {secondary-path} {primary-path} "{primary display name}"
   ```

   This finds every wiki file that links to the secondary concept and handles each one correctly: if the file already has a link to the primary, it removes the secondary link line to avoid creating a duplicate; otherwise it replaces the secondary wikilink with the primary.

7. **Delete the secondary file**:

   ```bash
   rm {KNOWLEDGE_PATH}/{secondary-path}
   ```

8. **Update the index**: Run:

   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs delete-concept "{secondary-slug}"
   ```

   If the primary's one-line description has changed meaningfully, also run:

   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-concept "{primary-slug}" "{primary display name}" "{updated one-line description}"
   ```

#### 3d. If Dismiss

Call:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-state.mjs dismiss-pair knowledge-wiki-merge {pathA} {pathB}
```

Continue to the next candidate.

#### 3e. If Skip

Continue to the next candidate without recording anything.

#### 3f. If "stop" (typed in Other field)

Exit the loop immediately. Proceed to step 4.

---

### 4. Print summary

```
Knowledge Wiki Merge

Auto-dismissed {N} pair(s) (clearly unrelated):
  - {Display Name A} / {Display Name B}

Merged {N} pair(s):
  - {Secondary Display Name} → {Primary Display Name}

Dismissed {N} pair(s):
  - {Display Name A} / {Display Name B}

Skipped {N} pair(s).
[Omit any section with 0 items.]
```
