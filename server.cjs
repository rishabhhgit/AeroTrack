const http = require("http");
const fs = require("fs");
const path = require("path");

process.on("uncaughtException", (err) => { console.error("UNCAUGHT:", err); process.exit(1); });
process.on("unhandledRejection", (err) => { console.error("UNHANDLED:", err); });

const OPENSKY_AUTH_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const OPENSKY_API_BASE = "https://opensky-network.org/api";
const AIRPORTDB_API_BASE = "https://airportdb.io/api/v1";

const CLIENT_ID = process.env.VITE_REACT_OSKY_CLIENT_ID;
const CLIENT_SECRET = process.env.VITE_REACT_OSKY_CLIENT_SECRET;
const AIRPORTDB_TOKEN = process.env.VITE_AIRPORTDB_TOKEN;

console.log("Env check:", JSON.stringify({
  clientId: CLIENT_ID ? "SET" : "MISSING",
  clientSecret: CLIENT_SECRET ? "SET" : "MISSING",
  airportDbToken: AIRPORTDB_TOKEN ? "SET" : "MISSING",
}));

let distPath = path.join(__dirname, "dist");
if (!fs.existsSync(distPath)) {
  distPath = __dirname;
}

const indexHtml = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");

const server = http.createServer(async (req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, distPath }));
  }

  if (req.url === "/oskytokenapi") {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing credentials" }));
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
      const body = await resp.text();
      res.writeHead(resp.status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      return res.end(body);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.url.startsWith("/oskyapi/")) {
    const apiPath = req.url.slice("/oskyapi/".length);
    const url = `${OPENSKY_API_BASE}/${apiPath}`;
    try {
      const headers = { Accept: "application/json" };
      if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;
      const resp = await fetch(url, { method: "GET", headers });
      const body = await resp.text();
      res.writeHead(resp.status, { "Content-Type": resp.headers.get("content-type") || "application/json" });
      return res.end(body);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.url.startsWith("/airportdbapi/")) {
    const apiPath = req.url.slice("/airportdbapi/".length);
    const separator = apiPath.includes("?") ? "&" : "?";
    const url = `${AIRPORTDB_API_BASE}/${apiPath}${separator}apiToken=${AIRPORTDB_TOKEN}`;
    try {
      const resp = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
      const body = await resp.text();
      res.writeHead(resp.status, { "Content-Type": resp.headers.get("content-type") || "application/json" });
      return res.end(body);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(indexHtml);
  }

  const filePath = path.join(distPath, req.url);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const types = { ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    return res.end(content);
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(indexHtml);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`AeroTrack server listening on 0.0.0.0:${PORT}`);
  console.log(`Dist path: ${distPath}`);
});
