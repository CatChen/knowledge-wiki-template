#!/usr/bin/env bash
set -euo pipefail
grep -q "Deprecated command 'thin-concepts'" /tmp/stderr.txt
