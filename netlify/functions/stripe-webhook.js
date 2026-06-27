// netlify/functions/stripe-webhook.js
// Verifies Stripe payment webhooks and tags paid subscribers in Mailchimp.
// Configure in Stripe dashboard: endpoint URL = https://<your-site>/.netlify/functions/stripe-webhook
// Events to listen for: checkout.session.completed, customer.subscription.deleted

const crypto = require("crypto");

function verifySignature(rawBody, sigHeader, secret) {
  const parts = sigHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3);
  if (!timestamp || !v1) return false;
  // Reject events older than 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

async function tagPaidSubscriber(email) {
  const API_KEY = process.env.MAILCHIMP_API_KEY;
  if (!API_KEY) return;
  const DC = API_KEY.split("-").pop();
  const LIST_ID = "70b61ce486";
  const hash = crypto.createHash("md5").update(email.toLowerCase()).digest("hex");
  const auth = `Basic ${Buffer.from(`anystring:${API_KEY}`).toString("base64")}`;
  const base = `https://${DC}.api.mailchimp.com/3.0/lists/${LIST_ID}/members/${hash}`;

  await fetch(base, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      email_address: email,
      status_if_new: "subscribed",
      status: "subscribed",
    }),
  });

  await fetch(`${base}/tags`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      tags: [
        { name: "Paid-Subscriber", status: "active" },
        { name: "Trial", status: "inactive" },
      ],
    }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sig = event.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    if (secret && sig) {
      if (!verifySignature(event.body, sig, secret)) {
        console.error("Stripe signature verification failed");
        return { statusCode: 400, body: "Invalid signature" };
      }
    }
    stripeEvent = JSON.parse(event.body);
  } catch (err) {
    console.error("Webhook parse error:", err.message);
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const type = stripeEvent.type;
  const obj = stripeEvent.data?.object;

  if (type === "checkout.session.completed") {
    const email = obj?.customer_email || obj?.customer_details?.email;
    console.log("Payment confirmed:", { email, session_id: obj?.id, amount: obj?.amount_total });
    if (email) {
      await tagPaidSubscriber(email).catch((e) =>
        console.error("Mailchimp tag error:", e.message)
      );
    }
  }

  if (type === "customer.subscription.deleted") {
    console.log("Subscription cancelled:", obj?.id, obj?.customer);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ received: true }),
  };
};
