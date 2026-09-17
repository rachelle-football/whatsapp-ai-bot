// Talks to the SAME Firestore database as the Reseller Ledger app.
// This does NOT need Firebase's Blaze billing plan — reading/writing Firestore
// from your own server with a service account works fine on the free Spark plan.

const admin = require("firebase-admin");

let db = null;

function init() {
  if (db) return db;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is not set. Generate one in Firebase Console > " +
        "Project Settings > Service Accounts > Generate new private key, and paste the " +
        "whole JSON file as one line into your .env."
    );
  }

  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  db = admin.firestore();
  return db;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches the app's date fields
}

// --- Conversation sessions (one doc per customer phone number) ---
// Keeps the back-and-forth message history so the AI has context on every
// new incoming message, since each webhook call is otherwise stateless.

async function getSession(phone) {
  const doc = await init().collection("wa_sessions").doc(phone).get();
  if (!doc.exists) return null;
  return doc.data();
}

async function saveSession(phone, data) {
  await init()
    .collection("wa_sessions")
    .doc(phone)
    .set({ ...data, updatedAt: new Date().toISOString() }, { merge: true });
}

// --- Tickets (same collection + field names the Reseller Ledger app itself writes) ---

async function nextTicketNumber() {
  const snap = await init().collection("tickets").get();
  let maxN = 0;
  snap.forEach((doc) => {
    const m = /(\d+)\s*$/.exec(doc.data().ticketNumber || "");
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  });
  return "TCK-" + String(maxN + 1).padStart(4, "0");
}

async function createTicket({ company, subjectName, problem }) {
  const ticketNumber = await nextTicketNumber();
  const data = {
    ticketNumber,
    issueDate: todayISO(),
    subjectType: "Client",
    resellerId: "",
    subjectName: subjectName || "WhatsApp customer",
    category: "Connectivity",
    priority: "Medium",
    assignedToId: "",
    assignedToName: "",
    status: "Open",
    closeDate: "",
    company: company || "Libancom",
    problem: problem || "Reported via WhatsApp AI assistant — see conversation summary.",
    solution: "",
    createdAt: new Date().toISOString(),
    source: "whatsapp-ai-bot",
  };
  const ref = await init().collection("tickets").add(data);
  return { id: ref.id, ticketNumber };
}

module.exports = { init, todayISO, getSession, saveSession, createTicket };
