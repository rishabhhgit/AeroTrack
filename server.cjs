const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

process.on("uncaughtException", (err) => { console.error("UNCAUGHT:", err); });
process.on("unhandledRejection", (err) => { console.error("UNHANDLED:", err); });

const AIRPLANE_HOST = "api.airplanes.live";
const AIRPORTDB_HOST = "airportdb.io";
const AIRPORTDB_TOKEN = process.env.VITE_AIRPORTDB_TOKEN;
const RATE_LIMIT_MS = 1010;
const STALE_TIMEOUT_MS = 15 * 60 * 1000;

let distPath = path.join(__dirname, "dist");
if (!fs.existsSync(distPath)) distPath = __dirname;

let indexHtml;
try {
  indexHtml = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
} catch (e) {
  indexHtml = "<h1>AeroTrack - index.html not found</h1>";
}

const aircraftCache = new Map();
let globalScanRunning = false;
let globalScanComplete = false;
let lastRefreshTime = 0;
let viewportScanRunning = false;

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

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { method = "GET", headers = {}, body, timeout = 15000 } = options;
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method,
      headers,
      timeout,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    if (body) req.write(body);
    req.end();
  });
}

function getCountryFromHex(hex) {
  if (!hex || hex.length < 2) return "Unknown";
  const p = parseInt(hex.substring(0, 2), 16);
  if (p >= 0x50 && p <= 0x5F) return "United States";
  if (p >= 0xC0 && p <= 0xCF) return "Canada";
  if (p >= 0xB0 && p <= 0xBF) return "China";
  if (p >= 0x70 && p <= 0x7F) return "Russia";
  if (p >= 0x40 && p <= 0x43) return "United Kingdom";
  if (p >= 0xF4 && p <= 0xF7) return "United Kingdom";
  if (p >= 0x48 && p <= 0x4B) return "France";
  if (p >= 0xE0 && p <= 0xE3) return "France";
  if (p >= 0xF0 && p <= 0xF3) return "France";
  if (p >= 0x34 && p <= 0x37) return "Spain";
  if (p >= 0xE4 && p <= 0xE7) return "Spain";
  if (p >= 0x38 && p <= 0x3B) return "Italy";
  if (p >= 0xE8 && p <= 0xEB) return "Italy";
  if (p >= 0x30 && p <= 0x33) return "Germany";
  if (p >= 0x44 && p <= 0x47) return "Germany";
  if (p >= 0xD0 && p <= 0xDF) return "Germany";
  if (p >= 0xF8 && p <= 0xFB) return "Germany";
  if (p >= 0x3C && p <= 0x3F) return "Netherlands";
  if (p >= 0x80 && p <= 0x83) return "Australia";
  if (p >= 0x84 && p <= 0x87) return "Japan";
  if (p >= 0xA0 && p <= 0xA3) return "India";
  if (p >= 0xA4 && p <= 0xA7) return "South Korea";
  if (p >= 0x60 && p <= 0x63) return "Brazil";
  if (p === 0xA8) return "Pakistan";
  if (p === 0xA9) return "Pakistan";
  if (p === 0xAA) return "India";
  if (p === 0xAB) return "Sri Lanka";
  if (p === 0xAC) return "Kazakhstan";
  if (p === 0xAD) return "Turkey";
  if (p === 0xAE) return "Iran";
  if (p === 0xAF) return "Saudi Arabia";
  if (p === 0x88) return "New Zealand";
  if (p === 0x89) return "Indonesia";
  if (p === 0x8A) return "Malaysia";
  if (p === 0x8B) return "Singapore";
  if (p === 0x8C) return "Philippines";
  if (p === 0x8D) return "Thailand";
  if (p === 0x8E) return "Vietnam";
  if (p === 0x8F) return "Taiwan";
  if (p === 0x14) return "South Africa";
  if (p === 0x18) return "Egypt";
  if (p === 0x10) return "Nigeria";
  if (p === 0x11) return "Morocco";
  if (p === 0x12) return "Algeria";
  if (p === 0x15) return "Ethiopia";
  if (p === 0x16) return "Kenya";
  if (p === 0x17) return "Tanzania";
  if (p === 0x19) return "Libya";
  if (p === 0x1A) return "Sudan";
  if (p === 0x1B) return "Ghana";
  if (p === 0x1C) return "Senegal";
  if (p === 0x1D) return "Cameroon";
  if (p === 0x1E) return "Ivory Coast";
  if (p === 0x1F) return "Zimbabwe";
  if (p === 0x20) return "Argentina";
  if (p === 0x21) return "Argentina";
  if (p === 0x22) return "Chile";
  if (p === 0x23) return "Peru";
  if (p === 0x24) return "Venezuela";
  if (p === 0x25) return "Colombia";
  if (p === 0x26) return "Ecuador";
  if (p === 0x27) return "Bolivia";
  if (p === 0x28) return "Paraguay";
  if (p === 0x29) return "Uruguay";
  if (p === 0x2A) return "Guyana";
  if (p === 0x2B) return "Suriname";
  if (p === 0x2C) return "Trinidad and Tobago";
  if (p === 0x2D) return "Costa Rica";
  if (p === 0x2E) return "Panama";
  if (p === 0x2F) return "Guatemala";
  if (p === 0x64) return "Mexico";
  if (p === 0x65) return "Mexico";
  if (p === 0x66) return "Cuba";
  if (p === 0x67) return "Honduras";
  if (p === 0x68) return "El Salvador";
  if (p === 0x69) return "Nicaragua";
  if (p === 0x6A) return "Dominican Republic";
  if (p === 0x6B) return "Haiti";
  if (p === 0x6C) return "Jamaica";
  if (p === 0x6D) return "Puerto Rico";
  if (p === 0x6E) return "Guadeloupe";
  if (p === 0x6F) return "Martinique";
  if (p === 0x4C) return "Norway";
  if (p === 0x4D) return "Sweden";
  if (p === 0x4E) return "Switzerland";
  if (p === 0x4F) return "Austria";
  if (p === 0xEC) return "Poland";
  if (p === 0xED) return "Czech Republic";
  if (p === 0xEE) return "Romania";
  if (p === 0xEF) return "Greece";
  if (p === 0xFC) return "Ireland";
  if (p === 0xFD) return "Finland";
  if (p === 0xFE) return "Belgium";
  if (p === 0xFF) return "Portugal";
  if (p >= 0x90 && p <= 0x9F) return "Unknown";
  if (p >= 0x00 && p <= 0x0F) return "Unknown";
  return "Unknown";
}

