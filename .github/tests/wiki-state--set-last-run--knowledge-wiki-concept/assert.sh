#!/usr/bin/env bash
# Assertions for wiki-state.mjs set-last-run knowledge-wiki-concept.
# stdout is available in /tmp/stdout.txt.
set -euo pipefail

# Wiki/.state.json must exist with the right skill key and a last_run_at value.
jq -e '."knowledge-wiki-concept".last_run_at | type == "string"' Wiki/.state.json > /dev/null

# stdout must be a valid ISO 8601 timestamp (the same value written to state).
TIMESTAMP=$(cat /tmp/stdout.txt | tr -d '[:space:]')
node -e "if (isNaN(Date.parse(process.argv[1]))) { console.error('Invalid timestamp: ' + process.argv[1]); process.exit(1); }" "$TIMESTAMP"
