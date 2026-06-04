#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'broken-concept-links'" /tmp/stderr.txt
