grep -q "Not found in foo" /tmp/stdout.txt || { echo "Expected 'Not found' in stdout"; exit 1; }
