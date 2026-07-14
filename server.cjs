const http = require("http");
const fs = require("fs");
const path = require("path");

process.on("uncaughtException", (err) => { console.error("UNCAUGHT:", err); });
process.on("unhandledRejection", (err) => { console.error("UNHANDLED:", err); });

setInterval(() => console.log(`HEARTBEAT ${new Date().toISOString()}`), 30000);

const OPENSKY_AUTH_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const OPENSKY_API_BASE = "https://opensky-network.org/api";
const AIRPORTDB_API_BASE = "https://airportdb.io/api/v1";

const CLIENT_ID = process.env.VITE_REACT_OSKY_CLIENT_ID;
const CLIENT_SECRET = process.env.VITE_REACT_OSKY_CLIENT_SECRET;
const AIRPORTDB_TOKEN = process.env.VITE_AIRPORTDB_TOKEN;

console.log("Env:", JSON.stringify({
  clientId: CLIENT_ID ? "SET" : "MISSING",
  clientSecret: CLIENT_SECRET ? "SET" : "MISSING",
  airportDbToken: AIRPORTDB_TOKEN ? "SET" : "MISSING",
  port: process.env.PORT,
}));

let distPath = path.join(__dirname, "dist");
if (!fs.existsSync(distPath)) {
  distPath = __dirname;
}

let indexHtml;
try {
  indexHtml = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
} catch (e) {
  indexHtml = "<h1>AeroTrack - index.html not found</h1>";
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, data) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function proxyFetch(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return resp;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  if (req.url === "/health") {
    return json(res, 200, { ok: true, distPath });
  }

  if (req.url.startsWith("/oskytokenapi")) {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json(res, 500, { error: "Missing credentials" });
    }
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", CLIENT_ID);
    params.append("client_secret", CLIENT_SECRET);
    try {
      console.log("Fetching OpenSky token...");
      const resp = await proxyFetch(OPENSKY_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      }, 15000);
      const body = await resp.text();
      console.log("OpenSky token response:", resp.status);
      cors(res);
      res.writeHead(resp.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(body);
    } catch (err) {
      console.error("OpenSky token error:", err.message);
      return json(res, 500, { error: err.message });
    }
  }

  if (req.url.startsWith("/oskyapi/")) {
    const apiPath = req.url.slice("/oskyapi/".length);
    const url = `${OPENSKY_API_BASE}/${apiPath}`;
    try {
      const headers = { Accept: "application/json" };
      if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;
      console.log("Proxying OpenSky:", url);
      const resp = await proxyFetch(url, { method: "GET", headers }, 30000);
      const body = await resp.text();
      console.log("OpenSky response:", resp.status, "bytes:", body.length);
      cors(res);
      res.writeHead(resp.status, { "Content-Type": resp.headers.get("content-type") || "application/json" });
      return res.end(body);
    } catch (err) {
      console.error("OpenSky proxy error:", err.message);
      return json(res, 502, { error: "OpenSky API unreachable: " + err.message });
    }
  }

  if (req.url.startsWith("/airportdbapi/")) {
    const apiPath = req.url.slice("/airportdbapi/".length);
    const separator = apiPath.includes("?") ? "&" : "?";
    const url = `${AIRPORTDB_API_BASE}/${apiPath}${separator}apiToken=${AIRPORTDB_TOKEN}`;
    try {
      const resp = await proxyFetch(url, { method: "GET", headers: { Accept: "application/json" } }, 15000);
      const body = await resp.text();
      cors(res);
      res.writeHead(resp.status, { "Content-Type": resp.headers.get("content-type") || "application/json" });
      return res.end(body);
    } catch (err) {
      return json(res, 502, { error: "AirportDB API unreachable: " + err.message });
    }
  }

  if (req.url === "/" || !path.extname(req.url.split("?")[0])) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(indexHtml);
  }

  const safePath = req.url.split("?")[0];
  const filePath = path.join(distPath, safePath);
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json" };
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      return res.end(content);
    }
  } catch (e) {}

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(indexHtml);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`LISTENING on 0.0.0.0:${PORT}`);
});
server.on("error", (err) => {
  console.error("SERVER ERROR:", err);
});
