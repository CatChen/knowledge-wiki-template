/**
 * find-thin-concepts.mjs
 *
 * Finds concept files that are candidates for web-search expansion: those with
 * fewer than WORD_THRESHOLD words in their body AND at most SOURCE_THRESHOLD
 * entries in their ## Sources section.
 *
 * Word count covers the full body after frontmatter (title, prose, section
 * headers, list items). Source count is a binary gate: articles with many
 * internal sources are better expanded by re-running the concept skill rather
 * than by web search.
 *
 * Output:
 * {
 *   "concepts": ["Wiki/Concepts/thin-concept.md", ...]
 * }
 * Sorted by word count ascending (thinnest first).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractBody } from './wiki-graph-lib.mjs';

const KNOWLEDGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const CONCEPTS_DIR = path.join(KNOWLEDGE_DIR, 'Wiki', 'Concepts');

const WORD_THRESHOLD = 150;
const SOURCE_THRESHOLD = 2;

function countWords(body) {
  return body.split(/\s+/).filter(w => /^[a-zA-Z]+$/.test(w)).length;
}

function countSources(body) {
  return body
    .split('\n')
    .filter((line) => /^\s*-\s*\[\[Wiki\/Summaries\//.test(line)).length;
}

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

console.log(JSON.stringify({ concepts: concepts.map(c => c._path) }, null, 2));
