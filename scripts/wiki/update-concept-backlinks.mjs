/**
 * Compatibility wrapper for the old backlink update script.
 *
 * Use:
 *   node scripts/wiki/wiki-backlinks.mjs update-after-merge <secondary-path> <primary-path> <primary-display-name>
 */

import { runUpdateAfterMerge } from './wiki-backlinks.mjs';

console.error("Deprecated script 'update-concept-backlinks.mjs'. Use 'wiki-backlinks.mjs update-after-merge' instead.");
runUpdateAfterMerge(process.argv.slice(2));
