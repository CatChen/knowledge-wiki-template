#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'duplicate-concept-links'" /tmp/stderr.txt
