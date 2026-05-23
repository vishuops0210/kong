// src/api/kong.js
// ─────────────────────────────────────────────────────────────────
// All calls to Kong live here. Import these in your components.
// Kong URL and API key come from .env — never hardcode them.
// ─────────────────────────────────────────────────────────────────

const KONG_URL = process.env.REACT_APP_KONG_URL;
const KONG_KEY = process.env.REACT_APP_KONG_KEY;

// Base headers attached to every request
const baseHeaders = {
  "Content-Type": "application/json",
  "x-api-key": KONG_KEY, // ← Kong validates this, then strips it before hitting Node
};

// ─── POST /input ──────────────────────────────────────────────────
// Sends a message along with user identity to the backend
export async function postInput({ message, userId, userName }) {
  const res = await fetch(`${KONG_URL}/input`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ message, userId, userName }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── GET /output ──────────────────────────────────────────────────
// Fetches a greeting — passes userId as a query param
export async function getOutput({ userId }) {
  const params = new URLSearchParams({ userId });
  const res = await fetch(`${KONG_URL}/output?${params}`, {
    headers: baseHeaders,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── GET /health ──────────────────────────────────────────────────
// No API key needed — Kong skips auth for this route
export async function getHealth() {
  const res = await fetch(`${KONG_URL}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── GET /debug/headers ───────────────────────────────────────────
// Shows what Kong injected — only works in dev (NODE_ENV !== production)
export async function getDebugHeaders() {
  const res = await fetch(`${KONG_URL}/debug/headers`, {
    headers: baseHeaders,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} — is NODE_ENV set to production?`);
  return res.json();
}
