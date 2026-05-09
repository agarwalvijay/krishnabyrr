#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# wa-check — quick visibility into WhatsApp message attempts
#
# Usage:
#   ./scripts/wa-check.sh                    # last 20 attempts (any status)
#   ./scripts/wa-check.sh -n 50              # last 50 attempts
#   ./scripts/wa-check.sh -f                 # only failures (default 20)
#   ./scripts/wa-check.sh -p 9810902065      # by phone (last 10/14 digits ok)
#   ./scripts/wa-check.sh -s                 # status counts in last 24h
#   ./scripts/wa-check.sh -t kb_login_link   # only one template
#   ./scripts/wa-check.sh -h <hours>         # last N hours window (default 24)
#
# Combine flags: -f -p 9810902065 -h 6
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Locate api/.env (try both layouts: ./api or ../api relative to script) ───
ENV_FILE=""
for try in \
  "$HOME/krishnabyrr/api/.env" \
  "$(dirname "$0")/../api/.env" \
  "./api/.env"
do
  if [[ -f "$try" ]]; then
    ENV_FILE="$try"
    break
  fi
done

if [[ -z "$ENV_FILE" ]]; then
  echo "Error: could not find api/.env. Run from the repo root or set DATABASE_URL." >&2
  exit 1
fi

DATABASE_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')"

if [[ -z "$DATABASE_URL" ]]; then
  echo "Error: DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

# ── Defaults ──────────────────────────────────────────────────────────────────

LIMIT=20
HOURS=24
PHONE=""
TEMPLATE=""
ONLY_FAILED=0
SHOW_COUNTS=0

# ── Parse args ────────────────────────────────────────────────────────────────

while getopts ":n:p:t:h:fs" opt; do
  case "$opt" in
    n) LIMIT="$OPTARG" ;;
    p) PHONE="$OPTARG" ;;
    t) TEMPLATE="$OPTARG" ;;
    h) HOURS="$OPTARG" ;;
    f) ONLY_FAILED=1 ;;
    s) SHOW_COUNTS=1 ;;
    \?) echo "Unknown flag: -$OPTARG" >&2; exit 2 ;;
    :)  echo "Flag -$OPTARG requires an argument" >&2; exit 2 ;;
  esac
done

# ── Build WHERE clause ────────────────────────────────────────────────────────

WHERE="created_at > NOW() - INTERVAL '${HOURS} hours'"
if [[ "$ONLY_FAILED" == "1" ]]; then
  WHERE="$WHERE AND status = 'failed'"
fi
if [[ -n "$PHONE" ]]; then
  # Match against last 10 digits to handle both 9810... and 919810... forms
  PHONE_DIGITS="$(echo "$PHONE" | tr -cd '0-9')"
  PHONE_LAST10="${PHONE_DIGITS: -10}"
  WHERE="$WHERE AND phone LIKE '%${PHONE_LAST10}'"
fi
if [[ -n "$TEMPLATE" ]]; then
  WHERE="$WHERE AND template_name = '${TEMPLATE}'"
fi

# ── Output ────────────────────────────────────────────────────────────────────

echo
echo "┌─ WhatsApp message log ──────────────────────────────────────────────────┐"
printf "  Window:      last %d hour(s)\n" "$HOURS"
[[ -n "$PHONE"    ]] && printf "  Phone:       *%s\n" "$PHONE_LAST10"
[[ -n "$TEMPLATE" ]] && printf "  Template:    %s\n" "$TEMPLATE"
[[ "$ONLY_FAILED" == "1" ]] && printf "  Status:      failed only\n"
echo "└─────────────────────────────────────────────────────────────────────────┘"

# Always show counts summary at the top
echo
echo "── Status summary ──"
psql "$DATABASE_URL" --no-align --field-separator='  ' --quiet --tuples-only -c "
  SELECT
    rpad(status, 12, ' ') AS s,
    COUNT(*)
  FROM whatsapp_notifications
  WHERE $WHERE
  GROUP BY status
  ORDER BY COUNT(*) DESC;
" | sed 's/^/  /'

# If -s was passed, stop here — caller only wants the summary.
if [[ "$SHOW_COUNTS" == "1" ]]; then
  echo
  exit 0
fi

# Detailed rows
echo
echo "── Recent attempts (newest first, limit ${LIMIT}) ──"
psql "$DATABASE_URL" --quiet -c "
  SELECT
    to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH24:MI:SS') AS at_ist,
    phone,
    template_name,
    status,
    COALESCE(LEFT(error_msg, 60), '')          AS error
  FROM whatsapp_notifications
  WHERE $WHERE
  ORDER BY created_at DESC
  LIMIT ${LIMIT};
"

# Show top failure reason if anything failed in the window
FAIL_COUNT=$(psql "$DATABASE_URL" -tA -c "
  SELECT COUNT(*) FROM whatsapp_notifications
  WHERE $WHERE AND status = 'failed';
")

if [[ "${FAIL_COUNT:-0}" -gt 0 ]]; then
  echo
  echo "── Failure reasons ──"
  psql "$DATABASE_URL" --quiet -c "
    SELECT
      COUNT(*)                      AS n,
      LEFT(error_msg, 80)           AS reason
    FROM whatsapp_notifications
    WHERE $WHERE AND status = 'failed'
    GROUP BY error_msg
    ORDER BY COUNT(*) DESC
    LIMIT 5;
  "
fi

echo
