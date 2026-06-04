export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function listBlockAround(lines, index) {
  let start = index;
  let end = index;
  while (start > 0 && /^\s*[-*] /.test(lines[start - 1])) start--;
  while (end < lines.length - 1 && /^\s*[-*] /.test(lines[end + 1])) end++;
  return { start, end };
}

export function conceptLinkRegex(conceptPrefix) {
  return new RegExp(
    `\\[\\[${escapeRegex(conceptPrefix)}(?:\\|([^\\]]+))?\\]\\]`,
    'g',
  );
}

export function lineHasConceptLink(line, conceptPrefix) {
  return line.includes(`[[${conceptPrefix}|`) || line.includes(`[[${conceptPrefix}]]`);
}
