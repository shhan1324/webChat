# 프로젝트 구조 및 코드 분석 보고서

본 보고서는 `webChat` 프로젝트의 구조, 사용 기술, 주요 기능 및 코드 로직을 상세히 분석한 결과입니다.

## 1. 프로젝트 개요
이 프로젝트는 **Node.js, Express, Socket.io, SQLite**를 기반으로 한 실시간 채팅 애플리케이션입니다. 현재 프로젝트 내부에는 두 가지 형태의 구현체가 존재합니다.

1.  **기본 버전 (Root)**: 간단한 실시간 채팅 기능을 제공하는 베이스라인 모델.
2.  **심화 버전 (`realtime-chat` 디렉토리)**: 이미지 업로드, 입력 중 표시, 접속자 목록 등 확장 기능과 Docker 환경을 갖춘 고도화 모델.

---

## 2. 전체 디렉토리 구조

```text
webChat/
├── server.js               # [Root] 메인 서버 (기본 버전)
├── package.json            # [Root] 프로젝트 설정 및 의존성
├── public/                 # [Root] 정적 파일 (기본 버전 클라이언트)
│   └── index.html
├── realtime-chat/          # [심화 버전] 고도화된 채팅 앱 소스
│   ├── server.js           # 심화 버전 서버
│   ├── package.json        # 심화 버전 전용 의존성
│   ├── Dockerfile          # 컨테이너화 설정
│   ├── nginx.conf          # Nginx 역방향 프록시 설정
│   └── public/             # 심화 버전 클라이언트 (Tailwind CSS 기반)
│       ├── index.html
│       └── uploads/        # 업로드된 이미지가 저장되는 폴더
├── ecosystem.config.js     # PM2 프로세스 관리 설정
└── chat.db                 # SQLite 데이터베이스 파일 (실행 시 생성)
```

---

## 3. 기술 스택 분석

### 프레임워크 (Frameworks)
-   **Node.js**: 서버 런타임 환경.
-   **Express**: 웹 서버 개발을 위한 미니멀리스트 프레임워크.
-   **Socket.io**: 실시간 웹 프레임워크 (WebSocket 레이어).
-   **Tailwind CSS (심화 버전)**: 유틸리티 우선(Utility-first) CSS 프레임워크.

### 데이터베이스 (Database)
-   **SQLite (`better-sqlite3` / `sqlite3`)**: 서버리스, 설치가 필요 없는 파일 기반 경량 RDBMS.
    -   기본 버전: `better-sqlite3` 사용.
    -   심화 버전: `sqlite3` (verbose) 사용.

### 배포 플랫폼 (Deployment)
-   **PM2**: Node.js 애플리케이션의 프로세스 매니저 (무중단 운영, 로깅).
-   **Docker**: 컨테이너 기반 가상화 플랫폼 (`Dockerfile`, `docker-compose.yml` 지원).
-   **Nginx**: 정적 파일 서빙 및 리버스 프록시 서버 설정 포함.

---

## 4. 주요 코드 로직 분석

### 4.1 실시간 통신 (Socket.io)
서버와 클라이언트는 특정 이벤트를 주고받으며 작동합니다.
-   `join room`: 특정 채팅방 입장 처리.
-   `chat message`: 메시지 전송 및 브로드캐스트.
-   `typing` / `stop typing` (심화): 상대방의 입력 상태 공유.
-   `user list` (심화): 방별 현재 접속자 명단 동기화.

### 4.2 데이터 관리 (SQLite)
채팅 내역은 SQLite에 저장되어 새로고침 시에도 이전 대화(History)를 불러올 수 있습니다.
-   `messages` 테이블 구조: `id`, `room`, `username`, `message`, `type`, `created_at`.
-   입장 시 최신 20~50개의 메시지를 쿼리하여 클라이언트에 전송합니다.

### 4.3 이미지 업로드 (심화 버전 전용)
-   클라이언트가 이미지를 선택하면 `/upload` 엔드포인트로 POST 요청을 보냅니다.
-   서버는 `multer`를 통해 파일을 `public/uploads`에 저장하고, 해당 URL을 소켓을 통해 방 전체에 알립니다.

---

## 5. 실행 및 배포 환경
-   **PM2**: `ecosystem.config.js`를 통해 무중단 서비스 운영 및 로그 관리가 가능하도록 구성되어 있습니다.
-   **Docker (심화 버전)**: `Dockerfile`과 `docker-compose.yml`이 포함되어 있어 컨테이너 기반 배포가 용이합니다.
-   **Nginx**: 배포 환경에서 정적 파일 서비스 및 리버스 프록시를 위한 설정이 준비되어 있습니다.

---

## 6. 결론
이 프로젝트는 기본적인 소켓 통신 예제부터 실제 서비스 운영에 필요한 이미지 처리, 사용자 관리, 배포 설정까지 단계별로 잘 구성되어 있습니다. 특히 `realtime-chat` 디렉토리의 심화 버전은 현대적인 웹 개발 패턴(Tailwind, Dockerization)을 충실히 따르고 있습니다.
