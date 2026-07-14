import type { VercelRequest, VercelResponse } from "@vercel/node";

const OPENSKY_API_BASE = "https://opensky-network.org/api";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiPath = (req.query.path as string[])?.join("/") || "";
  const qs = new URL(req.url || "", "http://localhost").search;
  const url = `${OPENSKY_API_BASE}/${apiPath}${qs}`;

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (req.headers.authorization) {
      headers["Authorization"] = req.headers.authorization;
    }
    const resp = await fetch(url, { method: "GET", headers });
    const body = await resp.text();
    res.setHeader("Content-Type", resp.headers.get("content-type") || "application/json");
    return res.status(resp.status).send(body);
  } catch (err: any) {
    return res.status(502).json({ error: err.message });
  }
}
