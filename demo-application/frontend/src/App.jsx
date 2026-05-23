// src/App.jsx
import { useState } from "react";
import PostInput from "./components/PostInput";
import GetOutput from "./components/GetOutput";
import Health from "./components/Health";
import DebugHeaders from "./components/DebugHeaders";

const TABS = [
  { id: "post",   label: "POST /input" },
  { id: "get",    label: "GET /output" },
  { id: "health", label: "GET /health" },
  { id: "debug",  label: "GET /debug/headers" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("post");

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Kong API demo</h1>
          <p style={styles.subtitle}>
            React frontend → Kong (port 8000) → Node.js backend (port 3000)
          </p>

          {/* Show active config from .env */}
          <div style={styles.configBar}>
            <span style={styles.configItem}>
              <span style={styles.configKey}>KONG_URL</span>
              <span style={styles.configVal}>
                {process.env.REACT_APP_KONG_URL || "not set"}
              </span>
            </span>
            <span style={styles.configItem}>
              <span style={styles.configKey}>API_KEY</span>
              <span style={styles.configVal}>
                {process.env.REACT_APP_KONG_KEY
                  ? `${process.env.REACT_APP_KONG_KEY.slice(0, 8)}...`
                  : "not set"}
              </span>
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div style={styles.panel}>
          {activeTab === "post"   && <PostInput />}
          {activeTab === "get"    && <GetOutput />}
          {activeTab === "health" && <Health />}
          {activeTab === "debug"  && <DebugHeaders />}
        </div>

        {/* Flow diagram */}
        <div style={styles.flow}>
          <div style={styles.flowStep}>
            <span style={styles.flowIcon}>🌐</span>
            <span style={styles.flowLabel}>React</span>
            <span style={styles.flowSub}>port 3001</span>
          </div>
          <span style={styles.arrow}>→</span>
          <div style={styles.flowStep}>
            <span style={styles.flowIcon}>🔒</span>
            <span style={styles.flowLabel}>Kong</span>
            <span style={styles.flowSub}>port 8000 · verifies key</span>
          </div>
          <span style={styles.arrow}>→</span>
          <div style={styles.flowStep}>
            <span style={styles.flowIcon}>⚙️</span>
            <span style={styles.flowLabel}>Node.js</span>
            <span style={styles.flowSub}>port 3000</span>
          </div>
        </div>

      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: "2rem 1rem",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  container: {
    maxWidth: 680,
    margin: "0 auto",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    color: "#0f172a",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 12,
    fontFamily: "monospace",
  },
  configBar: {
    display: "flex",
    gap: 16,
    padding: "8px 12px",
    background: "#f1f5f9",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
  },
  configItem: {
    display: "flex",
    gap: 6,
    fontSize: 12,
    fontFamily: "monospace",
  },
  configKey: {
    color: "#64748b",
  },
  configVal: {
    color: "#0f172a",
    fontWeight: 500,
  },
  tabs: {
    display: "flex",
    gap: 4,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  tab: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    background: "transparent",
    color: "#64748b",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "monospace",
  },
  tabActive: {
    background: "#fff",
    color: "#0f172a",
    borderColor: "#94a3b8",
  },
  panel: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "20px",
    marginBottom: 24,
  },
  flow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "16px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
  },
  flowStep: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  flowIcon: {
    fontSize: 20,
  },
  flowLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#0f172a",
  },
  flowSub: {
    fontSize: 11,
    color: "#94a3b8",
    fontFamily: "monospace",
  },
  arrow: {
    fontSize: 18,
    color: "#cbd5e1",
  },
};
