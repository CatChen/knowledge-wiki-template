grep -q "Wiki/Summaries/Notes/hello.summary.md" /tmp/stdout.txt \
  || { echo "Expected summary rel-path in stdout"; exit 1; }

SUMMARY="Wiki/Summaries/Notes/hello.summary.md"
[ -f "$SUMMARY" ] || { echo "Summary file not created: $SUMMARY"; exit 1; }

grep -q "source: Notes/hello.md" "$SUMMARY" \
  || { echo "Expected 'source:' frontmatter in summary"; exit 1; }

grep -qF "tags: [test, hello]" "$SUMMARY" \
  || { echo "Expected tags frontmatter in summary"; exit 1; }

grep -q "# Hello World" "$SUMMARY" \
  || { echo "Expected title in summary"; exit 1; }

grep -q "## Summary" "$SUMMARY" \
  || { echo "Expected '## Summary' section in summary"; exit 1; }

grep -q "## Backlinks" "$SUMMARY" \
  || { echo "Expected '## Backlinks' section in summary"; exit 1; }

grep -qF "[[Notes/hello]]" "$SUMMARY" \
  || { echo "Expected backlink to source in summary"; exit 1; }
