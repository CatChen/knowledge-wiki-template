/**
 * wiki-concept.mjs
 *
 * Mechanically manages wiki concept files so skills never have to construct
 * wikilinks containing file paths by hand.
 *
 * Usage:
 *   node scripts/wiki/wiki-concept.mjs create <slug> <display-name> [--type <Concept|Synthesis>] [--icon <note|notepad>]
 *   node scripts/wiki/wiki-concept.mjs insert-source <slug> <summary-path>
 *   node scripts/wiki/wiki-concept.mjs delete-source <slug> <summary-path>
 *   node scripts/wiki/wiki-concept.mjs insert-connected-concept <slug> <linked-slug> <display-name>
 *   node scripts/wiki/wiki-concept.mjs delete-connected-concept <slug> <linked-slug>
 *
 * Subcommands:
 *   node scripts/wiki/wiki-concept.mjs create <slug> <display-name> [--type <Concept|Synthesis>] [--icon <note|notepad>]
 *       Create a skeleton concept file at Wiki/Concepts/<slug>.md.
 *       Prints the concept file rel-path so the skill knows where to edit.
 *       Defaults: --type Concept --icon note
 *
 *   node scripts/wiki/wiki-concept.mjs insert-source <slug> <summary-path>
 *       Append "- [[<summary-path>]]" to the ## Sources section of the concept file.
 *       Idempotent — no-op if the link already exists.
 *       <summary-path>: path without .md, e.g. Wiki/Summaries/Posts/foo.summary
 *
 *   node scripts/wiki/wiki-concept.mjs delete-source <slug> <summary-path>
 *       Remove the bullet line containing [[<summary-path>]] from the concept file.
 *
 *   node scripts/wiki/wiki-concept.mjs insert-connected-concept <slug> <linked-slug> <display-name>
 *       Append "- [[Wiki/Concepts/<linked-slug>|<display-name>]]" to the
 *       ## Connected Concepts section. Creates the section immediately before
 *       ## Sources if it does not exist. Idempotent.
 *
 *   node scripts/wiki/wiki-concept.mjs delete-connected-concept <slug> <linked-slug>
 *       Remove the bullet line containing [[Wiki/Concepts/<linked-slug>|...]] from
 *       the ## Connected Concepts section of the concept file.
 */

import fs from 'fs';
import {
  sectionContains,
  insertBulletInSection,
  deleteBulletFromSection,
} from './lib/sections.mjs';
import { CONCEPTS_DIR, conceptFullPath, conceptRelPath } from './lib/paths.mjs';

process.stdout.on('error', err => { if (err.code === 'EPIPE') process.exit(0); });

