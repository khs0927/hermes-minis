#!/bin/sh
# VPS bootstrap for Ubuntu — copies this repo as the Minis Hermes
# environment to /var/minis/shared/hermes-minis and wires the
# hermes-minis CLI + systemd unit for 24/7 uptime.
set -eu

fail() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "root로 실행하세요 (sudo)."
if [ -f /etc/os-release ]; then
  . /etc/os-release
  [ "${ID:-}" = "ubuntu" ] || fail "Ubuntu 전용 스크립트입니다 (감지: ${ID:-unknown})."
else
  fail "/etc/os-release 없음 — Ubuntu인지 확인할 수 없습니다."
fi

command -v python3 >/dev/null 2>&1 || { apt-get update && apt-get install -y python3 curl git; }
command -v git >/dev/null 2>&1 || { apt-get update && apt-get install -y git; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="/var/minis/shared/hermes-minis"
HERMES_HOME="${HERMES_HOME:-/root/.hermes}"

mkdir -p "$INSTALL_DIR" "$HERMES_HOME/logs" "$HERMES_HOME/bin"
cp -r "$REPO_ROOT"/hermes* "$REPO_ROOT"/minis-start-gateway.sh "$HERMES_HOME/bin/"
chmod +x "$HERMES_HOME"/bin/hermes* "$HERMES_HOME"/bin/minis-start-gateway.sh
cp -r "$REPO_ROOT" "$INSTALL_DIR/repo"

if [ ! -f "$HERMES_HOME/.env" ]; then
  printf '%s\n' \
    "TELEGRAM_BOT_TOKEN=" \
    "TELEGRAM_ALLOWED_USERS=" \
    "NVIDIA_API_KEY=${NVIDIA_API_KEY:-}" \
    "AEROLINK_API_KEY=${AEROLINK_API_KEY:-}" \
    "SMITHERY_API_KEY=${SMITHERY_API_KEY:-}" >"$HERMES_HOME/.env"
  chmod 600 "$HERMES_HOME/.env"
  echo "템플릿 생성: $HERMES_HOME/.env (값을 채우세요)"
fi

cat >/etc/systemd/system/hermes-minis.service <<UNIT
[Unit]
Description=Hermes Minis Telegram gateway
After=network-online.target

[Service]
Type=simple
Environment=HERMES_HOME=$HERMES_HOME
ExecStart=$HERMES_HOME/bin/hermes-minis start
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable hermes-minis >/dev/null

if grep -q "^TELEGRAM_BOT_TOKEN=.\+" "$HERMES_HOME/.env" 2>/dev/null; then
  systemctl restart hermes-minis
  sleep 3
  "$HERMES_HOME/bin/hermes-minis" status || true
else
  echo "프로비저닝 완료 (미기동). 다음 순서로 시작하세요:"
  echo "  1) $HERMES_HOME/.env 에 키 입력"
  echo "  2) $HERMES_HOME/bin/hermes-minis configure-telegram"
  echo "  3) systemctl start hermes-minis"
fi
