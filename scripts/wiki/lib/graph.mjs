import fs from 'fs';
import path from 'path';

export function extractBody(content) {
  if (content.startsWith('---\n')) {
    const end = content.indexOf('\n---\n', 4);
    if (end !== -1) return content.slice(end + 5);
  }
  return content;
}

export function extractWikilinks(text) {
  const targets = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    targets.push(match[1].trim());
  }
  return targets;
}

export function fileType(relPath) {
  if (relPath.startsWith('Wiki/Concepts/')) return 'concept';
  if (relPath.startsWith('Wiki/Summaries/')) return 'summary';
  return 'other';
}

function findWikiFiles(dir, knowledgeDir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findWikiFiles(fullPath, knowledgeDir, results);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.md') &&
      entry.name !== 'index.md'
    ) {
      results.push(path.relative(knowledgeDir, fullPath).replaceAll(path.sep, '/'));
    }
  }
  return results;
}

export function buildWikiGraph(knowledgeDir) {
  const wikiDir = path.join(knowledgeDir, 'Wiki');
  const relPaths = findWikiFiles(wikiDir, knowledgeDir);
  const allFiles = new Set(relPaths);

  const inboundCounts = {};
  for (const relPath of allFiles) {
    if (fileType(relPath) === 'concept') inboundCounts[relPath] = 0;
  }

  const links = [];

  for (const fromRel of allFiles) {
    const fromType = fileType(fromRel);
    if (fromType === 'other') continue;

    const content = fs.readFileSync(path.join(knowledgeDir, fromRel), 'utf8');
    const body = extractBody(content);

    for (const rawTarget of extractWikilinks(body)) {
      if (!rawTarget.startsWith('Wiki/')) continue;

      const toRel = rawTarget + '.md';
      const toType = fileType(toRel);

      links.push({ from: fromRel, fromType, to: toRel, toType, rawTarget });

      if (allFiles.has(toRel) && toType === 'concept') {
        inboundCounts[toRel] = (inboundCounts[toRel] || 0) + 1;
      }
    }
  }

  return { allFiles, links, inboundCounts };
}
