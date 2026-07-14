export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const targetPath = url.searchParams.get("path") || "/api/states/all";
    const query = url.searchParams.get("query") || "";
    const target = `https://opensky-network.org${targetPath}${query ? "?" + query : ""}`;

    try {
      const resp = await fetch(target, {
        method: request.method,
        headers: {
          Accept: "application/json",
          ...(request.headers.get("Authorization")
            ? { Authorization: request.headers.get("Authorization") }
            : {}),
        },
      });
      const body = await resp.text();
      return new Response(body, {
        status: resp.status,
        headers: {
          "Content-Type": resp.headers.get("content-type") || "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
