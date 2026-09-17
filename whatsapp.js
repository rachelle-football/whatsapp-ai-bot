// Thin wrapper around the WhatsApp Cloud API (Meta) for sending text messages
// and verifying that incoming webhook calls really came from Meta.

const crypto = require("crypto");

const GRAPH_VERSION = "v21.0";

function apiUrl() {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

// Sends a plain text WhatsApp message to `to` (customer's WhatsApp id, e.g. "9613xxxxxxx").
async function sendText(to, body) {
  const res = await fetch(apiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("WhatsApp send failed:", res.status, errText);
  }
  return res.ok;
}

// Meta signs every webhook POST with your App Secret. Verifying this stops
// randoms on the internet from POSTing fake "messages" to your bot.
// Safe to skip while you're first testing (WHATSAPP_APP_SECRET left blank),
// but turn it on before you rely on this for real customers.
function verifySignature(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured yet — allow through

  const signatureHeader = req.headers["x-hub-signature-256"];
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(req.rawBody || "").digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}

// Pulls the useful bits out of a raw webhook payload. Returns null if this
// particular webhook call isn't an incoming customer text message (Meta also
// sends delivery/read receipts through the same webhook — we ignore those).
function extractIncomingMessage(body) {
  try {
    const entry = body.entry && body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const message = value && value.messages && value.messages[0];
    if (!message) return null;

    const from = message.from; // customer's WhatsApp id, e.g. "9613xxxxxxx"
    const text =
      message.text && message.text.body
        ? message.text.body
        : message.button && message.button.text
        ? message.button.text
        : message.interactive && message.interactive.button_reply
        ? message.interactive.button_reply.title
        : null;

    if (!from || !text) return null;

    const contact = value.contacts && value.contacts[0];
    const name = contact && contact.profile && contact.profile.name;

    return { from, text, name: name || "" };
  } catch (e) {
    return null;
  }
}

module.exports = { sendText, verifySignature, extractIncomingMessage };
