grep -q "summary file not found" /tmp/stderr.txt || { echo "Expected 'summary file not found' in stderr"; exit 1; }
grep -q "Inserted summary\|Updated summary" /tmp/stdout.txt && { echo "Unexpected success message in stdout"; exit 1; } || true
