const express = require('express');
const app = express();

app.use(express.json());

// ─── Endpoint 1: Takes "hi" as input ─────────────────────────────────────────
// Someone sends: POST /input  with body { "message": "hi" }
// Kong will add X-Consumer-Username header automatically — we read it here
app.post('/input', (req, res) => {
  const { message } = req.body;
  const caller = req.headers['x-consumer-username'] || 'anonymous';
  const callerKey = req.headers['x-consumer-custom-id'] || 'no-id';
  const realIP = req.headers['x-forwarded-for'] || req.ip;

  console.log(`[INPUT] Called by consumer: ${caller} | IP: ${realIP}`);

  if (!message) {
    return res.status(400).json({
      error: 'Send a message in the body: { "message": "hi" }'
    });
  }

  res.json({
    received: message,
    from_consumer: caller,
    consumer_id: callerKey,
    real_ip: realIP,
    note: 'Kong verified your API key before this request reached me!'
  });
});

// ─── Endpoint 2: Gives "hi" as output ────────────────────────────────────────
// Someone sends: GET /output
// Returns a greeting back
app.get('/output', (req, res) => {
  const caller = req.headers['x-consumer-username'] || 'anonymous';
  const callerKey = req.headers['x-consumer-custom-id'] || 'no-id';

  console.log(`[OUTPUT] Called by consumer: ${caller}`);

  res.json({
    message: 'hi',
    greeting_for: caller,
    consumer_id: callerKey,
    note: 'This response came from your Node app — Kong proxied it!'
  });
});

// ─── Health check endpoint (Kong needs this for health checks) ────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// ─── Debug endpoint: shows ALL headers Kong sent us ──────────────────────────
// Very useful for learning — hit this to see exactly what Kong injects
app.get('/debug/headers', (req, res) => {
  res.json({
    message: 'All headers your Node app received (Kong injects the X- ones)',
    headers: req.headers
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Node app running on port ${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /input         - send { "message": "hi" }');
  console.log('  GET  /output        - returns hi');
  console.log('  GET  /health        - for Kong health checks');
  console.log('  GET  /debug/headers - see what Kong injects');
});