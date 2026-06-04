/**
 * wiki-index.mjs
 *
 * Reads and writes Wiki/index.md.
 * Skills should call this instead of reading the whole file and writing it back.
 *
 * Usage:
 *   node scripts/wiki/wiki-index.mjs sort
 *   node scripts/wiki/wiki-index.mjs read-concepts
 *   node scripts/wiki/wiki-index.mjs read-summaries
 *   node scripts/wiki/wiki-index.mjs upsert-concept <slug> "<display-name>" "<description>"
 *   node scripts/wiki/wiki-index.mjs delete-concept <slug>
 *   node scripts/wiki/wiki-index.mjs upsert-summary "<rel-path>" "<description>"
 *   node scripts/wiki/wiki-index.mjs delete-summary "<rel-path>"
 *   node scripts/wiki/wiki-index.mjs find-missing-summaries
 *   node scripts/wiki/wiki-index.mjs find-missing-concepts
 *   node scripts/wiki/wiki-index.mjs delete-dead-links
 *
 * <slug>     — the concept file basename without .md, e.g. "feature-gating"
 * <rel-path> — path relative to Wiki/Summaries/, e.g. "Twitter/Tweets-foo.summary"
 *
 * read-concepts output format (one entry per line):
 *   - [[Wiki/Concepts/slug|Display Name]] — description
 *
 * read-summaries output format (one entry per line):
 *   - [[Wiki/Summaries/rel-path]] — description
 *
 * Both sections are kept in case-insensitive alphabetical order.
 * Concepts sort by display name; summaries sort by rel-path.
 *
 * If Wiki/index.md does not exist, it is created automatically on the first write.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import { getBulletsFromSection } from './lib/sections.mjs';
import { INDEX_PATH, KNOWLEDGE_DIR } from './lib/paths.mjs';

// Suppress EPIPE errors when output is piped to head, less, etc.
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
});

const CONCEPT_RE = /^- \[\[Wiki\/Concepts\/([^|]+)\|([^\]]+)\]\] — (.+)$/;
const SUMMARY_RE = /^- \[\[Wiki\/Summaries\/([^\]]+)\]\] — (.+)$/;

// --- Parsing and serialisation ---

function parseIndex() {
  if (!existsSync(INDEX_PATH)) {
    return { concepts: [], summaries: [] };
  }

  const text = readFileSync(INDEX_PATH, 'utf8');
  const concepts = getBulletsFromSection(text, 'Concepts');
  const summaries = getBulletsFromSection(text, 'Summaries');

  if (concepts === null)
    throw new Error('## Concepts section not found in Wiki/index.md');
  if (summaries === null)
    throw new Error('## Summaries section not found in Wiki/index.md');

  return { concepts, summaries };
}

function conceptSortKey(line) {
  // Sort by display name (the part after the pipe: [[slug|Display Name]])
  return (CONCEPT_RE.exec(line)?.[2] ?? line).toLowerCase();
}

function summarySortKey(line) {
  // Sort by rel-path (the part inside the brackets: [[Wiki/Summaries/rel-path]])
  return (SUMMARY_RE.exec(line)?.[1] ?? line).toLowerCase();
}

function writeIndex(concepts, summaries) {
  // Always write in sorted order so the file stays clean regardless of how entries arrived.
  const sortedConcepts = [...concepts].sort((a, b) =>
    conceptSortKey(a).localeCompare(conceptSortKey(b)),
  );
  const sortedSummaries = [...summaries].sort((a, b) =>
    summarySortKey(a).localeCompare(summarySortKey(b)),
  );

  const content = [
    '# Knowledge Base Index',
    '',
    '## Concepts',
    '',
    ...sortedConcepts,
    '',
    '## Summaries',
    '',
    ...sortedSummaries,
    '',
  ].join('\n');

  mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  writeFileSync(INDEX_PATH, content, 'utf8');
}

// --- Commands ---

const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case 'sort': {
    const { concepts, summaries } = parseIndex();
    writeIndex(concepts, summaries);
    console.log(
      `Sorted ${concepts.length} concepts and ${summaries.length} summaries.`,
    );
    break;
  }

  case 'read-concepts': {
    const { concepts } = parseIndex();
    if (concepts.length > 0) process.stdout.write(concepts.join('\n') + '\n');
    break;
  }

  case 'read-summaries': {
    const { summaries } = parseIndex();
    if (summaries.length > 0) process.stdout.write(summaries.join('\n') + '\n');
    break;
  }

  case 'upsert-concept': {
    // Args: slug displayName ...description
    // displayName must be shell-quoted if it contains spaces.
    // description absorbs all remaining args so partial quoting still works.
    const [slug, displayName, ...descParts] = args;
    const description = descParts.join(' ');
    if (!slug || !displayName || !description) {
      process.stderr.write(
        'Usage: upsert-concept <slug> "<display-name>" "<description>"\n',
      );
      process.exit(1);
    }
    const { concepts, summaries } = parseIndex();
    const idx = concepts.findIndex((l) => CONCEPT_RE.exec(l)?.[1] === slug);
    const newLine = `- [[Wiki/Concepts/${slug}|${displayName}]] — ${description}`;
    if (idx === -1) {
      concepts.push(newLine);
      writeIndex(concepts, summaries);
      console.log(`Inserted concept '${slug}'.`);
    } else {
      concepts[idx] = newLine;
      writeIndex(concepts, summaries);
      console.log(`Updated concept '${slug}'.`);
    }
    break;
  }

  case 'delete-concept': {
    const [slug] = args;
    if (!slug) {
      process.stderr.write('Usage: delete-concept <slug>\n');
      process.exit(1);
    }
    const { concepts, summaries } = parseIndex();
    const idx = concepts.findIndex((l) => CONCEPT_RE.exec(l)?.[1] === slug);
    if (idx === -1) {
      process.stderr.write(`Error: concept '${slug}' not found.\n`);
      process.exit(1);
    }
    concepts.splice(idx, 1);
    writeIndex(concepts, summaries);
    console.log(`Deleted concept '${slug}'.`);
    break;
  }

  case 'upsert-summary': {
    // Args: relPath ...description
    const [relPath, ...descParts] = args;
    const description = descParts.join(' ');
    if (!relPath || !description) {
      process.stderr.write(
        'Usage: upsert-summary "<rel-path>" "<description>"\n',
      );
      process.exit(1);
    }
    const { concepts, summaries } = parseIndex();
    const idx = summaries.findIndex((l) => SUMMARY_RE.exec(l)?.[1] === relPath);
    const newLine = `- [[Wiki/Summaries/${relPath}]] — ${description}`;
    if (idx === -1) {
      summaries.push(newLine);
      writeIndex(concepts, summaries);
      console.log(`Inserted summary '${relPath}'.`);
    } else {
      summaries[idx] = newLine;
      writeIndex(concepts, summaries);
      console.log(`Updated summary '${relPath}'.`);
    }
    break;
  }

  case 'delete-summary': {
    const [relPath] = args;
    if (!relPath) {
      process.stderr.write('Usage: delete-summary "<rel-path>"\n');
      process.exit(1);
    }
    const { concepts, summaries } = parseIndex();
    const idx = summaries.findIndex((l) => SUMMARY_RE.exec(l)?.[1] === relPath);
    if (idx === -1) {
      process.stderr.write(`Error: summary '${relPath}' not found.\n`);
      process.exit(1);
    }
    summaries.splice(idx, 1);
    writeIndex(concepts, summaries);
    console.log(`Deleted summary '${relPath}'.`);
    break;
  }

  case 'find-missing-summaries': {
    // Find summary files on disk that have no entry in Wiki/index.md.
    // Output: JSON array of rel-paths (e.g. ["AvocadoToast/foo.summary"]).
    const summariesDir = path.join(KNOWLEDGE_DIR, 'Wiki', 'Summaries');
    const { summaries } = parseIndex();
    const indexed = new Set(
      summaries.map((l) => SUMMARY_RE.exec(l)?.[1]).filter(Boolean),
    );
    const missing = [];
    if (existsSync(summariesDir)) {
      for (const file of readdirSync(summariesDir, { recursive: true })) {
        if (!file.endsWith('.summary.md')) continue;
        const relPath = file.replaceAll('\\', '/').slice(0, -'.md'.length);
        if (!indexed.has(relPath)) missing.push(relPath);
      }
    }
    missing.sort();
    console.log(JSON.stringify(missing, null, 2));
    break;
  }

  case 'find-missing-concepts': {
    // Find concept files on disk that have no entry in Wiki/index.md.
    // Output: JSON array of slugs (e.g. ["autonomous-driving"]).
    const conceptsDir = path.join(KNOWLEDGE_DIR, 'Wiki', 'Concepts');
    const { concepts } = parseIndex();
    const indexed = new Set(
      concepts.map((l) => CONCEPT_RE.exec(l)?.[1]).filter(Boolean),
    );
    const missing = [];
    if (existsSync(conceptsDir)) {
      for (const file of readdirSync(conceptsDir)) {
        if (!file.endsWith('.md')) continue;
        const slug = file.slice(0, -'.md'.length);
        if (!indexed.has(slug)) missing.push(slug);
      }
    }
    missing.sort();
    console.log(JSON.stringify(missing, null, 2));
    break;
  }

  case 'delete-dead-links': {
    // Delete index entries whose files no longer exist on disk.
    // Writes the updated index and outputs the counts of deleted entries.
    const { concepts, summaries } = parseIndex();

    const deletedConcepts = [];
    const keptConcepts = concepts.filter((l) => {
      const slug = CONCEPT_RE.exec(l)?.[1];
      if (!slug) return true;
      if (
        existsSync(path.join(KNOWLEDGE_DIR, 'Wiki', 'Concepts', `${slug}.md`))
      )
        return true;
      deletedConcepts.push(l);
      return false;
    });

    const deletedSummaries = [];
    const keptSummaries = summaries.filter((l) => {
      const relPath = SUMMARY_RE.exec(l)?.[1];
      if (!relPath) return true;
      if (
        existsSync(
          path.join(KNOWLEDGE_DIR, 'Wiki', 'Summaries', `${relPath}.md`),
        )
      )
        return true;
      deletedSummaries.push(l);
      return false;
    });

    if (deletedConcepts.length > 0 || deletedSummaries.length > 0) {
      writeIndex(keptConcepts, keptSummaries);
    }

    console.log(
      JSON.stringify({
        concepts: deletedConcepts.length,
        summaries: deletedSummaries.length,
      }),
    );
    break;
  }

  default: {
    process.stderr.write(
      [
        `Unknown command: ${cmd ?? '(none)'}`,
        '',
        'Commands:',
        '  sort',
        '  read-concepts',
        '  read-summaries',
        '  upsert-concept <slug> "<display-name>" "<description>"',
        '  delete-concept <slug>',
        '  upsert-summary "<rel-path>" "<description>"',
        '  delete-summary "<rel-path>"',
        '  find-missing-summaries',
        '  find-missing-concepts',
        '  delete-dead-links',
      ].join('\n') + '\n',
    );
    process.exit(1);
  }
}
