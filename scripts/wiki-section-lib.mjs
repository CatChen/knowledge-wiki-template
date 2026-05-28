/**
 * wiki-section-lib.mjs
 *
 * Shared utilities for reading and modifying named ## sections in Markdown files.
 * A "section" is a block of content starting at a "## Heading" line and ending
 * at the next "## Heading" line (or EOF). Bullet lines are lines starting with
 * "- " (not "* " or indented variants).
 */

/**
 * Returns bullet lines (starting with "- ") from the named ## section,
 * or null if the section does not exist. Returns an empty array if the
 * section exists but contains no bullet lines.
 */
export function getBulletsFromSection(content, sectionName) {
  const lines = content.split('\n');
  const sectionStart = lines.findIndex((l) => l === `## ${sectionName}`);
  if (sectionStart === -1) return null;
  const bullets = [];
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break;
    if (lines[i].startsWith('- ')) bullets.push(lines[i]);
  }
  return bullets;
}

/**
 * Returns true if any line within the named ## section contains `substring`.
 * Returns false if the section does not exist or no line within it matches.
 */
export function sectionContains(content, sectionName, substring) {
  const lines = content.split('\n');
  const sectionStart = lines.findIndex((l) => l === `## ${sectionName}`);
  if (sectionStart === -1) return false;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break;
    if (lines[i].includes(substring)) return true;
  }
  return false;
}

/**
 * Insert `bullet` into the named ## section of `content`.
 * Appends after the last existing bullet in the section, or after the section
 * header if the section is empty.
 *
 * If the section does not exist and `insertBefore` names another section,
 * the new section is created immediately before that section. Otherwise it
 * is appended at the end of the file.
 *
 * Returns the modified content string (always ends with a single newline).
 */
export function insertBulletInSection(content, sectionName, bullet, { insertBefore = null } = {}) {
  const lines = content.split('\n');
  const headerLine = `## ${sectionName}`;
  const sectionStart = lines.indexOf(headerLine);

  if (sectionStart === -1) {
    // Section does not exist — create it.
    if (insertBefore) {
      const targetIdx = lines.indexOf(`## ${insertBefore}`);
      if (targetIdx !== -1) {
        // Insert at targetIdx so the existing blank line before that section
        // becomes the separator for the new section's content.
        // If there is no blank line before targetIdx, prepend one.
        const blankBefore = targetIdx > 0 && lines[targetIdx - 1] === '';
        const block = blankBefore
          ? [headerLine, '', bullet, '']
          : ['', headerLine, '', bullet, ''];
        lines.splice(targetIdx, 0, ...block);
        return ensureTrailingNewline(lines.join('\n'));
      }
    }
    // Append at end
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push('', headerLine, '', bullet, '');
    return ensureTrailingNewline(lines.join('\n'));
  }

  // Section exists — find its extent.
  let lastBulletIdx = -1;
  let nextSectionIdx = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { nextSectionIdx = i; break; }
    if (lines[i].startsWith('- ')) lastBulletIdx = i;
  }

  if (lastBulletIdx !== -1) {
    // Append immediately after the last bullet.
    lines.splice(lastBulletIdx + 1, 0, bullet);
    return ensureTrailingNewline(lines.join('\n'));
  }

  // Section exists but has no bullets — rebuild cleanly.
  const before = lines.slice(0, sectionStart + 1); // includes header line
  const after = lines.slice(nextSectionIdx);
  const rebuilt = [
    ...before,
    '',
    bullet,
    ...(after.length ? ['', ...after] : ['']),
  ];
  return ensureTrailingNewline(rebuilt.join('\n'));
}

/**
 * Remove lines from the named ## section where `predicate(line)` is true.
 * Lines outside the section are never touched.
 * Returns { content: string, found: boolean }.
 */
export function deleteBulletFromSection(content, sectionName, predicate) {
  const lines = content.split('\n');
  const sectionStart = lines.findIndex((l) => l === `## ${sectionName}`);
  if (sectionStart === -1) return { content, found: false };

  let nextSectionIdx = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) { nextSectionIdx = i; break; }
  }

  const before = lines.slice(0, sectionStart + 1);
  const within = lines.slice(sectionStart + 1, nextSectionIdx);
  const after = lines.slice(nextSectionIdx);
  const filtered = within.filter((line) => !predicate(line));
  const found = filtered.length < within.length;
  return { content: ensureTrailingNewline([...before, ...filtered, ...after].join('\n')), found };
}

export function ensureTrailingNewline(s) {
  return s.endsWith('\n') ? s : s + '\n';
}
