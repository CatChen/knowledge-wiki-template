grep -qi "body" /tmp/stderr.txt \
  || { echo "Expected error message about body in stderr"; exit 1; }
