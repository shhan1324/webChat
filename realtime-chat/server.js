const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const sqlite3  = require('sqlite3').verbose();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ── 디렉토리 보장 ─────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const DATA_DIR   = process.env.DATA_DIR || __dirname;  // Docker 볼륨 마운트 경로
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR,   { recursive: true });

// ── Multer 설정 ───────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file,  cb) => {
    const ext    = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },   // 5 MB
  fileFilter: (_req, file, cb) => {
    ALLOWED_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error('jpg / png / gif / webp 파일만 업로드할 수 있습니다.'));
  },
});

// ── DB 초기화 ──────────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'chat.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) return console.error('[DB] 연결 실패:', err.message);
  console.log('[DB] chat.db 연결 성공');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      room       TEXT    NOT NULL,
      username   TEXT    NOT NULL,
      message    TEXT    NOT NULL,
      type       TEXT    NOT NULL DEFAULT 'text',
      created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 기존 DB에 type 컬럼이 없을 때를 위한 마이그레이션
  db.run(`ALTER TABLE messages ADD COLUMN type TEXT NOT NULL DEFAULT 'text'`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('[DB] 마이그레이션 실패:', err.message);
    }
  });
});

function saveMessage(room, username, message, type = 'text') {
  db.run(
    'INSERT INTO messages (room, username, message, type) VALUES (?, ?, ?, ?)',
    [room, username, message, type],
    (err) => { if (err) console.error('[DB] 저장 실패:', err.message); }
  );
}

function getRecentMessages(room, limit, callback) {
  db.all(
    `SELECT username, message, type, created_at
     FROM (SELECT * FROM messages WHERE room = ? ORDER BY id DESC LIMIT ?)
     ORDER BY id ASC`,
    [room, limit],
    callback
  );
}

// ── 접속자 관리 ───────────────────────────────────────────────────────────────
const roomUsers = new Map();  // room → Map<socketId, nickname>

function addUser(room, socketId, nickname) {
  if (!roomUsers.has(room)) roomUsers.set(room, new Map());
  roomUsers.get(room).set(socketId, nickname);
}

function removeUser(room, socketId) {
  if (!roomUsers.has(room)) return;
  roomUsers.get(room).delete(socketId);
  if (roomUsers.get(room).size === 0) roomUsers.delete(room);
}

function getUserList(room) {
  return roomUsers.has(room) ? Array.from(roomUsers.get(room).values()) : [];
}

function broadcastUserList(room) {
  io.to(room).emit('user list', getUserList(room));
}

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(express.static('public'));
app.use(express.json());

// ── 이미지 업로드 API ─────────────────────────────────────────────────────────
app.post('/upload', upload.single('image'), (req, res) => {
  const { room, nickname } = req.body;

  if (!req.file)     return res.status(400).json({ error: '파일이 없습니다.' });
  if (!room)         return res.status(400).json({ error: 'room이 필요합니다.' });
  if (!nickname)     return res.status(400).json({ error: 'nickname이 필요합니다.' });

  const imageUrl = `/uploads/${req.file.filename}`;

  console.log(`[이미지] [${room}] ${nickname}: ${imageUrl}`);

  saveMessage(room, nickname, imageUrl, 'image');
  io.to(room).emit('chat image', { nickname, imageUrl });

  res.json({ ok: true, imageUrl });
});

// multer 에러 핸들러
app.use((err, _req, res, _next) => {
  console.error('[업로드 오류]', err.message);
  res.status(400).json({ error: err.message });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[연결] ${socket.id}`);

  socket.on('join room', ({ room, nickname }) => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('stop typing', { nickname: socket.nickname });
      removeUser(socket.currentRoom, socket.id);
      broadcastUserList(socket.currentRoom);
      socket.leave(socket.currentRoom);
      io.to(socket.currentRoom).emit('system message', `${socket.nickname}님이 퇴장했습니다.`);
    }

    socket.currentRoom = room;
    socket.nickname    = nickname;
    socket.join(room);
    addUser(room, socket.id, nickname);

    console.log(`[입장] ${nickname}(${socket.id}) → 방: ${room}`);

    getRecentMessages(room, 50, (err, rows) => {
      if (err) console.error('[DB] 조회 실패:', err.message);

      socket.emit('room joined', {
        room,
        nickname,
        history:  rows || [],
        userList: getUserList(room),
      });

      io.to(room).emit('system message', `${nickname}님이 입장했습니다.`);
      broadcastUserList(room);
    });
  });

  socket.on('chat message', ({ message }) => {
    const { currentRoom: room, nickname } = socket;
    if (!room || !nickname) return;

    console.log(`[메시지] [${room}] ${nickname}: ${message}`);
    saveMessage(room, nickname, message, 'text');
    io.to(room).emit('chat message', { nickname, message });
  });

  socket.on('typing', () => {
    const { currentRoom: room, nickname } = socket;
    if (!room || !nickname) return;
    socket.to(room).emit('typing', { nickname });
  });

  socket.on('stop typing', () => {
    const { currentRoom: room, nickname } = socket;
    if (!room || !nickname) return;
    socket.to(room).emit('stop typing', { nickname });
  });

  socket.on('disconnect', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('stop typing', { nickname: socket.nickname });
      removeUser(socket.currentRoom, socket.id);
      broadcastUserList(socket.currentRoom);
      io.to(socket.currentRoom).emit('system message', `${socket.nickname}님이 퇴장했습니다.`);
      console.log(`[해제] ${socket.nickname} (방: ${socket.currentRoom})`);
    } else {
      console.log(`[해제] ${socket.id}`);
    }
  });
});

// ── 서버 시작 ─────────────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`서버 실행 중: http://${HOST}:${PORT}`);
});
