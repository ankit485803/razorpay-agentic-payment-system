# Razorpay Agentic Payment System

**Razorpay AI Builder Internship 2026 — Track 1: AI Growth & Agentic Commerce**

An AI-powered payment agent that turns natural-language requests into real Razorpay actions. A user types something like *"Send a ₹500 payment request to Priya for the design work"*, and an LLM (Claude) uses tool calling to decide whether — and how — to trigger the Razorpay Test API to create a payment link.

---

## 1. Overview

Traditional payment flows require users to navigate forms: amount field, description field, customer details, submit. This project collapses that into a single conversational input. The LLM is not just generating text — it is given a **tool** (`create_payment_link`) with a strict schema, and it decides on every turn whether the user's message contains enough information to safely call it, needs clarification first, or isn't a payment request at all.

The system is intentionally lean: one Express backend, one React chat frontend, one tool. The focus is on getting the agent loop and edge-case handling right rather than building a large surface area.

---

## 2. Key Design Points

### Tool-calling loop, not a prompt template

The backend does not ask Claude to "generate JSON for a payment link" and hope the format is parseable. It registers `create_payment_link` as a proper Claude tool with an `input_schema`, and lets the model decide when to invoke it via the standard `tool_use` / `tool_result` loop. This means:

- Claude can ask a clarifying question instead of calling the tool, if the request is incomplete.
- The tool's execution result (success or failure) is fed back to Claude, so the *final* reply the user sees is generated with full knowledge of what actually happened on the Razorpay side.

### Defense in depth on validation

Amount validation happens twice: once in the system prompt (so Claude avoids calling the tool with bad input in the first place), and again in the tool executor itself (so a malformed or adversarial input never reaches the Razorpay API unchecked).

### Architecture

```

+-------------------+       POST /api/agent        +------------------------+
|   React Client    | ---------------------------> |     Express Server     |
| (chat UI, :5173)  | <--------------------------- |   (index.js, :3000)    |
+-------------------+     { reply, paymentLink }   +------------------------+
                                                               |
                                                               v
                                                   +------------------------+
                                                   |        agent.js        |
                                                   |    claude tool-call    |
                                                   |      loop (system      |
                                                   |     prompt + tools)    |
                                                   +------------------------+
                                                               |
                                                               | tool_use
                                                               v
                                                   +------------------------+
                                                   |        tools.js        |
                                                   |   validate input ->    |
                                                   |   call Razorpay SDK    |
                                                   +------------------------+
                                                               |
                                                               v
                                                   +------------------------+
                                                   |   Razorpay Test API    |
                                                   |    (Payment Links)     |
                                                   +------------------------+
                                                   
```

---

## 3. Features

- Natural-language payment requests — no forms
- Claude tool calling to trigger Razorpay's Payment Links API (test mode)
- Server-side input validation independent of what the LLM decides
- Graceful fallback responses for cancelled payments, missing/invalid amounts, and Razorpay API failures
- Minimal, distinct chat UI (React + Vite) — no UI framework bloat
- Clean separation: `client/` (frontend) and `server/` (backend)

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (Vite) |
| Backend | Node.js, Express (ES Modules) |
| AI Agent | Anthropic Claude — tool calling |
| Payments | Razorpay Node SDK — Test Mode |
| Config | dotenv |

---

## 5. Project Structure

```
razorpay-agentic-payment-system/
├── .gitignore
├── README.md
├── server/
│   ├── package.json
│   ├── .env
│   ├── index.js            # Express app — /health + /api/agent routes
│   ├── agent.js             # Claude tool-calling loop (core agent logic)
│   └── tools.js             # create_payment_link tool schema + executor
└── client/
    ├── package.json
    ├── vite.config.js       # dev proxy: /api, /health → localhost:3000
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx           # chat UI — messages, input, payment link card
        └── index.css
```

---

## 6. Setup & Installation

### Prerequisites

- Node.js 18+
- A Razorpay account with **Test Mode** API keys
- An Anthropic API key

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/ankit485803/razorpay-agentic-payment-system.git
cd razorpay-agentic-payment-system

# 2. Set up the backend
cd server
cp .env      # then fill in your real keys — see below
npm install
npm run dev               # → http://localhost:3000

# 3. In a separate terminal, set up the frontend
cd client
npm install
npm run dev               # → http://localhost:5173
```

Open **http://localhost:5173** in your browser and start chatting.

### Environment variables (`server/.env`)

| Variable | Description |
|---|---|
| `PORT` | Port the Express server runs on (default `3000`) |
| `RAZORPAY_KEY_ID` | Test-mode key ID from the [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys) |
| `RAZORPAY_KEY_SECRET` | Test-mode key secret |
| `ANTHROPIC_API_KEY` | From [Anthropic Console](https://console.anthropic.com/settings/keys) |

---

## 7. API Reference

### `GET /health`

Returns server liveness status.

```json
{ "status": "ok", "timestamp": "2026-09-05T12:00:00.000Z" }
```

### `POST /api/agent`

Accepts a natural-language message, runs it through the Claude tool-calling agent, and returns a reply plus (optionally) a generated payment link.

**Request**
```json
{ "message": "Send a ₹500 request to Priya for the design work" }
```

**Response**
```json
{
  "reply": "Done — here's the payment link for ₹500.",
  "paymentLink": {
    "short_url": "https://rzp.io/i/xxxxxxx",
    "amount": 500,
    "status": "created",
    "id": "plink_xxxxxxxxxxxx"
  }
}
```

If no payment link was created (clarification needed, cancellation, or an error), `paymentLink` is `null` and `reply` contains the agent's plain-language response.

---

## 8. Edge Case Handling

| Scenario | Where it's handled | Behavior |
|---|---|---|
| Amount missing, zero, negative, or not a number | System prompt (`agent.js`) + validation (`tools.js`) | Claude skips the tool call and asks a clarifying question; if it still slips through, the executor rejects it before calling Razorpay |
| Amount unreasonably large (> ₹5,00,000) | `tools.js` | Rejected with a capped-limit error, surfaced as a plain-language reply |
| User mentions cancelling or a failed payment | System prompt (`agent.js`) | No tool call is made; Claude acknowledges and offers to start a new request |
| Razorpay API error (bad keys, network, rejected request) | `tools.js` try/catch → fed back into the agent loop | Raw error is logged server-side only; user sees a generic, friendly fallback message |
| Empty or whitespace-only message from client | `index.js` | Rejected with a `400` before reaching the agent at all |
| Frontend can't reach the backend | `App.jsx` fetch `catch` block | Chat shows a "couldn't reach the server" message instead of failing silently |

**Try these to see it in action:**
- `"cancel my payment"` → acknowledged, no API call
- `"send -500 to Rahul"` → clarifying question, no API call
- `"create a payment request"` (no amount) → clarifying question
- `"Send ₹1200 to Aman for consulting"` → real payment link generated

---

## 9. Roadmap

- [x] Express server with health check
- [x] Razorpay Payment Links tool integration
- [x] Claude tool-calling agent loop
- [x] React chat UI with edge-case fallback handling
- [ ] Transaction / payment status lookup tool
- [ ] Webhook handling for real-time payment confirmation
- [ ] Refund tool
- [ ] Deployment (Render / Railway + Vercel)

---

## 10. Submission Context

Built for the **Razorpay AI Builder Internship 2026 — Track 1: AI Growth & Agentic Commerce**, demonstrating an LLM-driven agent that safely bridges natural language to real payment infrastructure using tool calling, with explicit handling of invalid input and cancelled/failed payment scenarios.
