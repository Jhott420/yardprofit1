// Netlify Function: stripe-webhook.js
// Verifies Stripe checkout.session.completed events and records paid emails
// Set STRIPE_WEBHOOK_SECRET in Netlify env vars from Stripe dashboard

const crypto = require("crypto");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method not allowed" };
  }

  const sig = event.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  if (webhookSecret && sig) {
    // Verify Stripe signature
    try {
      const payload = event.body;
      const parts = sig.split(",").reduce((acc, part) => {
        const [k, v] = part.split("=");
        acc[k] = v;
        return acc;
      }, {});

      const signedPayload = `${parts.t}.${payload}`;
      const expectedSig = crypto
        .createHmac("sha256", webhookSecret)
        .update(signedPayload)
        .digest("hex");

      if (!sig.includes(`v1=${expectedSig}`)) {
        console.error("Webhook signature mismatch");
        return { statusCode: 400, headers, body: "Invalid signature" };
      }

      stripeEvent = JSON.parse(payload);
    } catch (err) {
      return { statusCode: 400, headers, body: "Webhook error: " + err.message };
    }
  } else {
    // No secret configured — parse but don't verify (dev mode)
    try {
      stripeEvent = JSON.parse(event.body);
    } catch (err) {
      return { statusCode: 400, headers, body: "Invalid JSON" };
    }
  }

  // Handle checkout.session.completed
  if (stripeEvent.type === "checkout.session.completed" ||
      stripeEvent.type === "customer.subscription.created") {

    const session = stripeEvent.data.object;
    const customerEmail = session.customer_email || session.customer_details?.email || "";

    if (customerEmail) {
      // Tag in Mailchimp as paid subscriber
      const API_KEY = process.env.MAILCHIMP_API_KEY;
      const LIST_ID = "70b61ce486";

      if (API_KEY) {
        try {
          const DC = API_KEY.split("-").pop();
          const hash = crypto.createHash("md5").update(customerEmail.toLowerCase()).digest("hex");

          // Update existing member or add new one
          await fetch(`https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members/${hash}`, {
            method: "PUT",
            headers: {
              Authorization: `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              email_address: customerEmail,
              status_if_new: "subscribed",
              status: "subscribed",
              merge_fields: { SOURCE: "stripe_paid" }
            })
          });

          // Add Paid-Subscriber tag
          await fetch(`https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members/${hash}/tags`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              tags: [{ name: "Paid-Subscriber", status: "active" }]
            })
          });

          console.log("Mailchimp updated for:", customerEmail);
        } catch (err) {
          console.error("Mailchimp error:", err.message);
        }
      }
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ received: true })
  };
};
