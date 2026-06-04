#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'remove-dead-links'" /tmp/stderr.txt
