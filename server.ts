import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '2mb' }));

  // Ephemeral in-memory mailbox for 6-digit WebRTC P2P signaling
  interface SignalingRoom {
    code: string;
    offer: string;
    answer?: string;
    createdAt: number;
  }
  const p2pRooms = new Map<string, SignalingRoom>();

  // Cleanup rooms older than 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of p2pRooms.entries()) {
      if (now - room.createdAt > 10 * 60 * 1000) {
        p2pRooms.delete(code);
      }
    }
  }, 60 * 1000);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // 1. Create 6-Digit P2P Room (Sender)
  app.post('/api/p2p/create-room', (req, res) => {
    try {
      const { offer } = req.body;
      if (!offer || typeof offer !== 'string') {
        res.status(400).json({ error: 'Missing WebRTC offer string' });
        return;
      }

      // Generate a unique 6-digit numeric pairing code (100000 - 999999)
      let code = '';
      let attempts = 0;
      do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        attempts++;
      } while (p2pRooms.has(code) && attempts < 20);

      p2pRooms.set(code, {
        code,
        offer,
        createdAt: Date.now(),
      });

      res.json({ code, expiresInSeconds: 600 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Fetch Offer by 6-Digit Code (Receiver)
  app.get('/api/p2p/room/:code', (req, res) => {
    const code = req.params.code?.replace(/\D/g, '');
    const room = p2pRooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found or code expired. Please request a new 6-digit code.' });
      return;
    }
    res.json({
      code: room.code,
      offer: room.offer,
      hasAnswer: !!room.answer,
    });
  });

  // 3. Submit Answer for 6-Digit Room (Receiver)
  app.post('/api/p2p/room/:code/answer', (req, res) => {
    const code = req.params.code?.replace(/\D/g, '');
    const { answer } = req.body;
    const room = p2pRooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found or code expired' });
      return;
    }
    if (!answer || typeof answer !== 'string') {
      res.status(400).json({ error: 'Missing WebRTC answer string' });
      return;
    }
    room.answer = answer;
    res.json({ status: 'ok' });
  });

  // 4. Poll for Answer (Sender)
  app.get('/api/p2p/room/:code/answer', (req, res) => {
    const code = req.params.code?.replace(/\D/g, '');
    const room = p2pRooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room expired or closed' });
      return;
    }
    res.json({ answer: room.answer || null });
  });

  // Zero-Auth Public Chunk Proxy:
  // Proxies Google Drive binary chunk downloads server-side to completely bypass browser CORS limitations.
  app.get('/api/public-chunk', async (req, res) => {
    try {
      const fileId = req.query.fileId as string;
      if (!fileId || typeof fileId !== 'string') {
        res.status(400).send('Missing required fileId query parameter');
        return;
      }

      // 1. Direct usercontent export download (fastest, standard for Google Drive public files)
      const primaryUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0`;
      let driveRes = await fetch(primaryUrl, { redirect: 'follow' });

      // 2. Secondary fallback via uc?export=download with confirm token
      if (!driveRes.ok) {
        const fallbackUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
        driveRes = await fetch(fallbackUrl, { redirect: 'follow' });
      }

      // 3. Third fallback for files with confirm warnings
      if (!driveRes.ok) {
        const altUrl = `https://drive.google.com/uc?id=${encodeURIComponent(fileId)}&export=download`;
        driveRes = await fetch(altUrl, { redirect: 'follow' });
      }

      if (!driveRes.ok) {
        res.status(driveRes.status).send(`Upstream chunk retrieval failed with status ${driveRes.status}. Make sure the file has public link permissions.`);
        return;
      }

      const contentType = driveRes.headers.get('content-type') || 'application/octet-stream';
      if (contentType.toLowerCase().includes('text/html')) {
        res.status(404).send('Google Drive returned an HTML error/warning page instead of chunk binary data (file likely deleted or not public).');
        return;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const arrayBuffer = await driveRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error('Public chunk proxy server error:', err);
      res.status(500).send(`Failed to proxy chunk: ${err.message}`);
    }
  });

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
