import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

const OPENSKY_AUTH_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const OPENSKY_API_BASE = "https://opensky-network.org/api";
const AIRPORTDB_API_BASE = "https://airportdb.io/api/v1";

const CLIENT_ID = process.env.VITE_REACT_OSKY_CLIENT_ID;
const CLIENT_SECRET = process.env.VITE_REACT_OSKY_CLIENT_SECRET;
const AIRPORTDB_TOKEN = process.env.VITE_AIRPORTDB_TOKEN;

console.info("Client ID:", CLIENT_ID ? "****" : "NOT SET");
console.info("Client Secret:", CLIENT_SECRET ? "****" : "NOT SET");
console.info("AirportDB Token:", AIRPORTDB_TOKEN ? "****" : "NOT SET");

app.use(express.json());

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

    if (!resp.ok) {
      return res.status(resp.status).json({ error: await resp.text() });
    }

    const data = await resp.json();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/oskyapi/{*path}", async (req, res) => {
  const rawPath = req.params.path;
  const path = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
  const qs = new URL(req.url, "http://localhost").search;
  const url = `${OPENSKY_API_BASE}/${path}${qs}`;

  try {
    const headers = { Accept: "application/json" };
    const auth = req.headers.authorization;
    if (auth) headers["Authorization"] = auth;

    const resp = await fetch(url, { method: "GET", headers });
    const contentType = resp.headers.get("content-type") || "application/json";
    res.setHeader("Content-Type", contentType);
    res.status(resp.status).send(await resp.text());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/airportdbapi/{*path}", async (req, res) => {
  const rawPath = req.params.path;
  const path = Array.isArray(rawPath) ? rawPath.join('/') : rawPath;
  const qs = new URL(req.url, "http://localhost").search;
  const separator = path.includes("?") ? "&" : "?";
  const url = `${AIRPORTDB_API_BASE}/${path}${qs}${qs ? "&" : "?"}apiToken=${AIRPORTDB_TOKEN}`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const contentType = resp.headers.get("content-type") || "application/json";
    res.setHeader("Content-Type", contentType);
    res.status(resp.status).send(await resp.text());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const distPath = join(__dirname, "dist");
app.use(express.static(distPath));
app.get("/{*splat}", (req, res) => {
  res.sendFile(join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AeroTrack server running on port ${PORT}`);
});
