# Realtime Chat

Node.js + Socket.IO 기반 실시간 채팅 애플리케이션

---

## 목차

1. [기술 스택](#기술-스택)
2. [프로젝트 구조](#프로젝트-구조)
3. [주요 기능](#주요-기능)
4. [아키텍처](#아키텍처)
5. [Socket.IO 이벤트](#socketio-이벤트)
6. [REST API](#rest-api)
7. [데이터베이스](#데이터베이스)
8. [환경 변수](#환경-변수)
9. [실행 방법](#실행-방법)
10. [배포](#배포)
11. [보안](#보안)

---

## 기술 스택

### Backend
| 항목 | 기술 |
|---|---|
| 런타임 | Node.js 20 |
| 웹 프레임워크 | Express.js ^5.2.1 |
| 실시간 통신 | Socket.IO ^4.8.3 |
| 데이터베이스 | SQLite3 ^5.1.7 |
| 파일 업로드 | Multer ^2.1.1 |

### Frontend
| 항목 | 기술 |
|---|---|
| UI 프레임워크 | Tailwind CSS (CDN) |
| 실시간 통신 | Socket.IO Client |
| 상태 관리 | Vanilla JS + localStorage |

### DevOps
| 항목 | 기술 |
|---|---|
| 컨테이너 | Docker (Multi-stage build) |
| 오케스트레이션 | Docker Compose |
| 웹 서버 | Nginx 1.27 (리버스 프록시) |
| 프로세스 관리 | PM2 |

---

## 프로젝트 구조

```
realtime-chat/
├── server.js                 # Express + Socket.IO 서버
├── package.json              # 의존성 및 스크립트
├── Dockerfile                # 멀티스테이지 Docker 빌드
├── docker-compose.yml        # 앱 + Nginx 서비스 정의
├── nginx.conf                # 리버스 프록시 설정
├── ecosystem.config.js       # PM2 프로세스 설정
├── start.sh                  # 로컬 PM2 시작 스크립트
├── .dockerignore
└── public/
    ├── index.html            # 클라이언트 UI (단일 파일)
    └── uploads/              # 업로드 이미지 저장 (런타임 생성)
```

---

## 주요 기능

### 채팅
- 다중 채팅방 — `socket.join(room)`으로 방별 메시지 격리
- 메시지 히스토리 — 입장 시 최근 50개 메시지 자동 로드
- 이미지 공유 — JPG / PNG / GIF / WebP, 최대 5MB

### 사용자
- 닉네임 설정 — 최초 접속 시 모달로 입력, localStorage에 저장
- 참여자 사이드바 — 현재 방 접속자 실시간 표시 (닉네임 기반 색상 아바타)
- 입력 중 표시 — 상대방이 입력 중일 때 `...` 애니메이션 표시

### UI
- 카카오톡 스타일 말풍선 — 내 메시지(오른쪽/노랑), 상대 메시지(왼쪽/흰색)
- 스마트 자동 스크롤 — 하단 80px 이내일 때만 자동 스크롤
- URL 파라미터 — `?room=이름`으로 특정 방 바로 입장
- 시스템 메시지 — 입장/퇴장 알림

---

## 아키텍처

```
Browser
  │  HTTP / WebSocket
  ▼
Nginx :80
  ├─ /           → proxy_pass http://app:3000
  └─ /socket.io/ → proxy_pass http://app:3000 (WS Upgrade)
       │
       ▼
Node.js :3000
  ├─ Express  — POST /upload, Static /public
  ├─ Socket.IO — 실시간 이벤트 처리
  ├─ SQLite   — 메시지 영속성
  └─ Multer   — 이미지 파일 저장

Data Layer (Docker Named Volumes)
  ├─ db_data      → /app/data/chat.db
  └─ uploads_data → /app/public/uploads
```

### 접속자 관리 자료구조

```
roomUsers: Map<room, Map<socketId, nickname>>
```

방별로 소켓 ID와 닉네임을 매핑하여 입장/퇴장 시 즉시 갱신

---

## Socket.IO 이벤트

### 클라이언트 → 서버

| 이벤트 | 데이터 | 설명 |
|---|---|---|
| `join room` | `{ room, nickname }` | 방 입장 요청 |
| `chat message` | `{ message }` | 텍스트 메시지 전송 |
| `typing` | — | 입력 시작 알림 |
| `stop typing` | — | 입력 중단 알림 |

### 서버 → 클라이언트

| 이벤트 | 데이터 | 설명 |
|---|---|---|
| `room joined` | `{ room, nickname, history[], userList[] }` | 입장 완료 + 히스토리 |
| `chat message` | `{ nickname, message }` | 수신 메시지 |
| `chat image` | `{ nickname, imageUrl }` | 수신 이미지 |
| `user list` | `string[]` | 현재 접속자 목록 |
| `typing` | `{ nickname }` | 상대방 입력 중 |
| `stop typing` | `{ nickname }` | 상대방 입력 중단 |
| `system message` | `string` | 입장/퇴장 알림 |

---

## REST API

### `POST /upload`

이미지 파일 업로드

**요청** `multipart/form-data`

| 필드 | 타입 | 설명 |
|---|---|---|
| `image` | File | 이미지 파일 (JPG/PNG/GIF/WebP, 최대 5MB) |
| `room` | string | 전송 대상 채팅방 |
| `nickname` | string | 발신자 닉네임 |

**응답**

```json
{ "ok": true, "imageUrl": "/uploads/1234567890-123456789.png" }
```

업로드 성공 시 해당 `room`에 `chat image` 이벤트를 브로드캐스트

---

## 데이터베이스

### messages 테이블

```sql
CREATE TABLE messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room       TEXT    NOT NULL,
  username   TEXT    NOT NULL,
  message    TEXT    NOT NULL,           -- 텍스트 내용 또는 이미지 경로
  type       TEXT    NOT NULL DEFAULT 'text',  -- 'text' | 'image'
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

- 방 입장 시 `SELECT ... ORDER BY id DESC LIMIT 50`으로 최근 50개 조회
- 이미지 메시지는 `message` 컬럼에 `/uploads/파일명` 경로 저장

---

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 리스닝 포트 |
| `HOST` | `0.0.0.0` | 바인드 주소 |
| `NODE_ENV` | `development` | 실행 환경 |
| `DB_PATH` | `./chat.db` | SQLite DB 파일 경로 |
| `DATA_DIR` | `./` | 데이터 디렉토리 (DB 저장 위치) |

---

## 실행 방법

### 로컬 (PM2)

```bash
# 개발 환경
bash start.sh

# 프로덕션 환경
bash start.sh --prod

# 주요 PM2 명령어
pm2 logs realtime-chat     # 로그 확인
pm2 restart realtime-chat  # 재시작
pm2 stop realtime-chat     # 중지
pm2 monit                  # 모니터링
```

### 로컬 (직접 실행)

```bash
npm install
node server.js
```

---

## 배포

### Docker Compose (권장)

```bash
# 빌드 및 백그라운드 실행
docker-compose up -d --build

# 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs -f app
docker-compose logs -f nginx

# 중지 (데이터 유지)
docker-compose down

# 중지 + 데이터 초기화
docker-compose down -v
```

### Ubuntu 방화벽 설정

```bash
sudo ufw allow 80/tcp
sudo ufw status
```

### Nginx 단독 사용 (Docker 미사용 시)

```bash
sudo cp nginx.conf /etc/nginx/sites-available/realtime-chat
sudo ln -s /etc/nginx/sites-available/realtime-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 보안

| 항목 | 내용 |
|---|---|
| 파일 업로드 MIME 검증 | `image/jpeg`, `image/png`, `image/gif`, `image/webp`만 허용 |
| 파일 크기 제한 | 5MB (Multer), 10MB (Nginx) |
| SQL 인젝션 방지 | SQLite3 파라미터화된 쿼리 (`?` 바인딩) |
| Docker 비root 실행 | `appuser:appgroup` 전용 계정으로 실행 |
| 포트 격리 | Node.js 3000 포트는 Docker 내부 전용, 외부는 Nginx 80만 노출 |
| 헬스체크 | 30초 간격, 3회 실패 시 컨테이너 비정상 처리 |