function readConcept(slug) {
  const filePath = conceptFullPath(slug);
  if (!fs.existsSync(filePath)) {
    console.error(`Concept file not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function writeConcept(slug, content) {
  fs.writeFileSync(conceptFullPath(slug), content, 'utf8');
}


// --- Subcommands ---

function cmdCreate(args) {
  const slug = args[0];
  const displayName = args[1];
  if (!slug || !displayName) {
    console.error('Usage: node scripts/wiki/wiki-concept.mjs create <slug> <display-name> [--type <Concept|Synthesis>] [--icon <note|notepad>]');
    process.exit(1);
  }

  const typeIdx = args.indexOf('--type');
  const iconIdx = args.indexOf('--icon');
  const type = (typeIdx !== -1 && args[typeIdx + 1]) ? args[typeIdx + 1] : 'Concept';
  const icon = (iconIdx !== -1 && args[iconIdx + 1]) ? args[iconIdx + 1] : 'note';

  if (fs.existsSync(conceptFullPath(slug))) {
    console.error(`Concept file already exists: ${conceptRelPath(slug)}`);
    console.error('Use insert-source / insert-connected-concept to modify existing concepts.');
    process.exit(1);
  }

  fs.mkdirSync(CONCEPTS_DIR, { recursive: true });

  const skeleton = [
    '---',
    `type: ${type}`,
    `_icon: ${icon}`,
    'tags: []',
    '---',
    '',
    `# ${displayName}`,
    '',
    '## Sources',
    '',
  ].join('\n');

  fs.writeFileSync(conceptFullPath(slug), skeleton, 'utf8');
  console.log(conceptRelPath(slug));
}

function cmdInsertSource(args) {
  const [slug, summaryPath] = args;
  if (!slug || !summaryPath) {
    console.error('Usage: node scripts/wiki/wiki-concept.mjs insert-source <slug> <summary-path>');
    process.exit(1);
  }

  const link = `[[${summaryPath}]]`;
  const content = readConcept(slug);

  // Idempotent check: scope to ## Sources section to avoid false positives
  // from inline prose links that reference the same summary.
  if (sectionContains(content, 'Sources', link)) {
    console.log(`Already present in ${slug}: ${summaryPath}`);
    return;
  }

  const updated = insertBulletInSection(content, 'Sources', `- ${link}`);
  writeConcept(slug, updated);
  console.log(`Inserted source into ${slug}.`);
}

function cmdDeleteSource(args) {
  const [slug, summaryPath] = args;
  if (!slug || !summaryPath) {
    console.error('Usage: node scripts/wiki/wiki-concept.mjs delete-source <slug> <summary-path>');
    process.exit(1);
  }

  const link = `[[${summaryPath}]]`;
  const content = readConcept(slug);
  const { content: updated, found } = deleteBulletFromSection(
    content, 'Sources', line => line.includes(link),
  );

  if (!found) {
    console.log(`Not found in ${slug}: ${summaryPath}`);
    return;
  }

  writeConcept(slug, updated);
  console.log(`Deleted source from ${slug}.`);
}

function cmdInsertConnectedConcept(args) {
  const [slug, linkedSlug, displayName] = args;
  if (!slug || !linkedSlug || !displayName) {
    console.error('Usage: node scripts/wiki/wiki-concept.mjs insert-connected-concept <slug> <linked-slug> <display-name>');
    process.exit(1);
  }

  if (linkedSlug === slug) {
    console.log(`Self-reference skipped: ${slug} → ${linkedSlug}`);
    return;
  }

  const link = `[[Wiki/Concepts/${linkedSlug}|${displayName}]]`;
  const content = readConcept(slug);

  // Idempotent check: scope to ## Connected Concepts section to avoid false
  // positives from inline prose links that reference the same concept.
  if (sectionContains(content, 'Connected Concepts', `[[Wiki/Concepts/${linkedSlug}|`)) {
    console.log(`Already present in ${slug}: ${linkedSlug}`);
    return;
  }

  const updated = insertBulletInSection(
    content,
    'Connected Concepts',
    `- ${link}`,
    { insertBefore: 'Sources' },
  );
  writeConcept(slug, updated);
  console.log(`Inserted connected concept into ${slug}.`);
}

function cmdDeleteConnectedConcept(args) {
  const [slug, linkedSlug] = args;
  if (!slug || !linkedSlug) {
    console.error('Usage: node scripts/wiki/wiki-concept.mjs delete-connected-concept <slug> <linked-slug>');
    process.exit(1);
  }

  const linkWithAlias = `[[Wiki/Concepts/${linkedSlug}|`;
  const linkBare      = `[[Wiki/Concepts/${linkedSlug}]]`;
  const content = readConcept(slug);
  const { content: updated, found } = deleteBulletFromSection(
    content, 'Connected Concepts',
    line => line.includes(linkWithAlias) || line.includes(linkBare),
  );

  if (!found) {
    console.log(`Not found in ${slug}: ${linkedSlug}`);
    return;
  }

  writeConcept(slug, updated);
  console.log(`Deleted connected concept from ${slug}.`);
}

// --- Dispatch ---

const [,, subcommand, ...rest] = process.argv;

switch (subcommand) {
  case 'create':                     cmdCreate(rest); break;
  case 'insert-source':              cmdInsertSource(rest); break;
  case 'delete-source':              cmdDeleteSource(rest); break;
  case 'insert-connected-concept':   cmdInsertConnectedConcept(rest); break;
  case 'delete-connected-concept':   cmdDeleteConnectedConcept(rest); break;
  default:
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Subcommands: create, insert-source, delete-source, insert-connected-concept, delete-connected-concept');
    process.exit(1);
}
