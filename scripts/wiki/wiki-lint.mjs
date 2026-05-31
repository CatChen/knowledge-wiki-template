/**
 * wiki-lint.mjs
 *
 * Wiki health checks. Each subcommand is a read-only audit that outputs JSON.
 *
 * Usage:
 *   node scripts/wiki/wiki-lint.mjs <subcommand>
 *
 * Subcommands:
 *   broken-concept-links    Wikilinks inside concept files pointing to missing targets
 *   broken-summary-links    Wikilinks from summary files to missing concept files
 *   duplicate-concepts      Concept pairs sharing 2+ source summaries
 *   orphan-concepts         Concept files with no inbound wikilinks
 *   orphan-summaries        Summary files whose source document no longer exists
 *   thin-concepts           Concept files below word/source thresholds (expansion candidates)
 *   missing-parent-clusters Groups of 2+ concepts sharing a non-existing implied parent slug; each
 *                           concept is grouped under its non-existing prefix ancestors up to (but not
 *                           including) its nearest existing ancestor
 *   self-links              Concept files whose Connected Concepts section links to themselves
 *   duplicate-concept-links Summary files whose Key Concepts section links to the same concept more than once
 *   all                     Run all checks; output keyed by subcommand name
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildWikiGraph, extractBody } from './wiki-graph-lib.mjs';

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATE_FILE = path.join(KNOWLEDGE_DIR, 'Wiki', '.state.json');
const WIKI_SUMMARIES_DIR = path.join(KNOWLEDGE_DIR, 'Wiki', 'Summaries');
const CONCEPTS_DIR = path.join(KNOWLEDGE_DIR, 'Wiki', 'Concepts');

// ── helpers ──────────────────────────────────────────────────────────────────

function parseFrontmatterField(content, field) {
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const frontmatter = content.slice(4, end);
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function findSummaryFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) findSummaryFiles(fullPath, results);
    else if (entry.isFile() && entry.name.endsWith('.summary.md')) results.push(fullPath);
  }
  return results;
}

// ── subcommand implementations ────────────────────────────────────────────────

function brokenConceptLinks() {
  const { allFiles, links } = buildWikiGraph(KNOWLEDGE_DIR);
  const result = {};
  for (const link of links) {
    if (link.fromType !== 'concept') continue;
    if (allFiles.has(link.to)) continue;
    if (!result[link.from]) result[link.from] = { brokenLinks: [] };
    result[link.from].brokenLinks.push(link.rawTarget);
  }
  return result;
}

function brokenSummaryLinks() {
  const { allFiles, links } = buildWikiGraph(KNOWLEDGE_DIR);
  const result = {};
  for (const link of links) {
    if (link.fromType !== 'summary') continue;
    if (link.toType !== 'concept') continue;
    if (allFiles.has(link.to)) continue;
    if (!result[link.to]) result[link.to] = { referencedBy: [] };
    if (!result[link.to].referencedBy.includes(link.from)) result[link.to].referencedBy.push(link.from);
  }
  return result;
}

function duplicateConcepts() {
  const state = fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    : {};
  const dismissedSet = new Set(
    (state['knowledge-wiki-merge']?.dismissedPairs ?? [])
      .map(([a, b]) => [a, b].sort().join('|'))
  );
  function isDismissed(a, b) {
    return dismissedSet.has([a, b].sort().join('|'));
  }

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
      if (isDismissed(a, b)) continue;
      const setA = new Set(conceptSources[a]);
      const shared = conceptSources[b].filter(s => setA.has(s));
      if (shared.length >= 2) candidates.push({ conceptA: a, conceptB: b, sharedSources: shared });
    }
  }
  candidates.sort((a, b) => b.sharedSources.length - a.sharedSources.length);
  return { candidates };
}

function orphanConcepts() {
  const { inboundCounts } = buildWikiGraph(KNOWLEDGE_DIR);
  const result = {};
  for (const [relPath, count] of Object.entries(inboundCounts)) {
    if (count === 0) result[relPath] = {};
  }
  return result;
}

function orphanSummaries() {
  if (!fs.existsSync(WIKI_SUMMARIES_DIR)) return {};
  const summaryFiles = findSummaryFiles(WIKI_SUMMARIES_DIR);
  const result = {};
  for (const fullPath of summaryFiles) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const source = parseFrontmatterField(content, 'source');
    const summaryRel = path.relative(KNOWLEDGE_DIR, fullPath);
    if (!source) { result[summaryRel] = { source: null }; continue; }
    const sourcePath = path.join(KNOWLEDGE_DIR, source);
    if (!fs.existsSync(sourcePath)) result[summaryRel] = { source };
  }
  return result;
}

function thinConcepts() {
  const WORD_THRESHOLD = 150;
  const SOURCE_THRESHOLD = 2;
  function countWords(body) {
    return body.split(/\s+/).filter(w => /^[a-zA-Z]+$/.test(w)).length;
  }
  function countSources(body) {
    return body.split('\n').filter(line => /^\s*-\s*\[\[Wiki\/Summaries\//.test(line)).length;
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
      concepts.push({ _path: 'Wiki/Concepts/' + entry.name, _score: wordCount });
    }
  }
  concepts.sort((a, b) => a._score - b._score);
  return { concepts: concepts.map(c => c._path) };
}

function missingParentClusters() {
  const state = fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    : {};
  const dismissedSet = new Set(
    state['knowledge-wiki-cluster']?.dismissedParents ?? []
  );

  if (!fs.existsSync(CONCEPTS_DIR)) return { clusters: [] };

  const slugs = fs.readdirSync(CONCEPTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .sort();
  const slugSet = new Set(slugs);

  // Collect each slug under every non-existing prefix ancestor, stopping at
  // the first existing ancestor (deepest to shallowest). A slug may appear
  // in multiple groups at different depths.
  const groups = Object.create(null); // null prototype avoids __proto__/constructor collisions
  for (const slug of slugs) {
    const parts = slug.split('-');
    if (parts.length < 2) continue;
    for (let len = parts.length - 1; len >= 1; len--) {
      const prefix = parts.slice(0, len).join('-');
      if (slugSet.has(prefix)) break; // stop at deepest existing ancestor
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(`Wiki/Concepts/${slug}.md`);
    }
  }

  // Keep only groups with 2+ children that haven't been dismissed.
  const clusters = Object.entries(groups)
    .filter(([prefix, children]) => children.length >= 2 && !dismissedSet.has(prefix))
    .map(([impliedParent, children]) => ({ impliedParent, children: children.sort() }))
    // Deepest clusters first (most hyphens in impliedParent) so the skill builds
    // bottom-up: creating a deeper concept makes it a child in the next shallower
    // cluster after a refresh. Break ties by cluster size descending.
    .sort((a, b) => {
      const depthDiff = b.impliedParent.split('-').length - a.impliedParent.split('-').length;
      return depthDiff !== 0 ? depthDiff : b.children.length - a.children.length;
    });

  return { clusters };
}

function selfLinks() {
  if (!fs.existsSync(CONCEPTS_DIR)) return {};
  const result = {};
  for (const entry of fs.readdirSync(CONCEPTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const slug = entry.name.slice(0, -3);
    const content = fs.readFileSync(path.join(CONCEPTS_DIR, entry.name), 'utf8');
    // Only check within ## Connected Concepts — prose/source occurrences are not actionable.
    const lines = content.split('\n');
    let inCC = false;
    let found = false;
    const selfLinkMarker = `[[Wiki/Concepts/${slug}|`;
    const selfLinkExact  = `[[Wiki/Concepts/${slug}]]`;
    for (const line of lines) {
      if (line === '## Connected Concepts') { inCC = true; continue; }
      if (inCC && line.startsWith('## ')) break;
      // Only flag bullet lines — non-list lines are not actionable Connected
      // Concepts entries and delete-connected-concept would not remove them.
      if (inCC && /^\s*[-*]\s/.test(line) &&
          (line.includes(selfLinkMarker) || line.includes(selfLinkExact))) {
        found = true; break;
      }
    }
    if (found) result[`Wiki/Concepts/${entry.name}`] = {};
  }
  return result;
}

function duplicateConceptLinks() {
  if (!fs.existsSync(WIKI_SUMMARIES_DIR)) return {};
  const result = {};

  const conceptLinkRe = /\[\[Wiki\/Concepts\/([^\]|]+)(?:\|[^\]]+)?\]\]/g;

  function scanFile(fullPath, relPath) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    // Collect bullet lines in ## Key Concepts section only.
    let inKeyC = false;
    const conceptLines = Object.create(null); // conceptPath → [line, ...]

    for (const line of lines) {
      if (line === '## Key Concepts') { inKeyC = true; continue; }
      if (inKeyC && line.startsWith('## ')) break;
      // Only collect canonical bullet entries: "- [[Wiki/Concepts/...]]".
      // Prose or note lines that happen to mention a concept are not entries.
      const stripped = line.trimStart().replace(/^[-*]\s+/, '');
      if (!inKeyC || !/^[-*]\s/.test(line.trimStart()) || !stripped.startsWith('[[Wiki/Concepts/')) continue;

      // Only the leading wikilink is the entry target — secondary links in
      // descriptions are not concept entries and should not be counted.
      conceptLinkRe.lastIndex = 0;
      const match = conceptLinkRe.exec(stripped);
      if (!match) continue;
      const conceptPath = `Wiki/Concepts/${match[1]}.md`;
      if (!conceptLines[conceptPath]) conceptLines[conceptPath] = [];
      conceptLines[conceptPath].push(line.trim());
    }

    const duplicates = Object.entries(conceptLines)
      .filter(([, lines]) => lines.length > 1)
      .map(([conceptPath, lines]) => ({ conceptPath, lines }));

    if (duplicates.length > 0) result[relPath] = duplicates;
  }

  function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.summary.md')) {
        const relPath = path.relative(KNOWLEDGE_DIR, fullPath);
        scanFile(fullPath, relPath);
      }
    }
  }

  walkDir(WIKI_SUMMARIES_DIR);
  return result;
}

// ── dispatch ──────────────────────────────────────────────────────────────────

const COMMANDS = {
  'broken-concept-links': brokenConceptLinks,
  'broken-summary-links': brokenSummaryLinks,
  'duplicate-concepts': duplicateConcepts,
  'orphan-concepts': orphanConcepts,
  'orphan-summaries': orphanSummaries,
  'thin-concepts': thinConcepts,
  'missing-parent-clusters': missingParentClusters,
  'self-links': selfLinks,
  'duplicate-concept-links': duplicateConceptLinks,
};

const subcommand = process.argv[2];

if (!subcommand || subcommand === '--help') {
  console.error('Usage: node scripts/wiki/wiki-lint.mjs <subcommand>');
  console.error('Subcommands: ' + [...Object.keys(COMMANDS), 'all'].join(', '));
  process.exit(1);
}

if (subcommand === 'all') {
  const result = {};
  for (const [name, fn] of Object.entries(COMMANDS)) result[name] = fn();
  console.log(JSON.stringify(result, null, 2));
} else if (COMMANDS[subcommand]) {
  console.log(JSON.stringify(COMMANDS[subcommand](), null, 2));
} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  console.error('Subcommands: ' + [...Object.keys(COMMANDS), 'all'].join(', '));
  process.exit(1);
}
