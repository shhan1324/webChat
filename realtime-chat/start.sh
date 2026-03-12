#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  start.sh — realtime-chat 서버 시작 스크립트 (pm2)
#  사용법: bash start.sh [--prod]
# ─────────────────────────────────────────────────────────────
set -e

APP_NAME="realtime-chat"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"   # 스크립트 위치 기준 절대 경로
ENV_MODE="development"

# --prod 플래그 처리
if [[ "$1" == "--prod" ]]; then
  ENV_MODE="production"
fi

echo "================================================"
echo "  Realtime Chat 서버 시작"
echo "  경로    : $APP_DIR"
echo "  환경    : $ENV_MODE"
echo "================================================"

# ── 1. Node.js 확인 ─────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "[ERROR] Node.js가 설치되어 있지 않습니다."
  exit 1
fi
echo "[OK] Node.js $(node -v)"

# ── 2. pm2 확인 및 자동 설치 ─────────────────────────────────
if ! command -v pm2 &> /dev/null; then
  echo "[INFO] pm2가 없습니다. 전역 설치를 시작합니다..."
  npm install -g pm2
fi
echo "[OK] pm2 $(pm2 -v)"

# ── 3. 의존성 설치 ────────────────────────────────────────────
cd "$APP_DIR"
echo "[INFO] npm 패키지 설치 중..."
npm install --omit=dev

# ── 4. 로그 디렉토리 생성 ────────────────────────────────────
mkdir -p "$APP_DIR/logs"

# ── 5. 실행 중인 프로세스 처리 ──────────────────────────────
if pm2 describe "$APP_NAME" &> /dev/null; then
  echo "[INFO] 기존 프로세스를 재시작합니다..."
  if [[ "$ENV_MODE" == "production" ]]; then
    pm2 restart ecosystem.config.js --env production
  else
    pm2 restart ecosystem.config.js
  fi
else
  echo "[INFO] 새 프로세스를 시작합니다..."
  if [[ "$ENV_MODE" == "production" ]]; then
    pm2 start ecosystem.config.js --env production
  else
    pm2 start ecosystem.config.js
  fi
fi

# ── 6. 부팅 시 자동 시작 저장 ───────────────────────────────
pm2 save

# ── 7. 상태 출력 ─────────────────────────────────────────────
echo ""
pm2 status "$APP_NAME"
echo ""
echo "================================================"
echo "  서버가 시작됐습니다."
echo "  로그 확인 : pm2 logs $APP_NAME"
echo "  중지      : pm2 stop $APP_NAME"
echo "================================================"
