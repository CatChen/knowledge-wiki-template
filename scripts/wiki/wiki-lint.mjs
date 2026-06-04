/**
 * Wiki integrity checks. Each canonical subcommand is a read-only audit that
 * outputs JSON and starts with find-*.
 *
 * Usage:
 *   node scripts/wiki/wiki-lint.mjs <subcommand>
 */

import fs from 'fs';
import path from 'path';
import { buildWikiGraph } from './lib/graph.mjs';
import { parseFrontmatterField, parseLooseFrontmatterField } from './lib/frontmatter.mjs';
import { CONCEPTS_DIR, KNOWLEDGE_DIR, SUMMARIES_DIR, relToKnowledge } from './lib/paths.mjs';
import { getBulletsFromSection } from './lib/sections.mjs';

function findSummaryFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) findSummaryFiles(fullPath, results);
    else if (entry.isFile() && entry.name.endsWith('.summary.md')) results.push(fullPath);
  }
  return results;
}

export function findBrokenConceptLinks() {
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

export function findBrokenSummaryLinks() {
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

export function findOrphanConcepts() {
  const { inboundCounts } = buildWikiGraph(KNOWLEDGE_DIR);
  const result = {};
  for (const [relPath, count] of Object.entries(inboundCounts)) {
    if (count === 0) result[relPath] = {};
  }
  return result;
}

export function findOrphanSummaries() {
  const result = {};
  for (const fullPath of findSummaryFiles(SUMMARIES_DIR)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const source = parseFrontmatterField(content, 'source');
    const summaryRel = relToKnowledge(fullPath);
    if (!source) {
      result[summaryRel] = { source: null };
      continue;
    }
    const sourcePath = path.join(KNOWLEDGE_DIR, source);
    if (!fs.existsSync(sourcePath)) result[summaryRel] = { source };
  }
  return result;
}

export function findUngroundedConcepts() {
  if (!fs.existsSync(CONCEPTS_DIR)) return [];

  const existingSummaries = new Set(findSummaryFiles(SUMMARIES_DIR).map((file) => relToKnowledge(file)));
  const ungrounded = [];

  for (const entry of fs.readdirSync(CONCEPTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const relPath = `Wiki/Concepts/${entry.name}`;
    const content = fs.readFileSync(path.join(CONCEPTS_DIR, entry.name), 'utf8');
    const type = parseLooseFrontmatterField(content, 'type');
    if (type !== 'Concept') continue;

    const sourceBullets = getBulletsFromSection(content, 'Sources') ?? [];
    const validSourceCount = sourceBullets
      .flatMap((line) => {
        const targets = [];
        const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
        let match;
        while ((match = re.exec(line)) !== null) targets.push(match[1].trim());
        return targets;
      })
      .filter((target) => target.startsWith('Wiki/Summaries/') && existingSummaries.has(`${target}.md`))
      .length;

    if (validSourceCount === 0) ungrounded.push(relPath);
  }

  return ungrounded.sort();
}

export function findSelfLinks() {
  if (!fs.existsSync(CONCEPTS_DIR)) return {};
  const result = {};
  for (const entry of fs.readdirSync(CONCEPTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const slug = entry.name.slice(0, -3);
    const content = fs.readFileSync(path.join(CONCEPTS_DIR, entry.name), 'utf8');
    const bullets = getBulletsFromSection(content, 'Connected Concepts') ?? [];
    const selfLinkMarker = `[[Wiki/Concepts/${slug}|`;
    const selfLinkExact = `[[Wiki/Concepts/${slug}]]`;
    if (bullets.some((line) => line.includes(selfLinkMarker) || line.includes(selfLinkExact))) {
      result[`Wiki/Concepts/${entry.name}`] = {};
    }
  }
  return result;
}

export function findDuplicateConceptLinks() {
  if (!fs.existsSync(SUMMARIES_DIR)) return {};
  const result = {};
  const conceptLinkRe = /\[\[Wiki\/Concepts\/([^\]|]+)(?:\|[^\]]+)?\]\]/g;

  function scanFile(fullPath, relPath) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    let inKeyC = false;
    const conceptLines = Object.create(null);

    for (const line of lines) {
      if (line === '## Key Concepts') {
        inKeyC = true;
        continue;
      }
      if (inKeyC && line.startsWith('## ')) break;
      const stripped = line.replace(/^- /, '');
      if (!inKeyC || !line.startsWith('- ') || !stripped.startsWith('[[Wiki/Concepts/')) continue;

      conceptLinkRe.lastIndex = 0;
      const match = conceptLinkRe.exec(stripped);
      if (!match) continue;
      const conceptPath = `Wiki/Concepts/${match[1]}.md`;
      if (!conceptLines[conceptPath]) conceptLines[conceptPath] = [];
      conceptLines[conceptPath].push(line.trim());
    }

    const duplicates = Object.entries(conceptLines)
      .filter(([, linesForConcept]) => linesForConcept.length > 1)
      .map(([conceptPath, linesForConcept]) => ({ conceptPath, lines: linesForConcept }));

    if (duplicates.length > 0) result[relPath] = duplicates;
  }

  for (const fullPath of findSummaryFiles(SUMMARIES_DIR)) {
    scanFile(fullPath, relToKnowledge(fullPath));
  }
  return result;
}

const COMMANDS = {
  'find-broken-concept-links': findBrokenConceptLinks,
  'find-broken-summary-links': findBrokenSummaryLinks,
  'find-orphan-concepts': findOrphanConcepts,
  'find-orphan-summaries': findOrphanSummaries,
  'find-ungrounded-concepts': findUngroundedConcepts,
  'find-self-links': findSelfLinks,
  'find-duplicate-concept-links': findDuplicateConceptLinks,
};

const subcommand = process.argv[2];

if (!subcommand || subcommand === '--help') {
  console.error('Usage: node scripts/wiki/wiki-lint.mjs <subcommand>');
  console.error('Subcommands: ' + Object.keys(COMMANDS).join(', '));
  process.exit(1);
}

if (COMMANDS[subcommand]) {
  console.log(JSON.stringify(COMMANDS[subcommand](), null, 2));
} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  console.error('Subcommands: ' + Object.keys(COMMANDS).join(', '));
  process.exit(1);
}
