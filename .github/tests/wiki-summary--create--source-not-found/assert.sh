grep -q "exit:1" /tmp/stdout.txt \
  || { echo "Expected exit code 1 in stdout"; exit 1; }

grep -qi "not found" /tmp/stderr.txt \
  || { echo "Expected 'not found' error message in stderr"; exit 1; }
