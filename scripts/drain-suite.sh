#!/bin/bash
# Runs the three quiet drain tests one after another (about 3 hours at the default), each with --yes so none waits for
# a typed answer. Run it on battery power (the tests refuse on USB or AC power), and keep the Mac awake:
#
#   caffeinate -i scripts/drain-suite.sh            # one hour each
#   HOURS=2 caffeinate -i scripts/drain-suite.sh    # two hours each
#
# If the panel cannot reach this Mac at the address the script picks (a VPN address, say), name the address it can:
#   PUBLIC_HOST=192.168.1.20 caffeinate -i scripts/drain-suite.sh
#
# The results (a FINDING line per test) are also appended to drain-suite.log. Settings come from .env.
cd "$(dirname "$0")/.." || exit 1
LOG="${LOG:-drain-suite.log}"
for cfg in content-sleep mdc-sleep content-touched; do
  echo "=== $cfg: $(date) ===" | tee -a "$LOG"
  python3 scripts/panel_lab.py --yes --hours "${HOURS:-1}" --config "$cfg" --http-port "${HTTP_PORT:-8099}" ${PUBLIC_HOST:+--public-host "$PUBLIC_HOST"} test drain 2>&1 | tee -a "$LOG"
  rc=${PIPESTATUS[0]}
  [ "$rc" -ne 0 ] && echo "*** $cfg did NOT complete (exit $rc): nothing was measured for it ***" | tee -a "$LOG"
done
echo "=== done: $(date) ===" | tee -a "$LOG"
grep -h -A1 "FINDING: drain" "$LOG" | tail -12
