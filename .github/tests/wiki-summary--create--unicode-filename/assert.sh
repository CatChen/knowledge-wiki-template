grep -q "Wiki/Summaries/Notes/It" /tmp/stdout.txt \
  || { echo "Expected summary rel-path in stdout"; exit 1; }

FOUND=$(find "Wiki/Summaries/Notes" -name "It*s Here.summary.md" 2>/dev/null | wc -l)
[ "$FOUND" -ge 1 ] || { echo "Summary file not found at unicode path in Wiki/Summaries/Notes/"; exit 1; }

SUMMARY=$(find "Wiki/Summaries/Notes" -name "It*s Here.summary.md" | head -1)
grep -q "## Backlinks" "$SUMMARY" \
  || { echo "Expected '## Backlinks' section in summary"; exit 1; }