function generateGlobalGrid() {
  const tiles = [];
  const RADIUS = 240;
  const latStepDeg = (RADIUS * 2) / 60 * 1.0;
  const lonStepDeg = (RADIUS * 2) / 60 * 1.0;
  for (let lat = -80; lat < 80; lat += latStepDeg) {
    for (let lon = -180; lon < 180; lon += lonStepDeg) {
      tiles.push({
        lat: Math.min(lat + latStepDeg / 2, 80),
        lon: lon + lonStepDeg / 2 > 180 ? lon + lonStepDeg / 2 - 360 : lon + lonStepDeg / 2,
        radius: RADIUS,
      });
    }
  }
  return tiles;
}

function generateViewportTiles(bounds) {
  const tiles = [];
  const RADIUS = 240;
  const step = (RADIUS * 2) / 60 * 1.0;
  const latStart = Math.floor(bounds.southernLatitude / step) * step;
  const latEnd = Math.ceil(bounds.northernLatitude / step) * step;
  const lonStart = Math.floor(bounds.westernLongitude / step) * step;
  const lonEnd = Math.ceil(bounds.easternLongitude / step) * step;
  for (let lat = latStart; lat < latEnd; lat += step) {
    for (let lon = lonStart; lon < lonEnd; lon += step) {
      tiles.push({
        lat: Math.max(-80, Math.min(lat + step / 2, 80)),
        lon: lon + step / 2 > 180 ? lon + step / 2 - 360 : lon + step / 2,
        radius: RADIUS,
      });
    }
  }
  return tiles;
}

