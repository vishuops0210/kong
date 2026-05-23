// src/components/PostInput.jsx
// ─── POST /input ──────────────────────────────────────────────────
// User fills in message + their identity, clicks Send

import { useState } from "react";
import { postInput } from "../api/kong";
import ResponseBox from "./ResponseBox";

export default function PostInput() {
  const [message, setMessage] = useState("hi");
  const [userId, setUserId] = useState("user-123");
  const [userName, setUserName] = useState("john");

  const [response, setResponse] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const data = await postInput({ message, userId, userName });
      setResponse(data);
      setStatus(200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p style={styles.description}>
        Sends a message to Node.js. Kong verifies your API key, then injects
        consumer headers. Node reads both Kong headers + your user info from the body.
      </p>

      <div style={styles.fieldRow}>
        <div style={styles.field}>
          <label style={styles.label}>message</label>
          <input
            style={styles.input}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="hi"
          />
        </div>
      </div>

      <div style={styles.fieldRow}>
        <div style={styles.field}>
          <label style={styles.label}>userId</label>
          <input
            style={styles.input}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="user-123"
          />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>userName</label>
          <input
            style={styles.input}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="john"
          />
        </div>
      </div>

      <button style={styles.btn} onClick={handleSend} disabled={loading}>
        {loading ? "Sending..." : "Send POST →"}
      </button>

      <ResponseBox
        label="POST /input"
        status={status}
        data={response}
        error={error}
        loading={loading}
      />
    </div>
  );
}

const styles = {
  description: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 16,
    lineHeight: 1.6,
  },
  fieldRow: {
    display: "flex",
    gap: 12,
    marginBottom: 12,
  },
  field: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: "#64748b",
    fontFamily: "monospace",
  },
  input: {
    padding: "7px 10px",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#1e293b",
    outline: "none",
  },
  btn: {
    padding: "8px 18px",
    borderRadius: 8,
    border: "1px solid #cbd5e1",
    background: "#fff",
    fontSize: 13,
    cursor: "pointer",
    color: "#1e293b",
  },
};
