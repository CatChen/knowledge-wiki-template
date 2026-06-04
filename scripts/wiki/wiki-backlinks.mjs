/**
 * Graph-aware backlink mutations.
 *
 * After merging two concepts, `update-after-merge` updates all wiki files that
 * link to the secondary concept. For each line containing the secondary
 * wikilink:
 *   - If the file being updated IS the primary concept file:
 *     - Connected Concepts bullet lines are deleted, because replacing them
 *       would create a self-link.
 *     - Other lines, including body bullets and prose, rewrite the secondary
 *       wikilink to plain text so it will not be broken after the secondary
 *       file is deleted.
 *   - If the primary concept already appears in the same Markdown list block,
 *     the secondary link line is deleted instead of creating a duplicate.
 *   - Otherwise, the secondary wikilink is replaced with the primary wikilink.
 *
 * A Markdown list block is a contiguous sequence of lines whose content starts
 * with "- " or "* ". The same-list check is scoped to the block containing the
 * secondary link line, so a primary link in a different section does not
 * suppress replacement.
 *
 * Wikilink matching is prefix-safe: a concept such as `podcast` does not match
 * `podcast-publishing`.
 *
 * Usage:
 *   node scripts/wiki/wiki-backlinks.mjs update-after-merge <secondary-path> <primary-path> <primary-display-name>
 *
 * Example:
 *   node scripts/wiki/wiki-backlinks.mjs update-after-merge \
 *     Wiki/Concepts/podcast-publishing.md \
 *     Wiki/Concepts/podcast.md \
 *     "Podcast"
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { buildWikiGraph } from './lib/graph.mjs';
import { KNOWLEDGE_DIR } from './lib/paths.mjs';
import { getSectionRange } from './lib/sections.mjs';
import {
  conceptLinkRegex,
  lineHasConceptLink,
  listBlockAround,
} from './lib/markdown-lines.mjs';

export function updateAfterMerge(secondaryPath, primaryPath, primaryDisplayName) {
  const secondaryPrefix = secondaryPath.replace(/\.md$/, '');
  const primaryPrefix = primaryPath.replace(/\.md$/, '');
  const replacementLink = `[[${primaryPrefix}|${primaryDisplayName}]]`;
  const secondaryLinkRe = conceptLinkRegex(secondaryPrefix);

  const { links } = buildWikiGraph(KNOWLEDGE_DIR);
  const backlinkFiles = [...new Set(
    links.filter((link) => link.to === secondaryPath).map((link) => link.from),
  )].sort();

  const updatedFiles = [];

  for (const fromRel of backlinkFiles) {
    const fullPath = path.join(KNOWLEDGE_DIR, fromRel);
    const original = fs.readFileSync(fullPath, 'utf8');
    const lines = original.split('\n');
    const isPrimaryFile = fromRel === primaryPath;
    const connectedConceptsRange = getSectionRange(original, 'Connected Concepts');
    const secondarySlug = secondaryPrefix.split('/').pop();

    const result = lines.map((line, i) => {
      secondaryLinkRe.lastIndex = 0;
      if (!secondaryLinkRe.test(line)) return line;

      if (isPrimaryFile) {
        const inConnectedConcepts = connectedConceptsRange !== null &&
          i > connectedConceptsRange.start &&
          i < connectedConceptsRange.end;
        if (inConnectedConcepts && /^\s*[-*]\s/.test(line)) return null;
        secondaryLinkRe.lastIndex = 0;
        return line.replace(secondaryLinkRe, (_, displayName) => displayName ?? secondarySlug);
      }

      const isListItem = /^\s*[-*]\s/.test(line);
      const { start, end } = listBlockAround(lines, i);
      const block = lines.slice(start, end + 1);
      const primaryInSameList = block.some((blockLine) => lineHasConceptLink(blockLine, primaryPrefix));

      if (isListItem && primaryInSameList) return null;
      secondaryLinkRe.lastIndex = 0;
      return line.replace(secondaryLinkRe, replacementLink);
    });

    const updated = result.filter((line) => line !== null).join('\n');
    if (updated !== original) {
      fs.writeFileSync(fullPath, updated, 'utf8');
      updatedFiles.push(fromRel);
    }
  }

  return { updated: updatedFiles.length, files: updatedFiles };
}

export function runUpdateAfterMerge(args) {
  const [secondaryPath, primaryPath, primaryDisplayName] = args;
  if (!secondaryPath || !primaryPath || !primaryDisplayName) {
    console.error('Usage: node scripts/wiki/wiki-backlinks.mjs update-after-merge <secondary-path> <primary-path> <primary-display-name>');
    process.exit(1);
  }
  updateAfterMerge(secondaryPath, primaryPath, primaryDisplayName);
}

function main() {
  const [subcommand, ...args] = process.argv.slice(2);
  if (subcommand === 'update-after-merge') {
    runUpdateAfterMerge(args);
    return;
  }
  console.error(`Unknown subcommand: ${subcommand ?? '(none)'}`);
  console.error('Subcommands: update-after-merge');
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
