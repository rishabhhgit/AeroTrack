import type { VercelRequest, VercelResponse } from "@vercel/node";

const AIRPORTDB_API_BASE = "https://airportdb.io/api/v1";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const apiPath = (req.query.path as string[])?.join("/") || "";
  const qs = new URL(req.url || "", "http://localhost").search;
  const separator = apiPath.includes("?") ? "&" : "?";
  const token = process.env.VITE_AIRPORTDB_TOKEN;
  const url = `${AIRPORTDB_API_BASE}/${apiPath}${qs}${separator}apiToken=${token}`;

  try {
    const resp = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    const body = await resp.text();
    res.setHeader("Content-Type", resp.headers.get("content-type") || "application/json");
    return res.status(resp.status).send(body);
  } catch (err: any) {
    return res.status(502).json({ error: err.message });
  }
}
