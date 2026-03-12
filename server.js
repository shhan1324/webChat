require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ─── SQLite 초기화 ────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'chat.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    room       TEXT    NOT NULL,
    sender_id  TEXT    NOT NULL,
    nickname   TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

const stmtInsert = db.prepare(
  'INSERT INTO messages (room, sender_id, nickname, message) VALUES (?, ?, ?, ?)'
);

const stmtHistory = db.prepare(
  `SELECT nickname, message, created_at
   FROM (
     SELECT * FROM messages WHERE room = ?
     ORDER BY id DESC LIMIT 20
   ) ORDER BY id ASC`
);

// ─── 정적 파일 ────────────────────────────────────────────────────────────────
app.use(express.static('public'));

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[연결] ${socket.id}`);

  // 방 입장
  socket.on('join room', ({ room, nickname }) => {
    // 기존 방 퇴장
    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
      io.to(socket.currentRoom).emit('system message', `${socket.nickname}님이 퇴장했습니다.`);
    }

    socket.currentRoom = room;
    socket.nickname = nickname;
    socket.join(room);

    console.log(`[입장] ${nickname}(${socket.id}) → 방: ${room}`);

    // 이전 메시지 20개 전송 (입장한 클라이언트에게만)
    const history = stmtHistory.all(room);
    socket.emit('message history', history);

    // 같은 방 사람들에게 입장 알림
    io.to(room).emit('system message', `${nickname}님이 입장했습니다.`);
  });

  // 메시지 수신 → 저장 → 방 브로드캐스트
  socket.on('chat message', (msg) => {
    const { currentRoom: room, nickname } = socket;
    if (!room || !nickname) return;

    console.log(`[메시지] [${room}] ${nickname}: ${msg}`);

    stmtInsert.run(room, socket.id, nickname, msg);

    io.to(room).emit('chat message', { nickname, message: msg });
  });

  socket.on('disconnect', () => {
    if (socket.currentRoom) {
      io.to(socket.currentRoom).emit('system message', `${socket.nickname}님이 퇴장했습니다.`);
    }
    console.log(`[해제] ${socket.id}`);
  });
});

// ─── 서버 시작 ────────────────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`서버 실행 중: http://${HOST}:${PORT}`);
});
