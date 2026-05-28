/**
 * wiki-summary.mjs
 *
 * Mechanically manages wiki summary files so skills never have to construct
 * frontmatter or backlinks by hand.
 *
 * Usage:
 *   node scripts/wiki-summary.mjs list-stale
 *   node scripts/wiki-summary.mjs create <source-path> [--at <ISO timestamp>]
 *
 * Subcommands:
 *   list-stale
 *       Find source files whose summary is missing or whose content has changed.
 *       Output: { "sources": ["rel/path.md", ...] }
 *
 *   create <source-path> [--at <ISO timestamp>]
 *       Create (or overwrite) a skeleton summary file for <source-path>
 *       (relative to KNOWLEDGE_DIR). Computes and writes the hash automatically.
 *       Prints the summary file rel-path so the skill knows where to edit.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { extractBody } from './wiki-graph-lib.mjs';

process.stdout.on('error', err => { if (err.code === 'EPIPE') process.exit(0); });

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Paths (relative to KNOWLEDGE_DIR) to skip during traversal.
// Directories must end with '/'. Files are matched exactly.
// Patterns starting with '*/' match any file with that basename at any depth.
const EXCLUDE = [
  'Wiki/',
  'Types/',
  '*/README.md',
  '*/README.zh-CN.md',
  '*/README.zh-TW.md',
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/',
  '.codex/',
  '.planning/',
  '.clawpatch/',
];

function isExcluded(relPath, isDir) {
  const key = isDir ? relPath + '/' : relPath;
  return EXCLUDE.some(pattern => {
    if (pattern.startsWith('*/')) return path.basename(key) === pattern.slice(2);
    return key === pattern || key.startsWith(pattern);
  });
}

function parseFrontmatterField(content, field) {
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const frontmatter = content.slice(4, end);
  const match = frontmatter.match(new RegExp(`^${field}:\\s*"?([^"\\n]+)"?`, 'm'));
  return match ? match[1].trim() : null;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function findMarkdownFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(KNOWLEDGE_DIR, fullPath);
    if (entry.isDirectory()) {
      if (isExcluded(relPath, true)) continue;
      findMarkdownFiles(fullPath, results);
    } else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
      if (isExcluded(relPath, false)) continue;
      results.push(relPath);
    }
  }
  return results;
}

function summaryRelFor(sourceRel) {
  return path.join('Wiki', 'Summaries', sourceRel.replace(/\.(md|markdown)$/i, '.summary.md'));
}

// --- Subcommands ---

function cmdListStale() {
  const sources = [];
  for (const relPath of findMarkdownFiles(KNOWLEDGE_DIR)) {
    const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, relPath), 'utf8');
    const hash = sha256(extractBody(content));
    const summaryFull = path.join(KNOWLEDGE_DIR, summaryRelFor(relPath));

    let stale = false;
    if (!fs.existsSync(summaryFull)) {
      stale = true;
    } else {
      const storedHash = parseFrontmatterField(fs.readFileSync(summaryFull, 'utf8'), 'hash');
      if (storedHash !== hash) stale = true;
    }
    if (stale) sources.push(relPath);
  }
  console.log(JSON.stringify({ sources }, null, 2));
}

function cmdCreate(args) {
  const sourceRel = args[0];
  if (!sourceRel) {
    console.error('Usage: wiki-summary.mjs create <source-path> [--at <ISO timestamp>]');
    process.exit(1);
  }

  const atIdx = args.indexOf('--at');
  const timestamp = (atIdx !== -1 && args[atIdx + 1]) ? args[atIdx + 1] : new Date().toISOString();

  const srcFull = path.join(KNOWLEDGE_DIR, sourceRel);
  if (!fs.existsSync(srcFull)) {
    console.error(`Source file not found: ${srcFull}`);
    process.exit(1);
  }

  const hash = sha256(extractBody(fs.readFileSync(srcFull, 'utf8')));
  const summaryRel = summaryRelFor(sourceRel);
  const summaryFull = path.join(KNOWLEDGE_DIR, summaryRel);

  fs.mkdirSync(path.dirname(summaryFull), { recursive: true });

  // Backlink target: source path without extension
  const backlinkTarget = sourceRel.replace(/\.(md|markdown)$/i, '');

  const skeleton = [
    '---',
    `source: ${sourceRel}`,
    `hash: ${hash}`,
    `summarized_at: ${timestamp}`,
    'type: Summary',
    '_icon: gear',
    'tags: []',
    '---',
    '',
    '# ',
    '',
    '## Summary',
    '',
    '## Key Concepts',
    '',
    '## Notable Details',
    '',
    '## Backlinks',
    '',
    `- Source file: [[${backlinkTarget}]]`,
    '',
  ].join('\n');

  fs.writeFileSync(summaryFull, skeleton, 'utf8');
  console.log(summaryRel);
}

// --- Dispatch ---

const [,, subcommand, ...rest] = process.argv;

switch (subcommand) {
  case 'list-stale':   cmdListStale(); break;
  case 'create':       cmdCreate(rest); break;
  default:
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Subcommands: list-stale, create');
    process.exit(1);
}
