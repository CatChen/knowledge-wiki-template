export function parseFrontmatterField(content, field) {
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const frontmatter = content.slice(4, end);
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

export function parseLooseFrontmatterField(content, field) {
  const value = parseFrontmatterField(content, field);
  return value?.replace(/^['"]|['"]$/g, '') ?? null;
}
