const http = require("http");
const https = require("https");

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeout = 30000 } = options;
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: "GET",
      headers: { Accept: "application/json" },
      timeout,
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const targetPath = url.searchParams.get("path") || "/api/states/all";
  const query = url.searchParams.get("query") || "";
  const target = `https://opensky-network.org${targetPath}${query ? "?" + query : ""}`;

  try {
    const resp = await httpsGet(target);
    res.writeHead(resp.status, { "Content-Type": "application/json" });
    res.end(resp.body);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Relay listening on ${PORT}`));
