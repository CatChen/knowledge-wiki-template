/**
 * find-duplicate-concept-candidates.mjs
 *
 * Structural duplicate detection: finds pairs of concept files that share two
 * or more entries in their ## Sources sections. Shared sources suggest the
 * concepts draw from the same material and may overlap.
 *
 * Uses the shared wiki graph to avoid re-reading concept files. Filters out
 * pairs already dismissed in Wiki/.state.json under
 * knowledge-wiki-merge.dismissedPairs. Dismissed pairs are stored as full
 * relative paths (e.g. "Wiki/Concepts/foo.md"), sorted alphabetically, so
 * [a,b] and [b,a] are treated as identical.
 *
 * Output:
 * {
 *   "candidates": [
 *     {
 *       "conceptA": "Wiki/Concepts/foo.md",
 *       "conceptB": "Wiki/Concepts/bar.md",
 *       "sharedSources": ["Wiki/Summaries/...", ...]
 *     },
 *     ...
 *   ]
 * }
 * Sorted by sharedSources.length descending.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWikiGraph } from './wiki-graph-lib.mjs';

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(KNOWLEDGE_DIR, 'Wiki', '.state.json');

// Load dismissed pairs and build a lookup set keyed by "slugA|slugB" (sorted)
const state = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  : {};
const dismissedSet = new Set(
  (state['knowledge-wiki-merge']?.dismissedPairs ?? [])
    .map(([a, b]) => [a, b].sort().join('|'))
);

function isDismissed(pathA, pathB) {
  return dismissedSet.has([pathA, pathB].sort().join('|'));
}

const { allFiles, links } = buildWikiGraph(KNOWLEDGE_DIR);

// Build concept → [source paths] map from graph links
const conceptSources = {};
for (const link of links) {
  if (link.fromType !== 'concept' || link.toType !== 'summary') continue;
  if (!allFiles.has(link.to)) continue;
  if (!conceptSources[link.from]) conceptSources[link.from] = [];
  conceptSources[link.from].push(link.to);
}

const concepts = Object.keys(conceptSources);
const candidates = [];

for (let i = 0; i < concepts.length; i++) {
  for (let j = i + 1; j < concepts.length; j++) {
    const a = concepts[i];
    const b = concepts[j];
    if (isDismissed(a, b)) continue;
    const setA = new Set(conceptSources[a]);
    const shared = conceptSources[b].filter(s => setA.has(s));
    if (shared.length >= 2) {
      candidates.push({ conceptA: a, conceptB: b, sharedSources: shared });
    }
  }
}

candidates.sort((a, b) => b.sharedSources.length - a.sharedSources.length);

console.log(JSON.stringify({ candidates }, null, 2));
