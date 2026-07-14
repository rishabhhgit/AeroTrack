const express = require("express");
const path = require("path");
const app = express();

process.on("uncaughtException", (err) => { console.error("Uncaught:", err); });
process.on("unhandledRejection", (err) => { console.error("Unhandled:", err); });

const OPENSKY_AUTH_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const OPENSKY_API_BASE = "https://opensky-network.org/api";
const AIRPORTDB_API_BASE = "https://airportdb.io/api/v1";

const CLIENT_ID = process.env.VITE_REACT_OSKY_CLIENT_ID;
const CLIENT_SECRET = process.env.VITE_REACT_OSKY_CLIENT_SECRET;
const AIRPORTDB_TOKEN = process.env.VITE_AIRPORTDB_TOKEN;

console.info("Client ID:", CLIENT_ID ? "****" : "NOT SET");
console.info("AirportDB Token:", AIRPORTDB_TOKEN ? "****" : "NOT SET");

app.get("/health", (req, res) => res.status(200).json({ ok: true }));

app.get("/oskytokenapi", async (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: "Missing credentials" });
  }
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", CLIENT_ID);
  params.append("client_secret", CLIENT_SECRET);
  try {
    const resp = await fetch(OPENSKY_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!resp.ok) return res.status(resp.status).json({ error: await resp.text() });
    const data = await resp.json();
    res.setHeader("Cache-Control", "no-store");
    res.json({ access_token: data.access_token, expires_in: data.expires_in, token_type: data.token_type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/oskyapi/*", async (req, res) => {
  const apiPath = req.params[0];
  const qs = new URL(req.url, "http://localhost").search;
  const url = `${OPENSKY_API_BASE}/${apiPath}${qs}`;
  try {
    const headers = { Accept: "application/json" };
    if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;
    const resp = await fetch(url, { method: "GET", headers });
    res.setHeader("Content-Type", resp.headers.get("content-type") || "application/json");
    res.status(resp.status).send(await resp.text());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/airportdbapi/*", async (req, res) => {
  const apiPath = req.params[0];
  const qs = new URL(req.url, "http://localhost").search;
  const separator = apiPath.includes("?") ? "&" : "?";
  const url = `${AIRPORTDB_API_BASE}/${apiPath}${qs}${qs ? "&" : "?"}apiToken=${AIRPORTDB_TOKEN}`;
  try {
    const resp = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    res.setHeader("Content-Type", resp.headers.get("content-type") || "application/json");
    res.status(resp.status).send(await resp.text());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const fs = require("fs");
let distPath = path.join(__dirname, "dist");
if (!fs.existsSync(distPath)) {
  distPath = __dirname;
}
console.log(`Serving static from: ${distPath}`);
app.use(express.static(distPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3000;
console.log(`Attempting to listen on ${PORT}, cwd: ${__dirname}`);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AeroTrack running on port ${PORT}`);
});
