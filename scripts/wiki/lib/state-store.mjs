import fs from 'fs';
import path from 'path';
import { STATE_FILE } from './paths.mjs';

export function readState() {
  return fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    : {};
}

export function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

export function sortedPair(pathA, pathB) {
  return [pathA, pathB].sort();
}

export function pairKey(pathA, pathB) {
  return sortedPair(pathA, pathB).join('|');
}

export function dismissedPairSet(state, skillName) {
  return new Set(
    (state[skillName]?.dismissedPairs ?? [])
      .filter((entry) => Array.isArray(entry) && entry.length === 2)
      .map(([a, b]) => pairKey(a, b)),
  );
}

export function isPairDismissed(state, skillName, pathA, pathB) {
  return dismissedPairSet(state, skillName).has(pairKey(pathA, pathB));
}
