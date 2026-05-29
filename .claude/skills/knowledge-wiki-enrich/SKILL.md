---
name: knowledge-wiki-enrich
description: 'Expand thin concept articles in the knowledge wiki using web search. Targets concepts with minimal prose assembled from few sources and supplements them with authoritative external information. Run after accumulating new concepts or when articles feel sparse.'
---

# Knowledge Wiki Enrich

Find concept articles that are thin relative to their source material and expand them using web search. Each article is supplemented with authoritative external information integrated naturally into the existing prose.

## Steps

### 1. Establish the working directory

The knowledge base root is the nearest ancestor directory that contains both a `Wiki/` subdirectory and a `Posts/` subdirectory. You can confirm it with `git rev-parse --show-toplevel`. Store the result as `KNOWLEDGE_PATH`.

Use `KNOWLEDGE_PATH` for all subsequent steps.

### 2. Find thin concepts

Run:

```bash
node {KNOWLEDGE_PATH}/scripts/wiki/wiki-lint.mjs thin-concepts
```

Output is `{ "concepts": [...] }` — an array of concept file paths sorted by word count ascending, so the thinnest concepts come first. A concept is thin if it has fewer than 150 words in its body AND at most 2 entries in its `## Sources` section.

If the array is empty, print `No thin concepts found.` and stop.

### 3. Expand each thin concept

For each path in the `concepts` array:

1. Read the concept file. Note the display name from its `# Title` line, and derive the slug (basename without `.md`).
2. Use the WebSearch tool to search for the concept name. Choose 1–2 queries that would find authoritative reference material.
3. Fetch or read the most relevant search results.
4. Integrate new information into the article body: extend existing paragraphs or add new ones. Do not add content that contradicts existing text — flag contradictions in the print summary instead.
5. Write the updated file back to disk.
6. Derive a fresh one-line English description from the enriched article. Run:
   ```bash
   node {KNOWLEDGE_PATH}/scripts/wiki/wiki-index.mjs upsert-concept "{slug}" "{display name from step 1}" "{fresh one-line description}"
   ```

Write in American English: use **-ize** not -ise (normalize, organize, recognise→recognize), **-or** not -our (color, behavior, honour→honor), **-er** not -re (center, theater). Do not modify frontmatter or the `## Sources` / `## Connected Concepts` sections.

### 4. Print summary

```
Knowledge Wiki Enrich

Expanded {N} concept(s):
  - {Display Name}
  - {Display Name}
  ...

Contradictions flagged:
  - {Display Name}: {brief description of conflict}
  [omit section if none]
```
