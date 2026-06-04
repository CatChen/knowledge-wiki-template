#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'orphan-summaries'" /tmp/stderr.txt
