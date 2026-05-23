// src/components/GetOutput.jsx
// ─── GET /output ──────────────────────────────────────────────────
// Fetches a greeting from Node. User identity goes as a query param.

import { useState } from "react";
import { getOutput } from "../api/kong";
import ResponseBox from "./ResponseBox";

export default function GetOutput() {
  const [userId, setUserId] = useState("user-123");

  const [response, setResponse] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const data = await getOutput({ userId });
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
        Fetches a "hi" greeting from Node. Kong adds which app is calling via
        headers. Your userId travels as a query param so Node knows who to greet.
      </p>

      <div style={styles.field}>
        <label style={styles.label}>userId (sent as ?userId=...)</label>
        <input
          style={styles.input}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="user-123"
        />
      </div>

      <button style={styles.btn} onClick={handleFetch} disabled={loading}>
        {loading ? "Fetching..." : "Send GET →"}
      </button>

      <ResponseBox
        label="GET /output"
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
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 12,
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
    maxWidth: 280,
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
