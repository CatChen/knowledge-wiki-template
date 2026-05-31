grep -q "Not found in my-topic" /tmp/stdout.txt || { echo "Expected 'Not found' in stdout"; exit 1; }
