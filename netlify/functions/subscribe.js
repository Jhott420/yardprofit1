// Netlify Function: subscribe.js
// Adds email to Mailchimp Yardprofit audience (list ID: 70b61ce486)
// Requires MAILCHIMP_API_KEY env var set in Netlify dashboard

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
    const { email, tags = ["Trial"] } = JSON.parse(event.body || "{}");

    if (!email || !email.includes("@")) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid email" }) };
    }

    const API_KEY = process.env.MAILCHIMP_API_KEY;
    const LIST_ID = "70b61ce486";
    const DC = API_KEY ? API_KEY.split("-").pop() : "us14";

    if (!API_KEY) {
      console.log("No MAILCHIMP_API_KEY set — email captured but not synced:", email);
      return { statusCode: 200, headers, body: JSON.stringify({ captured: true, synced: false }) };
    }

    const res = await fetch(`https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email_address: email,
        status: "subscribed",
        tags
      })
    });

    const data = await res.json();

    // 400 with "Member Exists" is fine — just update their tags
    if (res.ok || data.title === "Member Exists") {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ captured: true }) };

  } catch (err) {
    console.error("Subscribe error:", err);
    return { statusCode: 200, headers, body: JSON.stringify({ captured: true }) };
  }
};
