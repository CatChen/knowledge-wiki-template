#!/usr/bin/env bash
# Integration tests for scripts/wiki/wiki-index.mjs
# Run from the repo root: bash .github/tests/wiki-index.sh
set -euo pipefail

PASS=0
FAIL=0
SCRIPT="node scripts/wiki/wiki-index.mjs"

pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }

cleanup() { rm -rf Wiki/; }

# ── sort ──────────────────────────────────────────────────────────────────────

cleanup
$SCRIPT sort
[ -f Wiki/index.md ] \
  && pass "sort: creates Wiki/index.md when Wiki/ does not exist" \
  || fail "sort: should create Wiki/index.md when Wiki/ does not exist"

cleanup
mkdir -p Wiki
cat > Wiki/index.md << 'EOF'
# Knowledge Base Index

## Concepts

- [[Wiki/Concepts/zebra|Zebra]] — Last alphabetically
- [[Wiki/Concepts/apple|Apple]] — First alphabetically

## Summaries

- [[Wiki/Summaries/z-note.summary]] — Z note
- [[Wiki/Summaries/a-note.summary]] — A note
EOF
$SCRIPT sort
FIRST_CONCEPT=$(grep '^\- \[\[Wiki/Concepts' Wiki/index.md | head -1)
[ "$FIRST_CONCEPT" = "- [[Wiki/Concepts/apple|Apple]] — First alphabetically" ] \
  && pass "sort: concepts sorted alphabetically by display name" \
  || fail "sort: concepts should be sorted alphabetically by display name"
FIRST_SUMMARY=$(grep '^\- \[\[Wiki/Summaries' Wiki/index.md | head -1)
[ "$FIRST_SUMMARY" = "- [[Wiki/Summaries/a-note.summary]] — A note" ] \
  && pass "sort: summaries sorted alphabetically by path" \
  || fail "sort: summaries should be sorted alphabetically by path"

# ── upsert-concept ────────────────────────────────────────────────────────────

cleanup
$SCRIPT upsert-concept "my-topic" "My Topic" "A test concept"
grep -q '\[\[Wiki/Concepts/my-topic|My Topic\]\]' Wiki/index.md \
  && pass "upsert-concept: inserts new concept when index does not exist" \
  || fail "upsert-concept: should insert new concept when index does not exist"

cleanup
$SCRIPT upsert-concept "alpha" "Alpha" "First concept"
$SCRIPT upsert-concept "beta" "Beta" "Second concept"
grep -q 'alpha' Wiki/index.md && grep -q 'beta' Wiki/index.md \
  && pass "upsert-concept: multiple inserts all appear in index" \
  || fail "upsert-concept: multiple inserts should all appear in index"

cleanup
$SCRIPT upsert-concept "my-topic" "My Topic" "Original description"
$SCRIPT upsert-concept "my-topic" "My Topic" "Updated description"
COUNT=$(grep -c 'my-topic' Wiki/index.md)
[ "$COUNT" -eq 1 ] \
  && pass "upsert-concept: updating existing concept does not create duplicate" \
  || fail "upsert-concept: updating existing concept should not create duplicate"
grep -q 'Updated description' Wiki/index.md \
  && pass "upsert-concept: update replaces description" \
  || fail "upsert-concept: update should replace description"

# ── delete-concept ────────────────────────────────────────────────────────────

cleanup
$SCRIPT upsert-concept "to-delete" "To Delete" "Will be removed"
$SCRIPT delete-concept "to-delete"
grep -q 'to-delete' Wiki/index.md \
  && fail "delete-concept: entry should be removed from index" \
  || pass "delete-concept: entry removed from index"

cleanup
$SCRIPT upsert-concept "keep" "Keep" "Stays in index"
$SCRIPT upsert-concept "remove" "Remove" "Gets deleted"
$SCRIPT delete-concept "remove"
grep -q 'keep' Wiki/index.md \
  && pass "delete-concept: other entries unaffected" \
  || fail "delete-concept: other entries should be unaffected"

# ── read-concepts ─────────────────────────────────────────────────────────────

cleanup
OUTPUT=$($SCRIPT read-concepts)
[ -z "$OUTPUT" ] \
  && pass "read-concepts: empty output when index does not exist" \
  || fail "read-concepts: should output nothing when index does not exist"

cleanup
$SCRIPT upsert-concept "foo" "Foo" "Foo concept"
OUTPUT=$($SCRIPT read-concepts)
echo "$OUTPUT" | grep -q 'foo' \
  && pass "read-concepts: outputs inserted concept" \
  || fail "read-concepts: should output inserted concept"

# ── upsert-summary / delete-summary ──────────────────────────────────────────

cleanup
$SCRIPT upsert-summary "Notes/my-note.summary" "My note summary"
grep -q '\[\[Wiki/Summaries/Notes/my-note.summary\]\]' Wiki/index.md \
  && pass "upsert-summary: inserts new summary" \
  || fail "upsert-summary: should insert new summary"

cleanup
$SCRIPT upsert-summary "Notes/my-note.summary" "Original"
$SCRIPT upsert-summary "Notes/my-note.summary" "Updated"
COUNT=$(grep -c 'my-note.summary' Wiki/index.md)
[ "$COUNT" -eq 1 ] \
  && pass "upsert-summary: updating existing summary does not create duplicate" \
  || fail "upsert-summary: updating existing summary should not create duplicate"

cleanup
$SCRIPT upsert-summary "Notes/deleteme.summary" "Delete me"
$SCRIPT delete-summary "Notes/deleteme.summary"
grep -q 'deleteme' Wiki/index.md \
  && fail "delete-summary: entry should be removed" \
  || pass "delete-summary: entry removed from index"

# ── find-missing-summaries / find-missing-concepts ───────────────────────────

cleanup
OUTPUT=$($SCRIPT find-missing-summaries)
[ "$OUTPUT" = "[]" ] \
  && pass "find-missing-summaries: empty array when Wiki/ does not exist" \
  || fail "find-missing-summaries: should return empty array when Wiki/ does not exist"

cleanup
OUTPUT=$($SCRIPT find-missing-concepts)
[ "$OUTPUT" = "[]" ] \
  && pass "find-missing-concepts: empty array when Wiki/ does not exist" \
  || fail "find-missing-concepts: should return empty array when Wiki/ does not exist"

cleanup
mkdir -p Wiki/Summaries/Notes
echo "content" > Wiki/Summaries/Notes/orphan.summary.md
OUTPUT=$($SCRIPT find-missing-summaries)
echo "$OUTPUT" | grep -q 'orphan' \
  && pass "find-missing-summaries: detects summary file not in index" \
  || fail "find-missing-summaries: should detect summary file not in index"

# ── remove-dead-links ─────────────────────────────────────────────────────────

cleanup
$SCRIPT upsert-concept "ghost" "Ghost" "File does not exist on disk"
$SCRIPT remove-dead-links
grep -q 'ghost' Wiki/index.md \
  && fail "remove-dead-links: dead concept link should be removed" \
  || pass "remove-dead-links: dead concept link removed"

cleanup
$SCRIPT upsert-summary "Notes/ghost.summary" "File does not exist on disk"
$SCRIPT remove-dead-links
grep -q 'ghost' Wiki/index.md \
  && fail "remove-dead-links: dead summary link should be removed" \
  || pass "remove-dead-links: dead summary link removed"

# ── summary ───────────────────────────────────────────────────────────────────

cleanup
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
