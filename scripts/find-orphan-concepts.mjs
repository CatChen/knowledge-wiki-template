/**
 * find-orphan-concepts.mjs
 *
 * Finds concept files that have no inbound wikilinks from any other file in
 * Wiki/Concepts/ or Wiki/Summaries/.
 *
 * Output: object keyed by orphan concept file path (relative to KNOWLEDGE_DIR).
 * {
 *   "Wiki/Concepts/orphan-concept.md": {}
 * }
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { buildWikiGraph } from './wiki-graph-lib.mjs';

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { inboundCounts } = buildWikiGraph(KNOWLEDGE_DIR);

const result = {};
for (const [relPath, count] of Object.entries(inboundCounts)) {
  if (count === 0) result[relPath] = {};
}

console.log(JSON.stringify(result, null, 2));
