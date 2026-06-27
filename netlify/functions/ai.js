// netlify/functions/ai.js
// Server-side proxy for Anthropic API — keeps the API key out of the browser bundle.
// Client POSTs the same body it would send to Anthropic; this function adds auth headers.

exports.handler = async (event) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured on server" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const usesWebSearch = Array.isArray(body.tools) &&
    body.tools.some((t) => t.type === "web_search_20250305");

  const anthropicHeaders = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
  };
  if (usesWebSearch) {
    anthropicHeaders["anthropic-beta"] = "web-search-2025-03-05";
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return {
      statusCode: res.status,
      headers: cors,
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error("Anthropic proxy error:", err.message);
    return {
      statusCode: 502,
      headers: cors,
      body: JSON.stringify({ error: "Upstream request failed: " + err.message }),
    };
  }
};
