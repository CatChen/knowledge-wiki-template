/**
 * wiki-summary.mjs
 *
 * Mechanically manages wiki summary files so skills never have to construct
 * frontmatter or backlinks by hand.
 *
 * Usage:
 *   node scripts/wiki/wiki-summary.mjs list-stale
 *   node scripts/wiki/wiki-summary.mjs create <source-path> [--at <ISO timestamp>]
 *   node scripts/wiki/wiki-summary.mjs delete-concept - | <summary-rel-path> <concept-slug>
 *   node scripts/wiki/wiki-summary.mjs insert-concept - | <summary-rel-path> <concept-slug> <display-name> <description|->
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
 *
 *   delete-concept - | <summary-rel-path> <concept-slug>
 *       Remove all Key Concepts bullet entries for <concept-slug> from the summary.
 *       Pass - as the first argument to read both fields from stdin (one per line)
 *       inside a single-quoted heredoc — required when the path contains quotes or
 *       other shell-special characters.
 *
 *   insert-concept - | <summary-rel-path> <concept-slug> <display-name> <description|->
 *       Append "- [[Wiki/Concepts/<slug>|<display-name>]] — <description>" to the
 *       ## Key Concepts section. Idempotent — no-op if the concept is already a
 *       bullet entry.
 *       Pass - as the first argument to read all four fields from stdin (one per
 *       line); description is everything from line 4 onward, collapsed to one line.
 *       Pass - as the description (4th positional arg) to read only the description
 *       from stdin. Both forms use a single-quoted heredoc (<<'EOF') to protect $,
 *       backticks, and other shell-special characters.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { extractBody } from './wiki-graph-lib.mjs';
import {
  insertBulletInSection,
  deleteBulletFromSection,
} from './wiki-section-lib.mjs';

process.stdout.on('error', err => { if (err.code === 'EPIPE') process.exit(0); });

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
  '.git/',
  'node_modules/',
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
    console.error('Usage: node scripts/wiki/wiki-summary.mjs create <source-path> [--at <ISO timestamp>]');
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

function cmdDeleteConcept(args) {
  let relPath, slug;
  if (args[0] === '-') {
    // Read both fields from stdin (one per line) inside a <<'EOF' heredoc,
    // safe for paths that contain double quotes or other shell-special characters.
    const lines = fs.readFileSync(0, 'utf8').split('\n').map(l => l.trimEnd());
    [relPath, slug] = lines;
  } else {
    [relPath, slug] = args;
  }
  if (!relPath || !slug) {
    console.error('Usage: node scripts/wiki/wiki-summary.mjs delete-concept - | <summary-rel-path> <concept-slug>');
    process.exit(1);
  }

  const summaryFull = path.join(KNOWLEDGE_DIR, relPath);
  if (!fs.existsSync(summaryFull)) {
    console.error(`Summary file not found: ${summaryFull}`);
    process.exit(1);
  }

  const content = fs.readFileSync(summaryFull, 'utf8');
  // Match only bullets where slug is the leading (entry) wikilink, not a
  // secondary mention in the description.
  const entryRe = /^- \[\[Wiki\/Concepts\/([^\]|]+)(?:\|[^\]]+)?\]\]/;
  const { content: updated, found } = deleteBulletFromSection(
    content, 'Key Concepts',
    line => { const m = entryRe.exec(line); return m !== null && m[1] === slug; },
  );

  if (!found) {
    console.log(`Not found in ${relPath}: ${slug}`);
    return;
  }

  fs.writeFileSync(summaryFull, updated, 'utf8');
  console.log(`Deleted concept from ${relPath}: ${slug}`);
}

function cmdInsertConcept(args) {
  let relPath, slug, displayName, description;

  if (args[0] === '-') {
    // All four fields from stdin (one per line) inside a <<'EOF' heredoc,
    // safe for paths/names that contain double quotes or shell-special chars.
    // Description is everything from line 4 onward, collapsed to one line.
    const lines = fs.readFileSync(0, 'utf8').split('\n').map(l => l.trimEnd());
    relPath = lines[0];
    slug = lines[1];
    displayName = lines[2];
    description = lines.slice(3).filter(Boolean).join(' ').trim();
  } else {
    [relPath, slug, displayName] = args;
    const rawDescription = args[3];
    // Pass '-' as description to read only it from stdin via <<'EOF'.
    description = rawDescription === '-'
      ? fs.readFileSync(0, 'utf8').replace(/\r?\n/g, ' ').trim()
      : rawDescription;
  }

  if (!relPath || !slug || !displayName || !description) {
    console.error('Usage: node scripts/wiki/wiki-summary.mjs insert-concept - | <summary-rel-path> <concept-slug> <display-name> <description|->\n  Use - as first arg to read all fields from stdin; or pass - as 4th arg to read only the description.');
    process.exit(1);
  }

  const summaryFull = path.join(KNOWLEDGE_DIR, relPath);
  if (!fs.existsSync(summaryFull)) {
    console.error(`Summary file not found: ${summaryFull}`);
    process.exit(1);
  }

  const content = fs.readFileSync(summaryFull, 'utf8');

  // Idempotency: check only bullet entries (leading wikilink), not prose lines.
  const entryRe = /^- \[\[Wiki\/Concepts\/([^\]|]+)(?:\|[^\]]+)?\]\]/;
  let inKeyC = false;
  let alreadyPresent = false;
  for (const line of content.split('\n')) {
    if (line === '## Key Concepts') { inKeyC = true; continue; }
    if (inKeyC && line.startsWith('## ')) break;
    if (!inKeyC) continue;
    const m = entryRe.exec(line);
    if (m && m[1] === slug) { alreadyPresent = true; break; }
  }

  if (alreadyPresent) {
    console.log(`Already present in ${relPath}: ${slug}`);
    return;
  }

  const bullet = `- [[Wiki/Concepts/${slug}|${displayName}]] — ${description}`;
  const updated = insertBulletInSection(content, 'Key Concepts', bullet);
  fs.writeFileSync(summaryFull, updated, 'utf8');
  console.log(`Inserted concept into ${relPath}: ${slug}`);
}


// --- Dispatch ---

const [,, subcommand, ...rest] = process.argv;

switch (subcommand) {
  case 'list-stale':      cmdListStale(); break;
  case 'create':          cmdCreate(rest); break;
  case 'delete-concept':  cmdDeleteConcept(rest); break;
  case 'insert-concept':  cmdInsertConcept(rest); break;
  default:
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Subcommands: list-stale, create, delete-concept, insert-concept');
    process.exit(1);
}