function mergeAircraftFromResponse(body) {
  try {
    const data = JSON.parse(body);
    if (!data.ac) return 0;
    const now = Date.now();
    let count = 0;
    for (const ac of data.ac) {
      if (ac.lat == null || ac.lon == null || !ac.hex) continue;
      if (ac.alt_baro != null && ac.alt_baro !== "ground" && (ac.alt_baro > 60000 || ac.alt_baro < -2000)) continue;
      aircraftCache.set(ac.hex, {
        hex: ac.hex,
        flight: (ac.flight || "").trim(),
        lat: ac.lat,
        lon: ac.lon,
        alt_baro: ac.alt_baro,
        alt_geom: ac.alt_geom,
        gs: ac.gs,
        track: ac.track,
        baro_rate: ac.baro_rate,
        squawk: ac.squawk,
        spi: ac.spi,
        seen_pos: ac.seen_pos,
        seen: ac.seen,
        category: ac.category,
        db_flags: ac.db_flags,
        ts: now,
      });
      count++;
    }
    return count;
  } catch (e) {
    return 0;
  }
}

async function fetchTile(tile) {
  const url = `https://${AIRPLANE_HOST}/v2/point/${tile.lat}/${tile.lon}/${tile.radius}`;
  try {
    const resp = await httpsRequest(url, { timeout: 12000 });
    if (resp.status === 200) {
      return mergeAircraftFromResponse(resp.body);
    } else if (resp.status === 403) {
      await new Promise(r => setTimeout(r, 2500));
      const retry = await httpsRequest(url, { timeout: 12000 });
      if (retry.status === 200) return mergeAircraftFromResponse(retry.body);
    }
  } catch (e) {}
  return 0;
}

