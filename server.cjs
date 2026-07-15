const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

process.on("uncaughtException", (err) => { console.error("UNCAUGHT:", err); });
process.on("unhandledRejection", (err) => { console.error("UNHANDLED:", err); });

const AIRPLANE_HOST = "api.airplanes.live";
const AIRPORTDB_HOST = "airportdb.io";
const AIRPORTDB_TOKEN = process.env.VITE_AIRPORTDB_TOKEN;
const RATE_LIMIT_MS = 1020;
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
  if (!hex || hex.length < 6) return "Others";
  const h = parseInt(hex.substring(0, 6), 16);
  if (h >= 0x100000 && h <= 0x1FFFFF) return "Russia";
  if (h >= 0x300000 && h <= 0x33FFFF) return "Italy";
  if (h >= 0x340000 && h <= 0x37FFFF) return "Spain";
  if (h >= 0x380000 && h <= 0x3BFFFF) return "France";
  if (h >= 0x3C0000 && h <= 0x3FFFFF) return "Germany";
  if (h >= 0x400000 && h <= 0x43FFFF) return "United Kingdom";
  if (h >= 0x718000 && h <= 0x71FFFF) return "South Korea";
  if (h >= 0x730000 && h <= 0x737FFF) return "Iran";
  if (h >= 0x738000 && h <= 0x73FFFF) return "Israel";
  if (h >= 0x750000 && h <= 0x757FFF) return "Malaysia";
  if (h >= 0x758000 && h <= 0x75FFFF) return "Philippines";
  if (h >= 0x760000 && h <= 0x767FFF) return "Pakistan";
  if (h >= 0x768000 && h <= 0x76FFFF) return "Singapore";
  if (h >= 0x770000 && h <= 0x777FFF) return "Sri Lanka";
  if (h >= 0x780000 && h <= 0x7BFFFF) return "China";
  if (h >= 0x7C0000 && h <= 0x7FFFFF) return "Australia";
  if (h >= 0x800000 && h <= 0x83FFFF) return "India";
  if (h >= 0x840000 && h <= 0x87FFFF) return "Japan";
  if (h >= 0x880000 && h <= 0x887FFF) return "Thailand";
  if (h >= 0x888000 && h <= 0x88FFFF) return "Vietnam";
  if (h >= 0x896000 && h <= 0x896FFF) return "United Arab Emirates";
  if (h >= 0x8A0000 && h <= 0x8A7FFF) return "Indonesia";
  if (h >= 0xA00000 && h <= 0xAFFFFF) return "United States";
  if (h >= 0xC00000 && h <= 0xC3FFFF) return "Canada";
  if (h >= 0xC80000 && h <= 0xC87FFF) return "New Zealand";
  if (h >= 0xE00000 && h <= 0xE3FFFF) return "Argentina";
  if (h >= 0xE40000 && h <= 0xE7FFFF) return "Brazil";
  if (h >= 0xE80000 && h <= 0xE80FFF) return "Chile";
  if (h >= 0xE8C000 && h <= 0xE8CFFF) return "Peru";
  return "Others";
}

const PRIORITY_TILES = [
  [40.64, -73.78], [40.78, -73.97], [33.94, -118.41], [41.97, -87.90],
  [29.99, -95.34], [25.79, -80.29], [37.62, -122.38], [47.45, -122.31],
  [35.76, -140.05], [52.31, 4.77], [48.35, 11.79], [45.63, 5.08],
  [41.80, 2.17], [40.47, -3.57], [55.97, -3.37], [49.19, 2.43],
  [41.38, 2.07], [50.03, 14.26], [59.65, 17.94], [50.10, 14.26],
  [22.31, 113.91], [31.14, 121.81], [35.55, 139.78], [37.46, 126.44],
  [1.35, 103.99], [13.69, 100.75], [25.25, 55.36], [28.55, 77.10],
  [19.09, 72.87], [-33.94, 18.60], [-23.43, -46.47], [-34.82, -56.03],
  [6.17, -75.43], [56.03, -3.37], [60.32, 5.21], [65.63, -18.07],
  [47.45, 8.54], [48.11, 11.58], [52.56, 13.29], [41.28, 2.07],
];

function generateGlobalGrid() {
  const tiles = [];
  const RADIUS = 240;
  const step = (RADIUS * 2) / 60 * 1.0;
  for (let lat = -80; lat < 80; lat += step) {
    for (let lon = -180; lon < 180; lon += step) {
      tiles.push({
        lat: Math.min(lat + step / 2, 80),
        lon: lon + step / 2 > 180 ? lon + step / 2 - 360 : lon + step / 2,
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

async function scanTiles(tiles, label, concurrency = 1) {
  const start = Date.now();
  for (let i = 0; i < tiles.length; i += concurrency) {
    const batch = tiles.slice(i, i + concurrency);
    const reqStart = Date.now();
    await Promise.all(batch.map((t) => fetchTile(t)));
    if ((i + batch.length) % 50 < concurrency) {
      console.log(`${label}: ${i + batch.length}/${tiles.length} tiles, cache: ${aircraftCache.size}`);
    }
    const elapsed = Date.now() - reqStart;
    const minDelay = Math.max(RATE_LIMIT_MS, concurrency === 1 ? 800 : 1200);
    if (elapsed < minDelay) {
      await new Promise(r => setTimeout(r, minDelay - elapsed));
    }
  }
  return ((Date.now() - start) / 1000).toFixed(1);
}

async function runStartupScan() {
  globalScanRunning = true;
  console.log(`Pre-seeding: ${PRIORITY_TILES.length} major airports`);
  const t1 = await scanTiles(PRIORITY_TILES.map(([lat, lon]) => ({ lat, lon, radius: 240 })), "Priority");
  console.log(`Pre-seed done in ${t1}s, cache: ${aircraftCache.size}`);
  globalScanRunning = false;
  globalScanComplete = true;
  lastRefreshTime = Date.now();
}

async function runGlobalScan() {
  if (globalScanRunning) return;
  globalScanRunning = true;
  const tiles = generateGlobalGrid();
  console.log(`Starting global scan: ${tiles.length} tiles (2x parallel)`);
  const elapsed = await scanTiles(tiles, "Global", 2);
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
  console.log(`Viewport scan: ${tiles.length} tiles`);
  const elapsed = await scanTiles(tiles, "Viewport");
  console.log(`Viewport scan complete: ${tiles.length} tiles in ${elapsed}s, cache: ${aircraftCache.size}`);
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
      if (bounds && globalScanComplete && !viewportScanRunning && !globalScanRunning) {
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
  runStartupScan().then(() => {
    console.log(`Fast pre-seed done. Starting full global scan.`);
    runGlobalScan().then(() => {
      setInterval(async () => {
        if (!globalScanRunning) {
          console.log(`Starting periodic refresh`);
          await runGlobalScan();
        }
      }, 10 * 60 * 1000);
    });
  });
});
server.on("error", (err) => {
  console.error("SERVER ERROR:", err);
});
