import path from 'path';
import { fileURLToPath } from 'url';

export const KNOWLEDGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
export const WIKI_DIR = path.join(KNOWLEDGE_DIR, 'Wiki');
export const CONCEPTS_DIR = path.join(WIKI_DIR, 'Concepts');
export const SUMMARIES_DIR = path.join(WIKI_DIR, 'Summaries');
export const INDEX_PATH = path.join(WIKI_DIR, 'index.md');
export const STATE_FILE = path.join(WIKI_DIR, '.state.json');

export function toPosixPath(filePath) {
  return filePath.replaceAll(path.sep, '/');
}

export function relToKnowledge(fullPath) {
  return toPosixPath(path.relative(KNOWLEDGE_DIR, fullPath));
}

export function conceptRelPath(slug) {
  return `Wiki/Concepts/${slug}.md`;
}

export function conceptFullPath(slug) {
  return path.join(CONCEPTS_DIR, `${slug}.md`);
}

export function summaryFullPath(relPathWithoutMd) {
  return path.join(SUMMARIES_DIR, `${relPathWithoutMd}.md`);
}
