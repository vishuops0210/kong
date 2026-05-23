// src/components/ResponseBox.jsx
// Displays the JSON response from Kong/Node in a styled box

export default function ResponseBox({ label, status, data, error, loading }) {
  const getStatusStyle = () => {
    if (loading) return styles.statusLoading;
    if (error) return styles.statusError;
    if (status >= 200 && status < 300) return styles.statusOk;
    return styles.statusError;
  };

  const getStatusText = () => {
    if (loading) return "loading...";
    if (error) return "error";
    return `${status} OK`;
  };

  const getBody = () => {
    if (loading) return "Calling Kong...";
    if (error) return `Error: ${error}\n\nMake sure:\n• Kong is running\n• REACT_APP_KONG_URL is correct in .env\n• API key matches kong.yaml`;
    if (!data) return "// response will appear here";
    return JSON.stringify(data, null, 2);
  };

  return (
    <div style={styles.box}>
      <div style={styles.header}>
        <span style={styles.label}>{label || "response"}</span>
        <span style={{ ...styles.badge, ...getStatusStyle() }}>{getStatusText()}</span>
      </div>
      <pre style={styles.body}>{getBody()}</pre>
    </div>
  );
}

const styles = {
  box: {
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    overflow: "hidden",
    marginTop: 16,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 14px",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
  },
  label: {
    fontSize: 12,
    color: "#64748b",
    fontFamily: "monospace",
  },
  badge: {
    fontSize: 11,
    padding: "2px 10px",
    borderRadius: 99,
    fontFamily: "monospace",
  },
  statusOk: {
    background: "#dcfce7",
    color: "#166534",
  },
  statusError: {
    background: "#fee2e2",
    color: "#991b1b",
  },
  statusLoading: {
    background: "#f1f5f9",
    color: "#64748b",
  },
  body: {
    padding: 14,
    background: "#fff",
    fontSize: 12,
    fontFamily: "monospace",
    color: "#1e293b",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    minHeight: 80,
    margin: 0,
  },
};
