const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const OPENSKY_AUTH_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const OPENSKY_API_BASE = "https://opensky-network.org/api";

const CLIENT_ID = process.env.VITE_REACT_OSKY_CLIENT_ID;
const CLIENT_SECRET = process.env.VITE_REACT_OSKY_CLIENT_SECRET;

app.get("/token", async (req, res) => {
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
    res.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/*", async (req, res) => {
  const path = req.params[0];
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
