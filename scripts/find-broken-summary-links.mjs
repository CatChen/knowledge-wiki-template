/**
 * find-broken-summary-links.mjs
 *
 * Finds wikilinks from summary files to concept files that do not exist on disk.
 * Groups results by the missing concept file so the caller knows which summary
 * files to read when creating each missing concept.
 *
 * Output: object keyed by missing concept file path (relative to KNOWLEDGE_DIR).
 * {
 *   "Wiki/Concepts/missing-slug.md": {
 *     "referencedBy": ["Wiki/Summaries/Posts/foo.summary.md", ...]
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
  if (link.fromType !== 'summary') continue;
  if (link.toType !== 'concept') continue;
  if (allFiles.has(link.to)) continue; // link is valid

  if (!result[link.to]) {
    result[link.to] = { referencedBy: [] };
  }
  if (!result[link.to].referencedBy.includes(link.from)) {
    result[link.to].referencedBy.push(link.from);
  }
}

console.log(JSON.stringify(result, null, 2));
