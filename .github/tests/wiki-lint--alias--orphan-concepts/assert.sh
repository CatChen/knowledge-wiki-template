#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'orphan-concepts'" /tmp/stderr.txt
