#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'ungrounded-concepts'" /tmp/stderr.txt
