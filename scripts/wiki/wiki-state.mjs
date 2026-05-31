/**
 * wiki-state.mjs
 *
 * Reads and writes Wiki/.state.json.
 * Skills should call this instead of reading/writing .state.json directly.
 *
 * Usage:
 *   node scripts/wiki/wiki-state.mjs find-unprocessed-summaries <skill-name>
 *   node scripts/wiki/wiki-state.mjs set-last-run <skill-name>
 *   node scripts/wiki/wiki-state.mjs dismiss-merge-pair <pathA> <pathB>
 *   node scripts/wiki/wiki-state.mjs prune-merge-pairs
 *   node scripts/wiki/wiki-state.mjs dismiss-cluster-parent <implied-parent>
 *   node scripts/wiki/wiki-state.mjs prune-cluster-parents
 *
 * <skill-name> — the skill identifier, e.g. "knowledge-wiki-concept"
 * <pathA/pathB> — relative concept file paths, e.g. "Wiki/Concepts/foo.md"
 *
 * find-unprocessed-summaries prints a JSON array of summary file paths (relative
 *   to the knowledge root) that the skill has not yet processed — i.e. those
 *   created or updated since the skill's last run. On the first run (no stored
 *   timestamp), all summary files are returned. Summary files with no
 *   summarized_at frontmatter field are always included.
 * set-last-run writes the current ISO timestamp and prints it.
 * dismiss-merge-pair adds a concept pair to the dismissed list so it is never
 *   shown again by knowledge-wiki-merge. Passing the paths in either order
 *   produces the same result.
 * prune-merge-pairs removes dismissed pairs where at least one concept file no
 *   longer exists. Prints the count of removed pairs.
 * dismiss-cluster-parent adds an implied-parent slug to the dismissed list so it is
 *   never shown again by knowledge-wiki-cluster.
 * prune-cluster-parents removes dismissed parent slugs whose concept file now
 *   exists on disk (cluster was resolved), or whose descendant concepts ({slug}-*.md)
 *   are all gone. Prints the count of removed entries.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WIKI_SUMMARIES_DIR = path.join(KNOWLEDGE_DIR, 'Wiki', 'Summaries');
const STATE_FILE = path.join(KNOWLEDGE_DIR, 'Wiki', '.state.json');

const [subcommand, ...args] = process.argv.slice(2);

if (!subcommand) {
  console.error('Usage: node scripts/wiki/wiki-state.mjs <find-unprocessed-summaries|set-last-run|dismiss-merge-pair|prune-merge-pairs|dismiss-cluster-parent|prune-cluster-parents> [args]');
  process.exit(1);
}

const state = fs.existsSync(STATE_FILE)
  ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  : {};

function saveState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

if (subcommand === 'find-unprocessed-summaries') {
  const [skillName] = args;
  if (!skillName) {
    console.error('Usage: node scripts/wiki/wiki-state.mjs find-unprocessed-summaries <skill-name>');
    process.exit(1);
  }

  const lastRunAt = state[skillName]?.last_run_at ?? null;
  const lastRunTime = lastRunAt ? new Date(lastRunAt).getTime() : null;

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

  function parseSummarizedAt(content) {
    if (!content.startsWith('---\n')) return null;
    const end = content.indexOf('\n---\n', 4);
    if (end === -1) return null;
    const frontmatter = content.slice(4, end);
    const match = frontmatter.match(/^summarized_at:\s*(.+)$/m);
    return match ? match[1].trim() : null;
  }

  const result = [];
  if (!fs.existsSync(WIKI_SUMMARIES_DIR)) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  for (const fullPath of findSummaryFiles(WIKI_SUMMARIES_DIR)) {
    const relPath = path.relative(KNOWLEDGE_DIR, fullPath);
    if (lastRunTime === null) {
      result.push(relPath);
      continue;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    const summarizedAt = parseSummarizedAt(content);
    if (!summarizedAt || new Date(summarizedAt).getTime() > lastRunTime) {
      result.push(relPath);
    }
  }
  console.log(JSON.stringify(result, null, 2));

} else if (subcommand === 'set-last-run') {
  const [skillName] = args;
  if (!skillName) {
    console.error('Usage: node scripts/wiki/wiki-state.mjs set-last-run <skill-name>');
    process.exit(1);
  }
  if (!state[skillName]) state[skillName] = {};
  state[skillName].last_run_at = new Date().toISOString();
  saveState();
  console.log(state[skillName].last_run_at);

} else if (subcommand === 'dismiss-merge-pair') {
  const [pathA, pathB] = args;
  if (!pathA || !pathB) {
    console.error('Usage: node scripts/wiki/wiki-state.mjs dismiss-merge-pair <pathA> <pathB>');
    process.exit(1);
  }
  const normalizedPair = [pathA, pathB].sort();
  const pairKey = normalizedPair.join('|');

  if (!state['knowledge-wiki-merge']) state['knowledge-wiki-merge'] = {};
  if (!state['knowledge-wiki-merge'].dismissedPairs) state['knowledge-wiki-merge'].dismissedPairs = [];

  const existing = state['knowledge-wiki-merge'].dismissedPairs;
  const alreadyDismissed = existing.some(([a, b]) => [a, b].sort().join('|') === pairKey);

  if (!alreadyDismissed) {
    existing.push(normalizedPair);
    saveState();
    console.log(`Dismissed: ${normalizedPair[0]} / ${normalizedPair[1]}`);
  } else {
    console.log(`Already dismissed: ${normalizedPair[0]} / ${normalizedPair[1]}`);
  }

} else if (subcommand === 'prune-merge-pairs') {
  const pairs = state?.['knowledge-wiki-merge']?.dismissedPairs ?? [];
  const kept = [];
  let removedCount = 0;

  for (const pair of pairs) {
    const missing = pair.some(p => !fs.existsSync(path.join(KNOWLEDGE_DIR, p)));
    if (missing) {
      removedCount++;
    } else {
      kept.push(pair);
    }
  }

  if (removedCount > 0) {
    state['knowledge-wiki-merge'].dismissedPairs = kept;
    saveState();
  }
  console.log(removedCount);

} else if (subcommand === 'dismiss-cluster-parent') {
  const [impliedParent] = args.map(a => a.trim());
  if (!impliedParent) {
    console.error('Usage: node scripts/wiki/wiki-state.mjs dismiss-cluster-parent <implied-parent>');
    process.exit(1);
  }

  if (!state['knowledge-wiki-cluster']) state['knowledge-wiki-cluster'] = {};
  if (!state['knowledge-wiki-cluster'].dismissedParents) state['knowledge-wiki-cluster'].dismissedParents = [];

  const dismissed = state['knowledge-wiki-cluster'].dismissedParents;
  if (!dismissed.includes(impliedParent)) {
    dismissed.push(impliedParent);
    saveState();
    console.log(`Dismissed cluster: ${impliedParent}`);
  } else {
    console.log(`Already dismissed: ${impliedParent}`);
  }

} else if (subcommand === 'prune-cluster-parents') {
  const parents = state?.['knowledge-wiki-cluster']?.dismissedParents ?? [];
  const kept = [];
  let removedCount = 0;

  const conceptsDir = path.join(KNOWLEDGE_DIR, 'Wiki', 'Concepts');
  const allConcepts = fs.existsSync(conceptsDir)
    ? new Set(fs.readdirSync(conceptsDir).filter(f => f.endsWith('.md')))
    : new Set();

  for (const slug of parents) {
    const parentFileExists = allConcepts.has(`${slug}.md`);
    const hasDescendants = [...allConcepts].some(f => f.startsWith(`${slug}-`) && f.endsWith('.md'));
    if (parentFileExists || !hasDescendants) {
      removedCount++;
    } else {
      kept.push(slug);
    }
  }

  if (removedCount > 0) {
    state['knowledge-wiki-cluster'].dismissedParents = kept;
    saveState();
  }
  console.log(removedCount);

} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  process.exit(1);
}
