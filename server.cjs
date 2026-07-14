const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

process.on("uncaughtException", (err) => { console.error("UNCAUGHT:", err); });
process.on("unhandledRejection", (err) => { console.error("UNHANDLED:", err); });

const AIRPLANE_HOST = "api.airplanes.live";
const AIRPORTDB_HOST = "airportdb.io";
const AIRPORTDB_TOKEN = process.env.VITE_AIRPORTDB_TOKEN;
const RATE_LIMIT_MS = 1050;
const STALE_TIMEOUT_MS = 5 * 60 * 1000;
const SCAN_INTERVAL_MS = 4 * 60 * 1000;

let distPath = path.join(__dirname, "dist");
if (!fs.existsSync(distPath)) distPath = __dirname;

let indexHtml;
try {
  indexHtml = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
} catch (e) {
  indexHtml = "<h1>AeroTrack - index.html not found</h1>";
}

const aircraftCache = new Map();
let scanInProgress = false;
let scanGeneration = 0;
let lastViewport = null;
let lastScanTime = 0;

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
  if (p <= 0x0F) return "Reserved";
  if (p <= 0x1F) return "Africa";
  if (p <= 0x2F) return "Africa";
  if (p <= 0x3F) return "Germany";
  if (p <= 0x4F) return "United Kingdom";
  if (p <= 0x5F) return "United States";
  if (p <= 0x6F) return "South America";
  if (p <= 0x7F) return "Europe";
  if (p <= 0x8F) return "Oceania";
  if (p <= 0x9F) return "Unknown";
  if (p <= 0xAF) return "Asia";
  if (p <= 0xBF) return "China";
  if (p <= 0xCF) return "Canada";
  if (p <= 0xDF) return "Germany";
  if (p <= 0xEF) return "Europe";
  if (p <= 0xFF) return "France";
  return "Unknown";
}

function acToStateVector(ac) {
  const now = Math.floor(Date.now() / 1000);
  return [
    ac.hex || null,
    (ac.flight || "").trim() || null,
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
  ];
}

function generateGlobalGrid() {
  const tiles = [];
  const RADIUS = 240;
  const latMin = -80, latMax = 80, lonMin = -180, lonMax = 180;
  const latStepDeg = (RADIUS * 2) / 60 * 1.4;
  const lonStepDeg = (RADIUS * 2) / 60 * 1.4;

  for (let lat = latMin; lat < latMax; lat += latStepDeg) {
    for (let lon = lonMin; lon < lonMax; lon += lonStepDeg) {
      const centerLat = Math.min(lat + latStepDeg / 2, latMax);
      const centerLon = lon + lonStepDeg / 2;
      tiles.push({ lat: centerLat, lon: centerLon > 180 ? centerLon - 360 : centerLon, radius: RADIUS });
    }
  }
  return tiles;
}

function generateViewportTiles(lamin, lomin, lamax, lomax) {
  const tiles = [];
  const RADIUS = 240;
  const latSpanNm = (lamax - lamin) * 60;
  const lonSpanNm = (lomax - lomin) * 60 * Math.cos(((lamin + lamax) / 2) * Math.PI / 180);
  const stepNm = RADIUS * 1.5;
  const latSteps = Math.max(1, Math.ceil(latSpanNm / stepNm));
  const lonSteps = Math.max(1, Math.ceil(lonSpanNm / stepNm));
  const stepLat = (lamax - lamin) / latSteps;
  const stepLon = (lomax - lomin) / lonSteps;

  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lonSteps; j++) {
      tiles.push({
        lat: lamin + stepLat * (i + 0.5),
        lon: lomin + stepLon * (j + 0.5),
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
      const existing = aircraftCache.get(ac.hex);
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
    }
    return added;
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

async function runScan(tiles, generation) {
  scanInProgress = true;
  let totalFetched = 0;
  const start = Date.now();

  for (let i = 0; i < tiles.length; i++) {
    if (generation !== scanGeneration) {
      console.log(`Scan generation changed, aborting`);
      break;
    }
    const reqStart = Date.now();
    const added = await fetchTile(tiles[i]);
    totalFetched += added;

    if ((i + 1) % 50 === 0) {
      console.log(`Scan progress: ${i + 1}/${tiles.length} tiles, cache: ${aircraftCache.size}`);
    }

    const elapsed = Date.now() - reqStart;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Scan complete: ${tiles.length} tiles in ${elapsed}s, ${totalFetched} aircraft processed, cache: ${aircraftCache.size}`);
  lastScanTime = Date.now();
  scanInProgress = false;
}

function pruneStale() {
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

function startGlobalScan() {
  scanGeneration++;
  const tiles = generateGlobalGrid();
  console.log(`Starting global scan: ${tiles.length} tiles`);
  runScan(tiles, scanGeneration);
}

function startViewportScan(lamin, lomin, lamax, lomax) {
  if (scanInProgress) return;
  scanGeneration++;
  const tiles = generateViewportTiles(lamin, lomin, lamax, lomax);
  lastViewport = { lamin, lomin, lamax, lomax };
  console.log(`Starting viewport scan: ${tiles.length} tiles for bbox(${lamin.toFixed(1)},${lomin.toFixed(1)},${lamax.toFixed(1)},${lomax.toFixed(1)})`);
  runScan(tiles, scanGeneration);
}

function getCacheAsStates(lamin, lomin, lamax, lomax) {
  const states = [];
  const now = Math.floor(Date.now() / 1000);
  for (const [hex, ac] of aircraftCache) {
    if (ac.lat >= lamin && ac.lat <= lamax && ac.lon >= lomin && ac.lon <= lomax) {
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
      scanInProgress,
      lastScanTime: lastScanTime ? new Date(lastScanTime).toISOString() : null,
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
      const urlObj = new URL(req.url, "http://localhost");
      const lamin = parseFloat(urlObj.searchParams.get("lamin") || "-85");
      const lomin = parseFloat(urlObj.searchParams.get("lomin") || "-180");
      const lamax = parseFloat(urlObj.searchParams.get("lamax") || "85");
      const lomax = parseFloat(urlObj.searchParams.get("lomax") || "180");

      if (aircraftCache.size === 0) {
        if (!scanInProgress) startGlobalScan();
        return json(res, 200, { time: Math.floor(Date.now() / 1000), states: [] });
      }

      const states = getCacheAsStates(lamin, lomin, lamax, lomax);
      console.log(`Cache hit: ${aircraftCache.size} cached, ${states.length} in viewport`);

      const now = Math.floor(Date.now() / 1000);
      cors(res);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ time: now, states }));

      if (!scanInProgress && (Date.now() - lastScanTime > SCAN_INTERVAL_MS || !lastViewport)) {
        startViewportScan(lamin, lomin, lamax, lomax);
      }
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
  startGlobalScan();
});
server.on("error", (err) => {
  console.error("SERVER ERROR:", err);
});
