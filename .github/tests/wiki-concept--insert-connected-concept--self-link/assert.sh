grep -q "Self-reference skipped" /tmp/stdout.txt || { echo "Expected 'Self-reference skipped' in stdout"; exit 1; }
