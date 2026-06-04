#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'self-links'" /tmp/stderr.txt
