#!/usr/bin/env bash
# Drive the dsh Web UI as a systemd user service, so it keeps running after the
# terminal closes. Foreground use without systemd stays available through `run`.
set -euo pipefail

unit=dsh-web.service
unit_file="$HOME/.config/systemd/user/$unit"
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
port=${DSH_WEB_PORT:-3080}

usage() {
  cat >&2 <<'EOF'
Usage: ./start.sh [start|stop|restart|status|logs|run]
  start (default)  start the service and print the Web UI URL
  stop | restart   stop the service, or restart it and print the URL
  status           show the service state and its last URL
  logs             follow the service journal
  run              run dsh web in this terminal; Ctrl+C stops it
EOF
  exit 2
}

url_of_service() {
  local -a since=()
  [[ -z ${1:-} ]] || since=(--since "@$1")
  journalctl --user -u "$unit" "${since[@]}" --no-pager -o cat 2>/dev/null \
    | grep -o 'dsh web: http://[^ ]*' | tail -1 | cut -d' ' -f3- || true
}

serve() {
  [[ -f "$unit_file" ]] || { echo "missing unit file: $unit_file" >&2; exit 1; }
  systemctl --user daemon-reload
  if systemctl --user is-active --quiet "$unit"; then
    if [[ $1 = start ]]; then
      echo "already serving: $(url_of_service)"
      return
    fi
  else
    local holder
    holder=$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 || true)
    if [[ -n "$holder" ]]; then
      echo "port $port is held by ${holder#pid=} outside this service" >&2
      echo 'stop that dsh instance, or set DSH_WEB_PORT before starting.' >&2
      exit 1
    fi
  fi
  local marked
  marked=$(date +%s)
  systemctl --user "$1" "$unit"
  local deadline=$((SECONDS + 90))
  while ((SECONDS < deadline)); do
    local url
    url=$(url_of_service "$marked")
    if [[ -n "$url" ]] && systemctl --user is-active --quiet "$unit"; then
      echo "$url"
      echo "journal: $0 logs"
      return
    fi
    if systemctl --user is-failed --quiet "$unit"; then
      systemctl --user status "$unit" --no-pager
      exit 1
    fi
    sleep 0.5
  done
  echo "$unit did not report a URL within 90s: $0 status" >&2
  exit 1
}

case ${1:-start} in
start) serve start ;;
restart) serve restart ;;
stop) systemctl --user stop "$unit" ;;
status)
  systemctl --user status "$unit" --no-pager
  url_of_service
  ;;
logs) exec journalctl --user -u "$unit" -f ;;
run) cd "$repo" && exec pnpm dsh web ;;
*) usage ;;
esac
