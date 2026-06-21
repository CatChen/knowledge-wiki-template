grep -q "exit:1" /tmp/stdout.txt \
  || { echo "Expected exit code 1 in stdout"; exit 1; }

grep -qi "body" /tmp/stderr.txt \
  || { echo "Expected error message about body in stderr"; exit 1; }
