const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const dns = require("dns");

process.on("uncaughtException", (err) => { console.error("UNCAUGHT:", err); });
process.on("unhandledRejection", (err) => { console.error("UNHANDLED:", err); });

setInterval(() => console.log(`HEARTBEAT ${new Date().toISOString()}`), 30000);

const OPENSKY_AUTH_HOST = "auth.opensky-network.org";
const OPENSKY_API_HOST = "opensky-network.org";
const AIRPORTDB_HOST = "airportdb.io";

dns.lookup(OPENSKY_API_HOST, (err, addr) => console.log("DNS opensky-network.org:", err ? err.message : addr));
dns.lookup(AIRPORTDB_HOST, (err, addr) => console.log("DNS airportdb.io:", err ? err.message : addr));

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

function httpsGet(url, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function httpsPost(url, headers, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers,
      timeout: timeoutMs,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
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

  if (req.url === "/test") {
    const results = {};
    try {
      results.opensky = await httpsGet("https://opensky-network.org/api/states/all?limit=1", { Accept: "application/json" }, 10000);
      results.opensky = { status: results.opensky.status, bytes: results.opensky.body.length };
    } catch (e) { results.opensky = { error: e.message }; }
    try {
      results.airportdb = await httpsGet(`https://airportdb.io/api/v1/search/ICN?apiToken=${AIRPORTDB_TOKEN}`, { Accept: "application/json" }, 10000);
      results.airportdb = { status: results.airportdb.status, bytes: results.airportdb.body.length };
    } catch (e) { results.airportdb = { error: e.message }; }
    return json(res, 200, results);
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
      console.log("Fetching OpenSky token via https module...");
      const resp = await httpsPost(
        `https://${OPENSKY_AUTH_HOST}/auth/realms/opensky-network/protocol/openid-connect/token`,
        { "Content-Type": "application/x-www-form-urlencoded" },
        params.toString(),
        15000
      );
      console.log("OpenSky token response:", resp.status);
      cors(res);
      res.writeHead(resp.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(resp.body);
    } catch (err) {
      console.error("OpenSky token error:", err.message);
      return json(res, 500, { error: err.message });
    }
  }

  if (req.url.startsWith("/oskyapi/")) {
    const apiPath = req.url.slice("/oskyapi/".length);
    const headers = { Accept: "application/json" };
    if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;
    try {
      console.log("Proxying OpenSky via https module:", apiPath);
      const resp = await httpsGet(`https://${OPENSKY_API_HOST}/api/${apiPath}`, headers, 30000);
      console.log("OpenSky response:", resp.status, "bytes:", resp.body.length);
      cors(res);
      res.writeHead(resp.status, { "Content-Type": resp.headers["content-type"] || "application/json" });
      return res.end(resp.body);
    } catch (err) {
      console.error("OpenSky proxy error:", err.message);
      return json(res, 502, { error: "OpenSky API unreachable: " + err.message });
    }
  }

  if (req.url.startsWith("/airportdbapi/")) {
    const apiPath = req.url.slice("/airportdbapi/".length);
    const separator = apiPath.includes("?") ? "&" : "?";
    try {
      const resp = await httpsGet(
        `https://${AIRPORTDB_HOST}/api/v1/${apiPath}${separator}apiToken=${AIRPORTDB_TOKEN}`,
        { Accept: "application/json" },
        15000
      );
      cors(res);
      res.writeHead(resp.status, { "Content-Type": resp.headers["content-type"] || "application/json" });
      return res.end(resp.body);
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
