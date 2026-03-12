# ── 빌드 스테이지 ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# 패키지 파일만 먼저 복사해 레이어 캐시 활용
COPY package*.json ./
RUN npm ci --omit=dev

# ── 런타임 스테이지 ───────────────────────────────────────────────────────────
FROM node:20-alpine

# 보안: root 대신 전용 유저로 실행
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# 빌드 스테이지에서 node_modules만 복사
COPY --from=builder /app/node_modules ./node_modules

# 소스 복사 (node_modules 제외 → .dockerignore 참조)
COPY . .

# 필요 디렉토리 미리 생성 (볼륨 마운트 전 권한 확보)
RUN mkdir -p /app/data /app/public/uploads \
    && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "server.js"]
