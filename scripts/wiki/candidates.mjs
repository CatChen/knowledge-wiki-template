/**
 * Candidate queues for judgment-driven wiki workflows.
 *
 * Usage:
 *   node scripts/wiki/candidates.mjs find-shared-source-concepts
 *   node scripts/wiki/candidates.mjs find-implied-parent-concepts
 *   node scripts/wiki/candidates.mjs find-thin-concepts
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { CONCEPTS_DIR, KNOWLEDGE_DIR } from './lib/paths.mjs';
import { buildWikiGraph, extractBody } from './lib/graph.mjs';
import { isPairDismissed, readState } from './lib/state-store.mjs';

export function findSharedSourceConcepts() {
  const state = readState();
  const { allFiles, links } = buildWikiGraph(KNOWLEDGE_DIR);
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
      const a = concepts[i], b = concepts[j];
      if (isPairDismissed(state, 'knowledge-wiki-merge', a, b)) continue;
      const setA = new Set(conceptSources[a]);
      const shared = conceptSources[b].filter((source) => setA.has(source));
      if (shared.length >= 2) candidates.push({ conceptA: a, conceptB: b, sharedSources: shared });
    }
  }
  candidates.sort((a, b) => b.sharedSources.length - a.sharedSources.length);
  return { candidates };
}

export function findImpliedParentConcepts() {
  const state = readState();
  if (!fs.existsSync(CONCEPTS_DIR)) return { clusters: [] };

  function isClusterPairDismissed(parentSlug, childSlug) {
    return isPairDismissed(
      state,
      'knowledge-wiki-cluster',
      `Wiki/Concepts/${parentSlug}.md`,
      `Wiki/Concepts/${childSlug}.md`,
    );
  }

  const slugs = fs.readdirSync(CONCEPTS_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.slice(0, -3))
    .sort();
  const slugSet = new Set(slugs);
  const groups = Object.create(null);
  const existingParentGroups = Object.create(null);

  for (const slug of slugs) {
    const parts = slug.split('-');
    if (parts.length < 2) continue;
    for (let len = parts.length - 1; len >= 1; len--) {
      const prefix = parts.slice(0, len).join('-');
      if (slugSet.has(prefix)) {
        if (!isClusterPairDismissed(prefix, slug)) {
          if (!existingParentGroups[prefix]) existingParentGroups[prefix] = [];
          existingParentGroups[prefix].push(`Wiki/Concepts/${slug}.md`);
        }
        break;
      }
      if (!isClusterPairDismissed(prefix, slug)) {
        if (!groups[prefix]) groups[prefix] = [];
        groups[prefix].push(`Wiki/Concepts/${slug}.md`);
      }
    }
  }

  const newParentClusters = Object.entries(groups)
    .filter(([, children]) => children.length >= 2)
    .map(([impliedParent, children]) => ({ impliedParent, children: children.sort(), parentExists: false }));

  const existingParentClusters = Object.entries(existingParentGroups)
    .filter(([, children]) => children.length >= 1)
    .map(([impliedParent, children]) => ({ impliedParent, children: children.sort(), parentExists: true }));

  const clusters = [...newParentClusters, ...existingParentClusters].sort((a, b) => {
    const depthDiff = b.impliedParent.split('-').length - a.impliedParent.split('-').length;
    return depthDiff !== 0 ? depthDiff : b.children.length - a.children.length;
  });

  return { clusters };
}

export function findThinConcepts() {
  const WORD_THRESHOLD = 150;
  const SOURCE_THRESHOLD = 2;
  function countWords(body) {
    return body.split(/\s+/).filter((word) => /^[a-zA-Z]+$/.test(word)).length;
  }
  function countSources(body) {
    return body.split('\n').filter((line) => /^\s*-\s*\[\[Wiki\/Summaries\//.test(line)).length;
  }
  if (!fs.existsSync(CONCEPTS_DIR)) return { concepts: [] };
  const concepts = [];
  for (const entry of fs.readdirSync(CONCEPTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const fullPath = path.join(CONCEPTS_DIR, entry.name);
    const body = extractBody(fs.readFileSync(fullPath, 'utf8'));
    const wordCount = countWords(body);
    const sources = countSources(body);
    if (wordCount < WORD_THRESHOLD && sources <= SOURCE_THRESHOLD) {
      concepts.push({ _path: `Wiki/Concepts/${entry.name}`, _score: wordCount });
    }
  }
  concepts.sort((a, b) => a._score - b._score);
  return { concepts: concepts.map((concept) => concept._path) };
}

export const COMMANDS = {
  'find-shared-source-concepts': findSharedSourceConcepts,
  'find-implied-parent-concepts': findImpliedParentConcepts,
  'find-thin-concepts': findThinConcepts,
};

export function runCandidateCommand(subcommand) {
  const fn = COMMANDS[subcommand];
  if (!fn) return false;
  console.log(JSON.stringify(fn(), null, 2));
  return true;
}

function main() {
  const subcommand = process.argv[2];
  if (!subcommand || subcommand === '--help') {
    console.error('Usage: node scripts/wiki/candidates.mjs <subcommand>');
    console.error('Subcommands: ' + Object.keys(COMMANDS).join(', '));
    process.exit(1);
  }
  if (!runCandidateCommand(subcommand)) {
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Subcommands: ' + Object.keys(COMMANDS).join(', '));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
