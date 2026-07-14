const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

process.on("uncaughtException", (err) => { console.error("UNCAUGHT:", err); });
process.on("unhandledRejection", (err) => { console.error("UNHANDLED:", err); });

setInterval(() => console.log(`HEARTBEAT ${new Date().toISOString()}`), 30000);

const AIRPLANE_HOST = "api.airplanes.live";
const AIRPORTDB_HOST = "airportdb.io";
const AIRPORTDB_TOKEN = process.env.VITE_AIRPORTDB_TOKEN;

console.log("Env:", JSON.stringify({
  airportDbToken: AIRPORTDB_TOKEN ? "SET" : "MISSING",
  port: process.env.PORT,
}));

let distPath = path.join(__dirname, "dist");
if (!fs.existsSync(distPath)) distPath = __dirname;

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

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { method = "GET", headers = {}, body, timeout = 30000 } = options;
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

function bboxToTiles(lamin, lomin, lamax, lomax, maxRadiusNm = 240, maxTiles = 48) {
  const latSpanNm = (lamax - lamin) * 60;
  const lonCenter = (lomin + lomax) / 2;
  const lonSpanNm = (lomax - lomin) * 60 * Math.cos(((lamin + lamax) / 2) * Math.PI / 180);

  if (latSpanNm <= maxRadiusNm * 2 && lonSpanNm <= maxRadiusNm * 2) {
    const r = Math.min(Math.max(latSpanNm, lonSpanNm) / 2 + 10, maxRadiusNm);
    return [{ lat: (lamin + lamax) / 2, lon: lonCenter, radius: Math.max(r, 50) }];
  }

  const latStepsNeeded = Math.ceil(latSpanNm / (maxRadiusNm * 1.4));
  const lonStepsNeeded = Math.ceil(lonSpanNm / (maxRadiusNm * 1.4));
  const totalGrid = latStepsNeeded * lonStepsNeeded;

  let latSteps, lonSteps;
  if (totalGrid <= maxTiles) {
    latSteps = latStepsNeeded;
    lonSteps = lonStepsNeeded;
  } else {
    const ratio = Math.sqrt(maxTiles / totalGrid);
    latSteps = Math.max(1, Math.round(latStepsNeeded * ratio));
    lonSteps = Math.max(1, Math.round(lonStepsNeeded * ratio));
    while (latSteps * lonSteps < maxTiles && lonSteps < lonStepsNeeded) lonSteps++;
    while (latSteps * lonSteps < maxTiles && latSteps < latStepsNeeded) latSteps++;
    while (latSteps * lonSteps > maxTiles && lonSteps > 1) lonSteps--;
  }

  const stepLat = (lamax - lamin) / latSteps;
  const stepLon = (lomax - lomin) / lonSteps;
  const tiles = [];

  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lonSteps; j++) {
      tiles.push({
        lat: lamin + stepLat * (i + 0.5),
        lon: lomin + stepLon * (j + 0.5),
        radius: maxRadiusNm
      });
    }
  }
  return tiles.length > 0 ? tiles : [{ lat: (lamin + lamax) / 2, lon: lonCenter, radius: maxRadiusNm }];
}

async function fetchTilesBatched(tiles, batchSize = 5, delayMs = 1100) {
  const allAircraft = [];
  for (let i = 0; i < tiles.length; i += batchSize) {
    const batch = tiles.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((tile) =>
        httpsRequest(`https://${AIRPLANE_HOST}/v2/point/${tile.lat}/${tile.lon}/${tile.radius}`, { timeout: 15000 })
      )
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      try {
        const data = JSON.parse(r.value.body);
        if (data.ac) allAircraft.push(...data.ac);
      } catch (e) { /* skip parse errors */ }
    }
    if (i + batchSize < tiles.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return allAircraft;
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

function convertToOpenSkyFormat(airplanesData) {
  const now = Math.floor(Date.now() / 1000);
  const states = [];
  for (const ac of (airplanesData.ac || [])) {
    if (ac.lat == null || ac.lon == null) continue;
    states.push([
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
    ]);
  }
  return { time: now, states };
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
      const lamin = parseFloat(urlObj.searchParams.get("lamin") || "45");
      const lomin = parseFloat(urlObj.searchParams.get("lomin") || "0");
      const lamax = parseFloat(urlObj.searchParams.get("lamax") || "55");
      const lomax = parseFloat(urlObj.searchParams.get("lomax") || "15");
      const tiles = bboxToTiles(lamin, lomin, lamax, lomax);
      console.log(`bbox(${lamin.toFixed(1)},${lomin.toFixed(1)},${lamax.toFixed(1)},${lomax.toFixed(1)}) -> ${tiles.length} tile(s)`);
      const allAircraft = await fetchTilesBatched(tiles, 2, 1100);
      const allStates = [];
      const seenHex = new Set();
      const converted = convertToOpenSkyFormat({ ac: allAircraft });
      for (const sv of converted.states) {
        if (sv[0] && !seenHex.has(sv[0])) {
          seenHex.add(sv[0]);
          allStates.push(sv);
        }
      }
      console.log(`Total unique aircraft: ${allStates.length}`);
      const now = Math.floor(Date.now() / 1000);
      cors(res);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ time: now, states: allStates }));
    } catch (err) {
      console.error("airplanes.live proxy error:", err.message);
      return json(res, 502, { error: "airplanes.live API error: " + err.message });
    }
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
});
server.on("error", (err) => {
  console.error("SERVER ERROR:", err);
});
