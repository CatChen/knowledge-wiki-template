#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'broken-summary-links'" /tmp/stderr.txt
