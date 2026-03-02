import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database('cipherlink.db');
const JWT_SECRET = process.env.JWT_SECRET || 'hacker-secret-key-1337';

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create uploads directory:', err);
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    avatar_url TEXT
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    description TEXT,
    can_post_role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER,
    user_id INTEGER,
    content TEXT,
    type TEXT DEFAULT 'text', -- 'text', 'image', 'video', 'file', 'poll'
    file_url TEXT,
    poll_data TEXT,
    is_pinned INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(channel_id) REFERENCES channels(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    subscription TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS poll_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER,
    user_id INTEGER,
    option_index INTEGER,
    UNIQUE(message_id, user_id),
    FOREIGN KEY(message_id) REFERENCES messages(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Seed default admin if they don't exist
const seed = () => {
  const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('al1bek');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('bolotbek743', 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('al1bek', hashedPassword, 'admin');
  }
};
seed();

// One-time cleanup: remove old seeded system channels
['general', 'POSTS'].forEach(name => {
  const ch: any = db.prepare('SELECT id FROM channels WHERE name = ?').get(name);
  if (ch) {
    db.prepare('DELETE FROM poll_votes WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)').run(ch.id);
    db.prepare('DELETE FROM messages WHERE channel_id = ?').run(ch.id);
    db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
  }
});

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });



  app.use(express.json());
  app.use('/uploads', express.static(uploadDir));

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  const isAdmin = (req: any, res: any, next: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  };

  // API Routes
  app.post('/api/admin/create-user', authenticate, isAdmin, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    try {
      const hashedPassword = bcrypt.hashSync(password, 10);
      const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashedPassword, 'user');
      res.json({ success: true, userId: result.lastInsertRowid });
    } catch (err) {
      res.status(400).json({ error: 'Username already exists' });
    }
  });

  app.post('/api/user/change-password', authenticate, (req: any, res: any) => {
    const { oldPassword, newPassword } = req.body;
    try {
      const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
        return res.status(401).json({ error: 'Incorrect old password' });
      }
      const hashedPassword = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'Failed to change password' });
    }
  });

  // Public registration is disabled — accounts are created by admins only
  app.post('/api/auth/register', (_req, res) => {
    res.status(403).json({ error: 'Регистрация закрыта. Аккаунт выдаёт администратор.' });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });

  app.post('/api/user/update', authenticate, (req: any, res: any) => {
    const { username, avatar_url } = req.body;
    try {
      if (username) {
        db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id);
      }
      if (avatar_url) {
        db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatar_url, req.user.id);
      }
      const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, avatar_url: user.avatar_url }, JWT_SECRET);
      res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar_url: user.avatar_url } });
    } catch (err) {
      res.status(400).json({ error: 'Username already taken' });
    }
  });

  app.post('/api/messages/:id/vote', authenticate, (req: any, res: any) => {
    const { id } = req.params;
    const { optionIndex } = req.body;
    const userId = req.user.id;

    try {
      const voteTransaction = db.transaction(() => {
        const message: any = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        if (!message || message.type !== 'poll') throw new Error('Poll not found');

        // 1. Update/Insert the vote
        const existingVote: any = db.prepare('SELECT id FROM poll_votes WHERE message_id = ? AND user_id = ?').get(id, userId);
        if (existingVote) {
          db.prepare('UPDATE poll_votes SET option_index = ? WHERE id = ?').run(optionIndex, existingVote.id);
        } else {
          db.prepare('INSERT INTO poll_votes (message_id, user_id, option_index) VALUES (?, ?, ?)').run(id, userId, optionIndex);
        }

        // 2. Recalculate all votes for this poll to ensure absolute accuracy
        const voteCounts: any[] = db.prepare('SELECT option_index, COUNT(*) as count FROM poll_votes WHERE message_id = ? GROUP BY option_index').all(id);

        let pollData = JSON.parse(message.poll_data);
        // Reset all counts
        pollData.options.forEach((opt: any) => opt.votes = 0);
        // Apply fresh counts from the vote records
        voteCounts.forEach((vc: any) => {
          if (pollData.options[vc.option_index]) {
            pollData.options[vc.option_index].votes = vc.count;
          }
        });

        const newPollData = JSON.stringify(pollData);
        db.prepare('UPDATE messages SET poll_data = ? WHERE id = ?').run(newPollData, id);
        return { newPollData };
      });

      const { newPollData } = voteTransaction();
      broadcast({ type: 'poll_vote', messageId: parseInt(id), pollData: newPollData, optionIndex, userId });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Vote error:', err);
      res.status(400).json({ error: err.message || 'Failed to cast vote' });
    }
  });

  app.get('/api/channels', authenticate, (_req, res) => {
    const channels = db.prepare('SELECT * FROM channels ORDER BY created_at ASC').all();
    res.json(channels);
  });

  app.post('/api/channels', authenticate, isAdmin, (req, res) => {
    const { name, description, can_post_role } = req.body;
    try {
      const role = can_post_role === 'admin' ? 'admin' : 'user';
      const result = db.prepare('INSERT INTO channels (name, description, can_post_role) VALUES (?, ?, ?)').run(name, description, role);
      const newChannel = { id: result.lastInsertRowid, name, description, can_post_role: role };
      broadcast({ type: 'channel_created', channel: newChannel });
      res.json(newChannel);
    } catch (err) {
      res.status(400).json({ error: 'Channel already exists' });
    }
  });

  app.post('/api/channels/:id', authenticate, isAdmin, (req, res) => {
    const { id } = req.params;
    const { name, description, can_post_role } = req.body;
    try {
      const role = can_post_role === 'admin' ? 'admin' : 'user';
      db.prepare('UPDATE channels SET name = ?, description = ?, can_post_role = ? WHERE id = ?').run(name, description, role, id);
      const updatedChannel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
      broadcast({ type: 'channel_updated', channel: updatedChannel });
      res.json(updatedChannel);
    } catch (err) {
      res.status(400).json({ error: 'Update failed' });
    }
  });

  app.delete('/api/channels/:id', authenticate, isAdmin, (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM messages WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM channels WHERE id = ?').run(id);
    broadcast({ type: 'channel_deleted', id: parseInt(id) });
    res.json({ success: true });
  });

  app.get('/api/channels/:id/messages', authenticate, (req: any, res: any) => {
    const messages = db.prepare(`
      SELECT m.*, u.username,
      (SELECT option_index FROM poll_votes WHERE message_id = m.id AND user_id = ?) as user_vote
      FROM messages m 
      JOIN users u ON m.user_id = u.id 
      WHERE m.channel_id = ? 
      ORDER BY m.timestamp ASC
    `).all(req.user.id, req.params.id);
    res.json(messages);
  });

  app.post('/api/messages/:id/pin', authenticate, (req, res) => {
    const { id } = req.params;
    const { is_pinned } = req.body;
    db.prepare('UPDATE messages SET is_pinned = ? WHERE id = ?').run(is_pinned ? 1 : 0, id);
    broadcast({ type: 'message_pinned', messageId: parseInt(id), isPinned: !!is_pinned });
    res.json({ success: true });
  });

  app.delete('/api/messages/:id', authenticate, (req: any, res: any) => {
    const { id } = req.params;
    const message: any = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    // Admins can delete any message; users can only delete their own
    if (req.user.role !== 'admin' && message.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    db.prepare('DELETE FROM poll_votes WHERE message_id = ?').run(id);
    db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    broadcast({ type: 'message_deleted', messageId: parseInt(id) });
    res.json({ success: true });
  });

  app.post('/api/upload', authenticate, multer({ storage }).single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ fileUrl });
  });

  // Invitation keys removed.

  // WebSocket Logic
  const clients = new Map<WebSocket, any>();

  wss.on('connection', (ws) => {
    ws.on('message', (message) => {
      let data;
      try {
        data = JSON.parse(message.toString());
      } catch (e) {
        return;
      }

      if (data.type === 'auth') {
        try {
          const decoded = jwt.verify(data.token, JWT_SECRET);
          clients.set(ws, decoded);
        } catch (err) {
          ws.close();
        }
      }

      if (data.type === 'message') {
        const user = clients.get(ws);
        if (!user) return;

        const channel: any = db.prepare('SELECT * FROM channels WHERE id = ?').get(data.channelId);
        if (channel.can_post_role === 'admin' && user.role !== 'admin') {
          return ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized to post in this channel' }));
        }

        const result = db.prepare('INSERT INTO messages (channel_id, user_id, content, type, file_url, poll_data) VALUES (?, ?, ?, ?, ?, ?)').run(
          data.channelId,
          user.id,
          data.content || '',
          data.msgType || 'text',
          data.fileUrl || null,
          data.pollData ? JSON.stringify(data.pollData) : null
        );
        const newMessage = {
          id: result.lastInsertRowid,
          channel_id: data.channelId,
          user_id: user.id,
          username: user.username,
          content: data.content,
          type: data.msgType || 'text',
          file_url: data.fileUrl || null,
          poll_data: data.pollData ? JSON.stringify(data.pollData) : null,
          is_pinned: 0,
          timestamp: new Date().toISOString()
        };
        broadcast({ type: 'new_message', message: newMessage });
      }

      if (['call-offer', 'call-answer', 'ice-candidate', 'call-hangup'].includes(data.type)) {
        const sender = clients.get(ws);
        if (!sender) return;

        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ ...data, from: sender.username, fromId: sender.id }));
          }
        });
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  function broadcast(data: any) {
    const payload = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;

  // Global Error Handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SECTOR ONE Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
