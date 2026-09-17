// AI auto-reply bot for WhatsApp (Meta Cloud API).
// Flow: customer messages "no internet" -> this webhook fires -> Claude walks
// them through the troubleshooting steps -> if it can't fix it, opens a ticket
// straight into the same Firestore project the Reseller Ledger app uses.

require("dotenv").config();
const express = require("express");
const whatsapp = require("./lib/whatsapp");
const ai = require("./lib/ai");
const store = require("./lib/firestore");

const app = express();

// Keep the raw body around too, so we can verify Meta's signature in whatsapp.js.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// --- Webhook verification (Meta calls this once, when you set up the webhook) ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("Webhook verified.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Incoming messages ---
app.post("/webhook", async (req, res) => {
  // Always ack fast so Meta doesn't retry/timeout on us; do the real work after.
  res.sendStatus(200);

  if (!whatsapp.verifySignature(req)) {
    console.warn("Webhook signature check failed — ignoring.");
    return;
  }

  const incoming = whatsapp.extractIncomingMessage(req.body);
  if (!incoming) return; // delivery receipt, read receipt, etc. — nothing to do

  try {
    await handleMessage(incoming);
  } catch (err) {
    console.error("Error handling message:", err);
  }
});

async function handleMessage({ from, text, name }) {
  let session = await store.getSession(from);
  if (!session) {
    session = {
      phone: from,
      name: name || "",
      company: process.env.DEFAULT_COMPANY || "",
      messages: [],
      resolved: false,
      ticketCreated: false,
      createdAt: new Date().toISOString(),
    };
  }

  // Once a ticket's been opened, a human is handling it — stop auto-replying
  // so the bot doesn't talk over your team.
  if (session.ticketCreated) return;

  session.messages.push({ role: "user", content: text });

  // Give the model the company if we already know it, so it doesn't ask again.
  const history = [...session.messages];
  if (session.company) {
    history.unshift({
      role: "user",
      content: `[internal note, not from the customer: this customer is already confirmed as a ${session.company} customer]`,
    });
  }

  const { reply, handoff, handoffSummary, company } = await ai.getReply(history);

  if (company && !session.company) session.company = company;
  session.messages.push({ role: "assistant", content: reply });

  if (reply) await whatsapp.sendText(from, reply);

  if (handoff) {
    const { ticketNumber } = await store.createTicket({
      company: session.company || "Libancom",
      subjectName: session.name || from,
      problem:
        (handoffSummary || "Customer's internet issue was not resolved via the WhatsApp assistant.") +
        `\n\nFull chat:\n` +
        session.messages.map((m) => `${m.role === "user" ? "Customer" : "Bot"}: ${m.content}`).join("\n"),
    });
    session.ticketCreated = true;
    session.ticketNumber = ticketNumber;
    session.resolved = true;
  }

  await store.saveSession(from, session);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WhatsApp AI bot listening on port ${PORT}`));
