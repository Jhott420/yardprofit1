// Netlify Function: subscribe.js
// Handles:
//   1. Add email to Mailchimp with tags
//   2. Trigger SparkLoop webhook for referral program
//   3. Send welcome email via Mailchimp

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const {
      email,
      tags = ["Trial"],
      source = "app"
    } = JSON.parse(event.body || "{}");

    if (!email || !email.includes("@")) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid email" }) };
    }

    const API_KEY      = process.env.MAILCHIMP_API_KEY;
    const LIST_ID      = "70b61ce486";
    const SPARKLOOP_KEY = process.env.SPARKLOOP_API_KEY; // Optional
    const DC           = API_KEY ? API_KEY.split("-").pop() : "us14";

    const results = {};

    // ── 1. Add to Mailchimp ─────────────────────────────────────────────────
    if (API_KEY) {
      try {
        const mcRes = await fetch(
          `https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              email_address: email,
              status: "subscribed",
              tags,
              merge_fields: { SOURCE: source }
            })
          }
        );
        const mcData = await mcRes.json();

        // If member exists, update their tags
        if (!mcRes.ok && mcData.title === "Member Exists") {
          const hash = require("crypto").createHash("md5").update(email.toLowerCase()).digest("hex");
          await fetch(
            `https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members/${hash}/tags`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                tags: tags.map(t => ({ name: t, status: "active" }))
              })
            }
          );
        }
        results.mailchimp = "ok";
      } catch (err) {
        results.mailchimp = "error: " + err.message;
      }
    }

    // ── 2. SparkLoop webhook ────────────────────────────────────────────────
    if (SPARKLOOP_KEY && tags.includes("Lead-Magnet-Subscriber")) {
      try {
        const slRes = await fetch("https://api.sparkloop.app/v1/subscribers", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SPARKLOOP_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            source: "yardprofit_lead_magnet",
            tags: ["Lead-Magnet-Subscriber"]
          })
        });
        results.sparkloop = slRes.ok ? "ok" : "error " + slRes.status;
      } catch (err) {
        results.sparkloop = "error: " + err.message;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, results })
    };

  } catch (err) {
    console.error("Subscribe error:", err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ captured: true, error: err.message })
    };
  }
};
