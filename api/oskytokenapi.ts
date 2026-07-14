import type { VercelRequest, VercelResponse } from "@vercel/node";

const OPENSKY_AUTH_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const clientId = process.env.VITE_REACT_OSKY_CLIENT_ID;
  const clientSecret = process.env.VITE_REACT_OSKY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "Missing credentials" });
  }

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  try {
    const resp = await fetch(OPENSKY_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const data = await resp.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(resp.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
