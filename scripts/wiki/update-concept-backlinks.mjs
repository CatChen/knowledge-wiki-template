/**
 * update-concept-backlinks.mjs
 *
 * After merging two concepts, updates all wiki files that link to the secondary
 * concept. For each line containing the secondary wikilink:
 *   - If the primary concept already appears in the same Markdown list block:
 *     delete the secondary link line (replacing would create a duplicate).
 *   - Otherwise: replace the secondary wikilink with the primary wikilink.
 *
 * A "Markdown list block" is a contiguous sequence of lines whose content
 * starts with "- " or "* " (a single list with no intervening blank lines or
 * headings). The same-list check is scoped to the block containing the
 * secondary link line, so a primary link in a different section does not
 * suppress replacement.
 *
 * Usage:
 *   node update-concept-backlinks.mjs <secondary-path> <primary-path> <primary-display-name>
 *
 * Example:
 *   node update-concept-backlinks.mjs \
 *     Wiki/Concepts/podcast-publishing.md \
 *     Wiki/Concepts/podcast.md \
 *     "Podcast"
 *
 * Output: JSON object { updated: N, files: [...] }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWikiGraph } from './wiki-graph-lib.mjs';

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const [secondaryPath, primaryPath, primaryDisplayName] = process.argv.slice(2);
if (!secondaryPath || !primaryPath || !primaryDisplayName) {
  console.error('Usage: node update-concept-backlinks.mjs <secondary-path> <primary-path> <primary-display-name>');
  process.exit(1);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const secondaryPrefix = secondaryPath.replace(/\.md$/, '');
const primaryPrefix = primaryPath.replace(/\.md$/, '');
const secondaryLinkMarker = `[[${secondaryPrefix}`;
const replacementLink = `[[${primaryPrefix}|${primaryDisplayName}]]`;

/** Returns true if a line contains a wikilink to the primary concept.
 *  Checks for [[prefix|...]] and [[prefix]] to avoid false-matching slugs
 *  that share a common prefix (e.g. "podcast" matching "podcast-publishing"). */
function hasPrimaryLink(line) {
  return line.includes(`[[${primaryPrefix}|`) || line.includes(`[[${primaryPrefix}]]`);
}

const secondaryLinkRe = new RegExp(
  `\\[\\[${escapeRegex(secondaryPrefix)}(?:\\|[^\\]]+)?\\]\\]`,
);

/** Returns the range [start, end] (inclusive) of the contiguous list block
 *  that contains lines[index]. A list line is one whose trimmed content
 *  starts with "- " or "* ". */
function listBlockAround(lines, index) {
  let start = index;
  let end = index;
  while (start > 0 && /^\s*[-*] /.test(lines[start - 1])) start--;
  while (end < lines.length - 1 && /^\s*[-*] /.test(lines[end + 1])) end++;
  return { start, end };
}

// Find all wiki files that link to the secondary concept
const { links } = buildWikiGraph(KNOWLEDGE_DIR);
const backlinkFiles = [...new Set(
  links.filter(l => l.to === secondaryPath).map(l => l.from)
)].sort();

const updatedFiles = [];

for (const fromRel of backlinkFiles) {
  const fullPath = path.join(KNOWLEDGE_DIR, fromRel);
  const original = fs.readFileSync(fullPath, 'utf8');
  const lines = original.split('\n');
  const result = lines.map((line, i) => {
    if (!secondaryLinkRe.test(line)) return line;

    const { start, end } = listBlockAround(lines, i);
    const block = lines.slice(start, end + 1);
    const primaryInSameList = block.some(hasPrimaryLink);

    if (primaryInSameList) {
      return null; // mark for deletion
    }
    return line.replace(secondaryLinkRe, replacementLink);
  });

  const updated = result.filter(l => l !== null).join('\n');
  if (updated !== original) {
    fs.writeFileSync(fullPath, updated, 'utf8');
    updatedFiles.push(fromRel);
  }
}

console.log(JSON.stringify({ updated: updatedFiles.length, files: updatedFiles }, null, 2));
