import type { VercelRequest, VercelResponse } from '@vercel/node';

const AIRPORTDB_BASE = 'https://airportdb.io/api/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const apiToken = process.env.VITE_AIRPORTDB_TOKEN;
  if (!apiToken) {
    res.status(500).json({ error: 'AirportDB API token is not configured.' });
    return;
  }

  const path = (req.query.path as string[]).join('/');
  const separator = path.includes('?') ? '&' : '?';
  const url = `${AIRPORTDB_BASE}/${path}${separator}apiToken=${apiToken}`;

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
      },
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);

    if (!upstream.ok) {
      res.status(upstream.status);
    }

    const body = await upstream.text();
    res.send(body);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
