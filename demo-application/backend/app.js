const express = require('express');
const app = express();

app.use(express.json());

// ─── Helper: extract Kong consumer info (which APP is calling) ────────────────
function getConsumerInfo(req) {
  return {
    app: req.headers['x-consumer-username'] || 'anonymous',      // e.g. "web-frontend"
    appId: req.headers['x-consumer-custom-id'] || 'no-id',       // e.g. "frontend-001"
    realIP: req.headers['x-forwarded-for'] || req.ip,
  };
}

// ─── Endpoint 1: Takes "hi" as input ─────────────────────────────────────────
// Kong adds which APP is calling via headers automatically.
// Your frontend passes which USER is calling in the request body.
app.post('/input', (req, res) => {
  const { message, userId, userName } = req.body;       // ← your app sends user info
  const consumer = getConsumerInfo(req);                // ← Kong sends app info

  console.log(`[INPUT] App: ${consumer.app} | User: ${userName || 'unknown'} | IP: ${consumer.realIP}`);

  if (!message) {
    return res.status(400).json({
      error: 'Send a message in the body: { "message": "hi", "userId": "123", "userName": "john" }'
    });
  }

  res.json({
    received: message,

    // Which APPLICATION called Kong (set in kong.yaml consumers)
    calling_app: consumer.app,
    calling_app_id: consumer.appId,

    // Which USER is inside that app (your app passes this — Kong doesn't know)
    user_id: userId || 'not-provided',
    user_name: userName || 'not-provided',

    real_ip: consumer.realIP,
    note: 'Kong verified the app key. Your app told us who the user is.'
  });
});

// ─── Endpoint 2: Gives "hi" as output ────────────────────────────────────────
app.get('/output', (req, res) => {
  const consumer = getConsumerInfo(req);
  // For GET requests, user identity comes from query params if needed
  const userId = req.query.userId || 'not-provided';

  console.log(`[OUTPUT] App: ${consumer.app} | User: ${userId} | IP: ${consumer.realIP}`);

  res.json({
    message: 'hi',

    // App-level info (from Kong)
    calling_app: consumer.app,
    calling_app_id: consumer.appId,

    // User-level info (from query param your frontend sends)
    greeting_for_user: userId,

    note: `Kong knows "${consumer.app}" called. Only you know which user it was.`
  });
});

// ─── Health check (Kong polls this — no auth required) ───────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// ─── Debug: see everything Kong injects ──────────────────────────────────────
// Gate this behind an env variable — never expose in production
app.get('/debug/headers', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const consumer = getConsumerInfo(req);

  res.json({
    explanation: {
      'x-consumer-username':  'Which APP is calling (web-frontend / mobile-app / etc.)',
      'x-consumer-custom-id': 'That app\'s custom ID from kong.yaml',
      'x-forwarded-for':      'Real IP of the caller (Kong adds this)',
      'your_user_info':       'NOT in headers — your frontend must send userId in body/query'
    },
    parsed_consumer: consumer,
    all_headers: req.headers
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Node app running on port ${PORT}`);
  console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log('Endpoints:');
  console.log('  POST /input                            - body: { message, userId, userName }');
  console.log('  GET  /output?userId=123                - returns hi + who it\'s for');
  console.log('  GET  /health                           - Kong health checks');
  console.log('  GET  /debug/headers  (dev only)        - see what Kong injects');
});