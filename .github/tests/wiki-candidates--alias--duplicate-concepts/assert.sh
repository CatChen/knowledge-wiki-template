#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'duplicate-concepts'" /tmp/stderr.txt
