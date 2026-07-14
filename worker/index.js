const ALLOWED_ORIGINS = [
  "https://aeroflight.up.railway.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
];

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    const targetPath = url.searchParams.get("path") || "/api/states/all";
    const queryString = url.searchParams.get("query") || "";
    const targetUrl = `https://opensky-network.org${targetPath}${queryString ? "?" + queryString : ""}`;

    try {
      const headers = { Accept: "application/json" };
      const auth = request.headers.get("Authorization");
      if (auth) headers["Authorization"] = auth;

      const resp = await fetch(targetUrl, { method: request.method, headers });
      const body = await resp.text();
      const corsHeaders = getCorsHeaders(request);
      corsHeaders["Content-Type"] = resp.headers.get("content-type") || "application/json";

      return new Response(body, { status: resp.status, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...getCorsHeaders(request), "Content-Type": "application/json" },
      });
    }
  },
};
