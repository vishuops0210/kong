// src/components/Health.jsx
import { useState } from "react";
import { getHealth } from "../api/kong";
import ResponseBox from "./ResponseBox";

export default function Health() {
  const [response, setResponse] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const data = await getHealth();
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
        No API key needed — your kong.yaml has a separate route for /health with
        no key-auth plugin. Kong lets it through without checking credentials.
      </p>

      <button style={styles.btn} onClick={handleCheck} disabled={loading}>
        {loading ? "Checking..." : "Check health →"}
      </button>

      <ResponseBox
        label="GET /health"
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
  btn: { padding: "8px 18px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13, cursor: "pointer", color: "#1e293b" },
};
