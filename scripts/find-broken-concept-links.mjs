/**
 * find-broken-concept-links.mjs
 *
 * Finds wikilinks inside concept files that point to targets (concepts or
 * summaries) that do not exist on disk.
 *
 * Output: object keyed by the concept file that contains the broken link.
 * Each value's `brokenLinks` array contains the raw wikilink target strings
 * (without the surrounding [[ ]]) that resolve to missing files.
 * {
 *   "Wiki/Concepts/some-concept.md": {
 *     "brokenLinks": ["Wiki/Summaries/Posts/foo.summary", ...]
 *   },
 *   ...
 * }
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { buildWikiGraph } from './wiki-graph-lib.mjs';

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { allFiles, links } = buildWikiGraph(KNOWLEDGE_DIR);

const result = {};

for (const link of links) {
  if (link.fromType !== 'concept') continue;
  if (allFiles.has(link.to)) continue; // link is valid

  if (!result[link.from]) {
    result[link.from] = { brokenLinks: [] };
  }
  result[link.from].brokenLinks.push(link.rawTarget);
}

console.log(JSON.stringify(result, null, 2));
