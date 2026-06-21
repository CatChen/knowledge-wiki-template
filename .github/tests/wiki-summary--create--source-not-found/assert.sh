grep -qi "not found" /tmp/stderr.txt \
  || { echo "Expected 'not found' error message in stderr"; exit 1; }
