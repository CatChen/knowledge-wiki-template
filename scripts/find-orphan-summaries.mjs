/**
 * find-orphan-summaries.mjs
 *
 * Finds summary files whose source document no longer exists at the path
 * recorded in their frontmatter `source:` field.
 *
 * Output: JSON object keyed by orphan summary file path (relative to KNOWLEDGE_DIR).
 * {
 *   "Wiki/Summaries/Posts/foo.summary.md": { "source": "Posts/foo.md" },
 *   "Wiki/Summaries/Posts/bar.summary.md": { "source": null }  // no source field in frontmatter
 * }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIKI_SUMMARIES_DIR = path.join(KNOWLEDGE_DIR, 'Wiki', 'Summaries');

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
    if (entry.isDirectory()) {
      findSummaryFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.summary.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

if (!fs.existsSync(WIKI_SUMMARIES_DIR)) {
  console.log(JSON.stringify({}, null, 2));
  process.exit(0);
}

const summaryFiles = findSummaryFiles(WIKI_SUMMARIES_DIR);
const result = {};

for (const fullPath of summaryFiles) {
  const content = fs.readFileSync(fullPath, 'utf8');
  const source = parseFrontmatterField(content, 'source');
  const summaryRel = path.relative(KNOWLEDGE_DIR, fullPath);

  if (!source) {
    result[summaryRel] = { source: null };
    continue;
  }

  const sourcePath = path.join(KNOWLEDGE_DIR, source);
  if (!fs.existsSync(sourcePath)) {
    result[summaryRel] = { source };
  }
}

console.log(JSON.stringify(result, null, 2));
