// src/components/DebugHeaders.jsx
import { useState } from "react";
import { getDebugHeaders } from "../api/kong";
import ResponseBox from "./ResponseBox";

export default function DebugHeaders() {
  const [response, setResponse] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const data = await getDebugHeaders();
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
        Shows every header Kong injected into the request. Look for{" "}
        <code style={styles.code}>x-consumer-username</code> and{" "}
        <code style={styles.code}>x-consumer-custom-id</code> — those are Kong's
        additions. Returns 404 if <code style={styles.code}>NODE_ENV=production</code>.
      </p>

      <button style={styles.btn} onClick={handleFetch} disabled={loading}>
        {loading ? "Fetching..." : "Fetch headers →"}
      </button>

      <ResponseBox
        label="GET /debug/headers"
        status={status}
        data={response}
        error={error}
        loading={loading}
      />
    </div>
  );
}

const styles = {
  description: { fontSize: 13, color: "#64748b", marginBottom: 16, lineHeight: 1.6 },
  code: { fontFamily: "monospace", background: "#f1f5f9", padding: "1px 5px", borderRadius: 4, fontSize: 12 },
  btn: { padding: "8px 18px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, cursor: "pointer", color: "#1e293b" },
};