async function runGlobalScan() {
  if (globalScanRunning) return;
  globalScanRunning = true;
  const tiles = generateGlobalGrid();
  const start = Date.now();
  console.log(`Starting global scan: ${tiles.length} tiles`);

  for (let i = 0; i < tiles.length; i++) {
    const reqStart = Date.now();
    await fetchTile(tiles[i]);

    if ((i + 1) % 50 === 0) {
      console.log(`Scan progress: ${i + 1}/${tiles.length} tiles, cache: ${aircraftCache.size}`);
    }

    const elapsed = Date.now() - reqStart;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Global scan complete: ${tiles.length} tiles in ${elapsed}s, cache: ${aircraftCache.size}`);
  globalScanRunning = false;
  globalScanComplete = true;
  lastRefreshTime = Date.now();
}

async function runViewportScan(bounds) {
  if (viewportScanRunning) return;
  viewportScanRunning = true;
  const tiles = generateViewportTiles(bounds);
  if (tiles.length === 0) { viewportScanRunning = false; return; }
  console.log(`Viewport scan: ${tiles.length} tiles for bounds [${bounds.southernLatitude.toFixed(1)},${bounds.westernLongitude.toFixed(1)} - ${bounds.northernLatitude.toFixed(1)},${bounds.easternLongitude.toFixed(1)}]`);

  for (let i = 0; i < tiles.length; i++) {
    const reqStart = Date.now();
    await fetchTile(tiles[i]);
    const elapsed = Date.now() - reqStart;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
  }

  console.log(`Viewport scan complete: ${tiles.length} tiles, cache: ${aircraftCache.size}`);
  viewportScanRunning = false;
}

function pruneStale() {
  if (!globalScanComplete) return;
  const now = Date.now();
  let pruned = 0;
  for (const [hex, ac] of aircraftCache) {
    if (now - ac.ts > STALE_TIMEOUT_MS) {
      aircraftCache.delete(hex);
      pruned++;
    }
  }
  if (pruned > 0) console.log(`Pruned ${pruned} stale aircraft, cache: ${aircraftCache.size}`);
}

function parseBounds(urlStr) {
  try {
    const u = new URL(urlStr, "http://localhost");
    const lamin = parseFloat(u.searchParams.get("lamin"));
    const lomin = parseFloat(u.searchParams.get("lomin"));
    const lamax = parseFloat(u.searchParams.get("lamax"));
    const lomax = parseFloat(u.searchParams.get("lomax"));
    if (isNaN(lamin) || isNaN(lomin) || isNaN(lamax) || isNaN(lomax)) return null;
    return { southernLatitude: lamin, westernLongitude: lomin, northernLatitude: lamax, easternLongitude: lomax };
  } catch (e) { return null; }
}

function getAllCachedStates() {
  const states = [];
  const now = Math.floor(Date.now() / 1000);
  for (const [hex, ac] of aircraftCache) {
    states.push([
      ac.hex,
      ac.flight || null,
      getCountryFromHex(ac.hex),
      ac.seen_pos != null ? Math.round(now - ac.seen_pos) : null,
      ac.seen != null ? Math.round(now - ac.seen) : now,
      ac.lon,
      ac.lat,
      ac.alt_baro != null && ac.alt_baro !== "ground" ? ac.alt_baro * 0.3048 : null,
      ac.alt_baro === "ground",
      ac.gs != null ? ac.gs * 0.514444 : null,
      ac.track != null ? ac.track : null,
      ac.baro_rate != null ? ac.baro_rate * 0.00508 : null,
      null,
      ac.alt_geom != null && ac.alt_geom !== "ground" ? ac.alt_geom * 0.3048 : null,
      ac.squawk || null,
      ac.spi === 1,
      0,
      0,
    ]);
  }
  return states;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.url === "/health") {
    return json(res, 200, {
      ok: true,
      cacheSize: aircraftCache.size,
      globalScanRunning,
      globalScanComplete,
      viewportScanRunning,
      lastRefresh: lastRefreshTime ? new Date(lastRefreshTime).toISOString() : null,
    });
  }

  if (req.url === "/test") {
    const results = {};
    try {
      const r = await httpsRequest(`https://${AIRPLANE_HOST}/v2/point/40.7128/-74.0060/250`, { timeout: 15000 });
      const data = JSON.parse(r.body);
      results.airplanes_live = { status: r.status, aircraft: data.ac ? data.ac.length : 0 };
    } catch (e) { results.airplanes_live = { error: e.message }; }
    try {
      const r = await httpsRequest(`https://${AIRPORTDB_HOST}/api/v1/search/ICN?apiToken=${AIRPORTDB_TOKEN}`, { timeout: 10000 });
      results.airportdb = { status: r.status, bytes: r.body.length };
    } catch (e) { results.airportdb = { error: e.message }; }
    return json(res, 200, results);
  }

  if (req.url.startsWith("/oskytokenapi")) {
    return json(res, 200, { access_token: "dummy", expires_in: 999999 });
  }

  if (req.url.startsWith("/oskyapi/states/all")) {
    try {
      const bounds = parseBounds(req.url);
      if (bounds && globalScanComplete && !viewportScanRunning) {
        runViewportScan(bounds).catch(() => {});
      }
      const states = getAllCachedStates();
      const now = Math.floor(Date.now() / 1000);
      cors(res);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ time: now, states }));
    } catch (err) {
      console.error("States error:", err.message);
      return json(res, 502, { error: err.message });
    }
    return;
  }

  if (req.url.startsWith("/oskyapi/")) {
    const apiPath = req.url.slice("/oskyapi/".length);
    try {
      if (apiPath.startsWith("flights/aircraft")) {
        const urlObj = new URL(req.url, "http://localhost");
        const icao24 = urlObj.pathname.split("/").pop();
        const apiResp = await httpsRequest(`https://${AIRPLANE_HOST}/v2/icao/${icao24}`, { timeout: 15000 });
        cors(res);
        res.writeHead(apiResp.status, { "Content-Type": "application/json" });
        return res.end(apiResp.body);
      }
      return json(res, 404, { error: "Endpoint not supported" });
    } catch (err) {
      return json(res, 502, { error: "API error: " + err.message });
    }
  }

  if (req.url.startsWith("/airportdbapi/")) {
    const apiPath = req.url.slice("/airportdbapi/".length);
    const separator = apiPath.includes("?") ? "&" : "?";
    try {
      const resp = await httpsRequest(`https://${AIRPORTDB_HOST}/api/v1/${apiPath}${separator}apiToken=${AIRPORTDB_TOKEN}`, { timeout: 15000 });
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
  setInterval(pruneStale, 60000);
  runGlobalScan().then(() => {
    setInterval(async () => {
      if (!globalScanRunning) {
        console.log(`Starting periodic refresh`);
        await runGlobalScan();
      }
    }, 10 * 60 * 1000);
  });
});
server.on("error", (err) => {
  console.error("SERVER ERROR:", err);
});
