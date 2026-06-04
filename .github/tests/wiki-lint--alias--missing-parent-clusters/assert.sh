#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'missing-parent-clusters'" /tmp/stderr.txt
