/**
 * wiki-state.mjs
 *
 * Reads and writes Wiki/.state.json.
 * Skills should call this instead of reading/writing .state.json directly.
 *
 * Usage:
 *   node scripts/wiki/wiki-state.mjs find-unprocessed-summaries <skill-name>
 *   node scripts/wiki/wiki-state.mjs set-last-run <skill-name>
 *   node scripts/wiki/wiki-state.mjs dismiss-pair <skill-name> <pathA> <pathB>
 *   node scripts/wiki/wiki-state.mjs prune-merge-pairs
 *   node scripts/wiki/wiki-state.mjs prune-cluster-pairs
 *
 * <skill-name> — the skill identifier. find-unprocessed-summaries and set-last-run
 *   accept LAST_RUN_SKILLS ("knowledge-wiki-concept", "knowledge-wiki-synthesis").
 *   dismiss-pair accepts DISMISSED_PAIRS_SKILLS ("knowledge-wiki-merge",
 *   "knowledge-wiki-cluster").
 * <pathA/pathB> — relative concept file paths, e.g. "Wiki/Concepts/foo.md"
 *
 * find-unprocessed-summaries prints a JSON array of summary file paths (relative
 *   to the knowledge root) that the skill has not yet processed — i.e. those
 *   created or updated since the skill's last run. On the first run (no stored
 *   timestamp), all summary files are returned. Summary files with no
 *   summarized_at frontmatter field are always included.
 * set-last-run writes the current ISO timestamp and prints it.
 * dismiss-pair adds a concept pair to the skill's dismissed list so it is never
 *   shown again. The <skill-name> key is created automatically in .state.json
 *   if it does not exist yet (e.g. "knowledge-wiki-merge",
 *   "knowledge-wiki-cluster"). Passing the paths in either order produces the
 *   same result.
 * prune-merge-pairs removes knowledge-wiki-merge dismissed pairs where at least
 *   one concept file no longer exists. Prints the count of removed pairs.
 * prune-cluster-pairs removes knowledge-wiki-cluster dismissed pairs where the
 *   child concept file no longer exists. The child is identified by slug prefix
 *   relationship, not sort order. Parent absence is legitimate (pair may have
 *   been recorded before the parent was created). Prints the count of removed pairs.
 */

import fs from 'fs';
import path from 'path';
import { KNOWLEDGE_DIR, STATE_FILE, SUMMARIES_DIR } from './lib/paths.mjs';
import { readState, saveState, pairKey, sortedPair } from './lib/state-store.mjs';

// Skills that use last_run_at tracking and unprocessed-summary detection.
const LAST_RUN_SKILLS = new Set([
  'knowledge-wiki-concept',
  'knowledge-wiki-synthesis',
]);

// Skills that maintain a dismissedPairs list; the only ones valid for dismiss-pair.
const DISMISSED_PAIRS_SKILLS = new Set([
  'knowledge-wiki-merge',
  'knowledge-wiki-cluster',
]);

const [subcommand, ...args] = process.argv.slice(2);

if (!subcommand) {
  console.error('Usage: node scripts/wiki/wiki-state.mjs <find-unprocessed-summaries|set-last-run|dismiss-pair|prune-merge-pairs|prune-cluster-pairs> [args]');
  process.exit(1);
}

const state = readState();

if (subcommand === 'find-unprocessed-summaries') {
  const [skillName] = args;
  if (!skillName) {
    console.error('Usage: node scripts/wiki/wiki-state.mjs find-unprocessed-summaries <skill-name>');
    process.exit(1);
  }
  if (!LAST_RUN_SKILLS.has(skillName)) {
    console.error(`Unknown skill: ${skillName}. Allowed: ${[...LAST_RUN_SKILLS].join(', ')}`);
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
  if (!fs.existsSync(SUMMARIES_DIR)) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  for (const fullPath of findSummaryFiles(SUMMARIES_DIR)) {
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
  if (!LAST_RUN_SKILLS.has(skillName)) {
    console.error(`Unknown skill: ${skillName}. Allowed: ${[...LAST_RUN_SKILLS].join(', ')}`);
    process.exit(1);
  }
  if (!state[skillName]) state[skillName] = {};
  state[skillName].last_run_at = new Date().toISOString();
  saveState(state);
  console.log(state[skillName].last_run_at);

} else if (subcommand === 'dismiss-pair') {
  const [skillName, pathA, pathB] = args;
  if (!skillName || !pathA || !pathB) {
    console.error('Usage: node scripts/wiki/wiki-state.mjs dismiss-pair <skill-name> <pathA> <pathB>');
    process.exit(1);
  }
  if (!DISMISSED_PAIRS_SKILLS.has(skillName)) {
    console.error(`Unknown skill: ${skillName}. Allowed: ${[...DISMISSED_PAIRS_SKILLS].join(', ')}`);
    process.exit(1);
  }
  const normalizedPair = sortedPair(pathA, pathB);
  const normalizedPairKey = pairKey(pathA, pathB);

  if (!state[skillName]) state[skillName] = {};
  if (!state[skillName].dismissedPairs) state[skillName].dismissedPairs = [];

  const existing = state[skillName].dismissedPairs;
  const alreadyDismissed = existing.some(([a, b]) => pairKey(a, b) === normalizedPairKey);

  if (!alreadyDismissed) {
    existing.push(normalizedPair);
    saveState(state);
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
    saveState(state);
  }
  console.log(removedCount);

} else if (subcommand === 'prune-cluster-pairs') {
  const pairs = state?.['knowledge-wiki-cluster']?.dismissedPairs ?? [];
  const kept = [];
  let removedCount = 0;

  for (const pair of pairs) {
    const [pathA, pathB] = pair;
    const slugA = path.basename(pathA, '.md');
    const slugB = path.basename(pathB, '.md');
    let childPath;
    if (slugA.startsWith(slugB + '-')) {
      childPath = pathA;
    } else if (slugB.startsWith(slugA + '-')) {
      childPath = pathB;
    } else {
      kept.push(pair);
      continue;
    }
    const childExists = fs.existsSync(path.join(KNOWLEDGE_DIR, childPath));
    if (!childExists) {
      removedCount++;
    } else {
      kept.push(pair);
    }
  }

  if (removedCount > 0) {
    if (!state['knowledge-wiki-cluster']) state['knowledge-wiki-cluster'] = {};
    state['knowledge-wiki-cluster'].dismissedPairs = kept;
    saveState(state);
  }
  console.log(removedCount);

} else {
  console.error(`Unknown subcommand: ${subcommand}`);
  process.exit(1);
}
