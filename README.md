# Reseller Ledger — WhatsApp AI Assistant

An automatic AI reply bot for WhatsApp. When a customer messages about no internet, it
walks them through the same troubleshooting steps from the "Back Online" flowchart —
conversationally, one step at a time, in whatever language/dialect the customer writes in.
If it can't fix the issue, it opens a ticket directly in the Reseller Ledger app's Tickets
module, so your team picks it up from there like any other ticket.

This does **not** need Firebase's paid Blaze plan — it only reads/writes Firestore using a
service account, which works on the free Spark plan.

## What you need to set up (accounts only you can create)

### 1. Your existing WhatsApp number, via "Coexistence"
Good news: you do **not** need a new number. Meta has a feature called **Coexistence** that
lets your current WhatsApp Business App and this bot (via the Cloud API) share the same
number at the same time — your team can still reply manually from the phone app exactly as
today, while the bot also handles automated replies. Messages sync both ways between the
app and the bot.

Before you start, check:
- Your WhatsApp Business app is updated to version 2.24.17 or newer
- You (or whoever manages the number) open the app at least once every 13 days — that's
  Meta's rule for keeping the coexistence link active
- Lebanon is supported for this (it is, as of this writing — only a short list of other
  countries is excluded)

You'll connect the number to this bot through Meta's **Embedded Signup** flow when you set
up the App in the next step, instead of adding a brand-new number.

If you'd rather keep things fully separate (e.g. a different number just for the bot, so
nothing about your day-to-day WhatsApp changes at all), that still works too — just add a
new number in step 2 instead of your existing one.

### 2. Meta Business + WhatsApp Cloud API
1. Go to [business.facebook.com](https://business.facebook.com) and create/verify a
   Business Manager (your business name, address — Meta may ask for a document).
2. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create
   App** → type **Business** → add the **WhatsApp** product.
3. Under WhatsApp → **API Setup**, you'll get a **temporary access token** and a **Phone
   Number ID** right away — good enough for testing. Add your real number under **From**
   (follow the verification prompts — you'll get an SMS/call code).
4. For a token that doesn't expire in 24 hours, create a **System User** (Business Settings
   → Users → System Users), give it access to the WhatsApp app, and generate a **permanent
   token** from there instead.
5. Copy the **Access Token** and **Phone Number ID** into your `.env` (see below).

### 3. Claude API key
Go to [console.anthropic.com](https://console.anthropic.com) → **API Keys** → create one,
and add billing (a few dollars a month covers this comfortably at small scale). Put the key
in `.env` as `ANTHROPIC_API_KEY`.

### 4. Firebase service account
In the **same Firebase project** the Reseller Ledger app already uses
(`reseller-ledger-38c55`): Firebase Console → ⚙️ **Project Settings** → **Service Accounts**
→ **Generate new private key**. This downloads a `.json` file — open it, copy its *entire*
contents, and paste it as one line into `.env` as `FIREBASE_SERVICE_ACCOUNT_JSON`.

### 5. Hosting (so Meta has a public URL to call)
This needs to run somewhere reachable on the internet 24/7 — your computer won't work for
this. Recommended: **Render.com**.
1. Push this folder to a GitHub repo (a new one, e.g. `reseller-ledger-whatsapp-bot`).
2. On Render: **New** → **Web Service** → connect that repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add all the variables from `.env.example` under **Environment** in Render's dashboard
   (paste the real values, not the placeholders).
5. Once deployed, Render gives you a URL like `https://reseller-ledger-whatsapp-bot.onrender.com`.

The free Render tier sleeps after inactivity, which would make the bot's first reply of the
day slow (10-30s). The $7/month "Starter" tier keeps it always-on — worth it for something
customers depend on.

## Connecting the webhook

Back in Meta for Developers → your App → WhatsApp → **Configuration**:
- **Callback URL**: `https://<your-render-url>/webhook`
- **Verify Token**: whatever you set as `WHATSAPP_VERIFY_TOKEN` in your `.env`
- Click **Verify and Save**, then subscribe to the **messages** webhook field.

That's it — message the dedicated number from your own phone to test it end to end.

## Local testing (optional, before deploying)

```bash
npm install
cp .env.example .env   # then fill in the real values
npm start
```

You'll need a tunnel (e.g. `ngrok http 3000`) to give Meta a temporary public URL while
testing locally, since Meta can't reach `localhost`.

## How it decides when to open a ticket

The AI is instructed to go through the 5 steps from the flowchart one at a time. If the
customer's internet is still down after the relevant checks — or they ask for a human — it
tells the customer a team member will follow up, and creates a ticket with:
- **Category**: Connectivity
- **Priority**: Medium (change this in `lib/firestore.js` → `createTicket` if you want the
  bot to set it based on how urgent the customer sounds)
- **Status**: Open, unassigned — pick it up from the Tickets tab like any other ticket
- **Problem**: an AI-written summary plus the full chat transcript, so whoever picks it up
  has full context

## Two companies (Libancom / Buffer ISP)

If you run one WhatsApp number for both brands, leave `DEFAULT_COMPANY` blank in `.env` —
the bot will ask each new customer which one they're with before troubleshooting, and tag
the ticket accordingly. If you'd rather run a separate number per company, deploy this
twice (two Render services, two `.env`s) and set `DEFAULT_COMPANY` on each so it never has
to ask.

## Costs (as of Sept 2026, Middle East region)

- **Meta**: first 1,000 customer-service replies per month are free per number, then about
  $0.0091 each.
- **Claude (Haiku)**: a few dollars a month at this scale.
- **Hosting**: $0–7/month depending on the Render tier.

Realistically well under $30/month total unless volume grows a lot.
