#!/usr/bin/env bash
# Integration tests for scripts/wiki/wiki-state.mjs
# Run from the repo root: bash .github/tests/wiki-state.sh
set -euo pipefail

PASS=0
FAIL=0
SCRIPT="node scripts/wiki/wiki-state.mjs"

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

cleanup() { rm -rf Wiki/; }

# ── find-unprocessed-summaries ────────────────────────────────────────────────

cleanup
OUTPUT=$($SCRIPT find-unprocessed-summaries "knowledge-wiki-concept")
[ "$OUTPUT" = "[]" ] \
  && pass "find-unprocessed-summaries: empty array when Wiki/Summaries does not exist" \
  || fail "find-unprocessed-summaries: should return empty array when Wiki/Summaries does not exist"

cleanup
mkdir -p Wiki/Summaries/Notes
cat > Wiki/Summaries/Notes/note-a.summary.md << 'EOF'
---
summarized_at: 2020-01-01T00:00:00.000Z
---
Content of note a.
EOF
OUTPUT=$($SCRIPT find-unprocessed-summaries "knowledge-wiki-concept")
echo "$OUTPUT" | grep -q 'note-a' \
  && pass "find-unprocessed-summaries: returns all summaries on first run (no state)" \
  || fail "find-unprocessed-summaries: should return all summaries on first run"

cleanup
mkdir -p Wiki/Summaries/Notes
cat > Wiki/Summaries/Notes/old.summary.md << 'EOF'
---
summarized_at: 2020-01-01T00:00:00.000Z
---
Old content.
EOF
$SCRIPT set-last-run "knowledge-wiki-concept"
OUTPUT=$($SCRIPT find-unprocessed-summaries "knowledge-wiki-concept")
echo "$OUTPUT" | grep -q 'old' \
  && fail "find-unprocessed-summaries: old summary should be excluded after set-last-run" \
  || pass "find-unprocessed-summaries: old summary excluded after set-last-run"

cleanup
mkdir -p Wiki/Summaries/Notes
cat > Wiki/Summaries/Notes/no-date.summary.md << 'EOF'
# No frontmatter here
Just content.
EOF
$SCRIPT set-last-run "knowledge-wiki-concept"
OUTPUT=$($SCRIPT find-unprocessed-summaries "knowledge-wiki-concept")
echo "$OUTPUT" | grep -q 'no-date' \
  && pass "find-unprocessed-summaries: summary without summarized_at always included" \
  || fail "find-unprocessed-summaries: summary without summarized_at should always be included"

# ── set-last-run ──────────────────────────────────────────────────────────────

cleanup
TIMESTAMP=$($SCRIPT set-last-run "knowledge-wiki-concept")
[ -n "$TIMESTAMP" ] \
  && pass "set-last-run: outputs a timestamp" \
  || fail "set-last-run: should output a timestamp"
[ -f Wiki/.state.json ] \
  && pass "set-last-run: creates Wiki/.state.json" \
  || fail "set-last-run: should create Wiki/.state.json"
grep -q 'knowledge-wiki-concept' Wiki/.state.json \
  && pass "set-last-run: stores skill name in state file" \
  || fail "set-last-run: should store skill name in state file"

# ── dismiss-merge-pair ────────────────────────────────────────────────────────

cleanup
$SCRIPT dismiss-merge-pair "Wiki/Concepts/foo.md" "Wiki/Concepts/bar.md"
grep -q 'dismissedPairs' Wiki/.state.json \
  && pass "dismiss-merge-pair: records dismissed pair in state" \
  || fail "dismiss-merge-pair: should record dismissed pair in state"

cleanup
$SCRIPT dismiss-merge-pair "Wiki/Concepts/foo.md" "Wiki/Concepts/bar.md"
OUTPUT=$($SCRIPT dismiss-merge-pair "Wiki/Concepts/foo.md" "Wiki/Concepts/bar.md")
echo "$OUTPUT" | grep -qi 'already' \
  && pass "dismiss-merge-pair: idempotent on repeated dismissal" \
  || fail "dismiss-merge-pair: should report already dismissed on repeat"

cleanup
$SCRIPT dismiss-merge-pair "Wiki/Concepts/a.md" "Wiki/Concepts/b.md"
COUNT=$(node -e "const s=JSON.parse(require('fs').readFileSync('Wiki/.state.json','utf8')); console.log(s['knowledge-wiki-merge'].dismissedPairs.length)")
[ "$COUNT" -eq 1 ] \
  && pass "dismiss-merge-pair: order-independent (same pair stored once)" \
  || fail "dismiss-merge-pair: same pair in different order should not duplicate"

# ── prune-merge-pairs ─────────────────────────────────────────────────────────

cleanup
$SCRIPT dismiss-merge-pair "Wiki/Concepts/exists.md" "Wiki/Concepts/missing.md"
COUNT=$($SCRIPT prune-merge-pairs)
[ "$COUNT" -eq 1 ] \
  && pass "prune-merge-pairs: removes pair where one file is missing" \
  || fail "prune-merge-pairs: should remove pair where one file is missing"

cleanup
mkdir -p Wiki/Concepts
echo "content" > Wiki/Concepts/exists.md
echo "content" > Wiki/Concepts/also-exists.md
$SCRIPT dismiss-merge-pair "Wiki/Concepts/exists.md" "Wiki/Concepts/also-exists.md"
COUNT=$($SCRIPT prune-merge-pairs)
[ "$COUNT" -eq 0 ] \
  && pass "prune-merge-pairs: keeps pair where both files exist" \
  || fail "prune-merge-pairs: should keep pair where both files exist"

# ── summary ───────────────────────────────────────────────────────────────────

cleanup
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
