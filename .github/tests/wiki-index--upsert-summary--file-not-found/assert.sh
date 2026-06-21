grep -q "summary file not found" /tmp/stdout.txt || { echo "Expected 'summary file not found' in output"; exit 1; }
grep -q "exit_code=1" /tmp/stdout.txt || { echo "Expected exit code 1"; exit 1; }
grep -q "Inserted summary\|Updated summary" /tmp/stdout.txt && { echo "Unexpected success message in output"; exit 1; } || true
