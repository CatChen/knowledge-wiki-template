grep -q "Wiki/Concepts/my-topic.md" /tmp/stdout.txt || { echo "Expected rel path in stdout"; exit 1; }
