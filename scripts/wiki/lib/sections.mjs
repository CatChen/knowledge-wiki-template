/**
 * Shared utilities for reading and modifying named ## sections in Markdown.
 */

export function getSectionRange(content, sectionName) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line === `## ${sectionName}`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return { start, end };
}

export function lineInSection(content, lineIndex, sectionName) {
  const range = getSectionRange(content, sectionName);
  return range !== null && lineIndex > range.start && lineIndex < range.end;
}

export function getBulletsFromSection(content, sectionName) {
  const lines = content.split('\n');
  const range = getSectionRange(content, sectionName);
  if (range === null) return null;
  const bullets = [];
  for (let i = range.start + 1; i < range.end; i++) {
    if (lines[i].startsWith('- ')) bullets.push(lines[i]);
  }
  return bullets;
}

export function sectionContains(content, sectionName, substring) {
  const lines = content.split('\n');
  const range = getSectionRange(content, sectionName);
  if (range === null) return false;
  for (let i = range.start + 1; i < range.end; i++) {
    if (lines[i].includes(substring)) return true;
  }
  return false;
}

export function insertBulletInSection(content, sectionName, bullet, { insertBefore = null } = {}) {
  const lines = content.split('\n');
  const headerLine = `## ${sectionName}`;
  const sectionStart = lines.indexOf(headerLine);

  if (sectionStart === -1) {
    if (insertBefore) {
      const targetIdx = lines.indexOf(`## ${insertBefore}`);
      if (targetIdx !== -1) {
        const blankBefore = targetIdx > 0 && lines[targetIdx - 1] === '';
        const block = blankBefore
          ? [headerLine, '', bullet, '']
          : ['', headerLine, '', bullet, ''];
        lines.splice(targetIdx, 0, ...block);
        return ensureTrailingNewline(lines.join('\n'));
      }
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push('', headerLine, '', bullet, '');
    return ensureTrailingNewline(lines.join('\n'));
  }

  let lastBulletIdx = -1;
  let nextSectionIdx = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      nextSectionIdx = i;
      break;
    }
    if (lines[i].startsWith('- ')) lastBulletIdx = i;
  }

  if (lastBulletIdx !== -1) {
    lines.splice(lastBulletIdx + 1, 0, bullet);
    return ensureTrailingNewline(lines.join('\n'));
  }

  const before = lines.slice(0, sectionStart + 1);
  const after = lines.slice(nextSectionIdx);
  const rebuilt = [
    ...before,
    '',
    bullet,
    ...(after.length ? ['', ...after] : ['']),
  ];
  return ensureTrailingNewline(rebuilt.join('\n'));
}

export function deleteBulletFromSection(content, sectionName, predicate) {
  const lines = content.split('\n');
  const range = getSectionRange(content, sectionName);
  if (range === null) return { content, found: false };

  const before = lines.slice(0, range.start + 1);
  const within = lines.slice(range.start + 1, range.end);
  const after = lines.slice(range.end);
  const filtered = within.filter((line) => !predicate(line));
  const found = filtered.length < within.length;
  return {
    content: ensureTrailingNewline([...before, ...filtered, ...after].join('\n')),
    found,
  };
}

export function ensureTrailingNewline(s) {
  return s.endsWith('\n') ? s : s + '\n';
}
