# General-Purpose Computer-Use AI Agent

A production-minded prototype of a general-purpose computer-use AI agent.

The system accepts natural-language tasks and operates a browser/computer to complete multi-step real-world workflows.

---

## Architecture

```
USER GOAL
→ TASK PLANNING
→ OBSERVATION
→ DECISION
→ TOOL EXECUTION
→ VERIFICATION
→ RECOVERY
→ NEXT STEP
→ COMPLETION
```

### Core Principle

The AI model **never** directly controls the computer.

```
LLM / VLM
    ↓
structured action
    ↓
tool registry
    ↓
policy / validation layer
    ↓
runtime executor
    ↓
browser / computer
    ↓
new observation
    ↓
agent loop
```

---

## Project Structure (Phase 1)

```
backend/
├── scripts/
│   └── test-browser.js          # Standalone CLI browser test
├── screenshots/                 # Debug screenshots (gitignored)
├── src/
│   ├── config/
│   │   └── index.js             # Centralized config from env vars
│   ├── controllers/
│   │   └── browser.controller.js
│   ├── middleware/
│   │   └── error.handler.js
│   ├── perception/
│   │   └── page-state/
│   │       └── page-state.extractor.js  # Normalized page state (Phase 2: adds DOM/a11y)
│   ├── routes/
│   │   ├── index.js
│   │   └── browser.routes.js
│   ├── runtime/
│   │   └── browser.runtime.js   # ← All Playwright code lives here
│   ├── app.js                   # Express app setup
│   └── server.js                # Entry point
├── .env                         # Local config (never commit)
├── .gitignore
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v24 |
| Server | Express 5 |
| Browser | Playwright + Chromium |
| AI (Phase 4+) | Gemini via Model Gateway abstraction |
| Database (Phase 9+) | PostgreSQL + Prisma 8 |
| Queue (Phase 12+) | Redis + BullMQ |
| Realtime (Phase 13+) | Socket.IO |
| Frontend (Phase 14+) | React |

---

## Getting Started

### Prerequisites

- Node.js 18+ (tested on v24.20.0)
- npm

### Install

```bash
cd backend
npm install
npx playwright install chromium
```

### Configuration

Copy `.env` and adjust if needed:

```bash
# .env defaults
PORT=3000
NODE_ENV=development
BROWSER_HEADLESS=true       # false = visible Chromium window
BROWSER_SLOW_MO=0           # ms to slow each action (for debugging)
BROWSER_NAVIGATION_TIMEOUT=30000
SCREENSHOTS_DIR=screenshots
```

---

## Running Phase 1 Tests

### Option A — CLI (recommended for Phase 1)

```bash
cd backend
node scripts/test-browser.js
```

Expected output:
```
══════════════════════════════════════════════
  Phase 1 — Browser Runtime Test
══════════════════════════════════════════════

[ 1/5 ] Launching Chromium…
        ✓ Browser launched

[ 2/5 ] Navigating to https://www.google.com…
        ✓ Navigation complete
          URL   : https://www.google.com/
          Title : Google

[ 3/5 ] Extracting page state…
        ✓ Page state extracted

        Page State:
          {
            "url": "https://www.google.com/",
            "title": "Google",
            "timestamp": "...",
            "elements": []
          }

[ 4/5 ] Capturing debug screenshot…
        ✓ Screenshot saved
          Path: …/screenshots/phase1-test-google.png

[ 5/5 ] Closing browser…
        ✓ Browser closed cleanly

══════════════════════════════════════════════
  ✅ PASS — All steps completed successfully
══════════════════════════════════════════════
```

### Option B — HTTP API

```bash
# Start the server
npm run dev

# In another terminal
curl -X POST http://localhost:3000/api/browser/test
```

Response:
```json
{
  "success": true,
  "durationMs": 3500,
  "steps": [
    { "step": "launch", "status": "ok" },
    { "step": "navigate", "status": "ok", "result": { "url": "...", "title": "Google" } },
    { "step": "extract_page_state", "status": "ok", "result": { ... } },
    { "step": "screenshot", "status": "ok", "result": { "path": "..." } },
    { "step": "close", "status": "ok" }
  ]
}
```

### Health Check

```bash
curl http://localhost:3000/api/health
```

---

## Phased Implementation

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | ✅ Done | Repository inspection |
| 1 | ✅ Done | Browser runtime — Playwright + Chromium |
| 2 | Pending | Structured perception — DOM/accessibility extraction |
| 3 | Pending | Tool registry |
| 4 | Pending | Model Gateway (Gemini abstraction) |
| 5 | Pending | Single-step agent (Gemini connected) |
| 6 | Pending | Observe → Decide → Act → Verify loop |
| 7 | Pending | Vision fallback (screenshot only when needed) |
| 8 | Pending | Task planner (multi-step task graph) |
| 9 | Pending | Persistence (PostgreSQL + Prisma 8) |
| 10 | Pending | Recovery engine |
| 11 | Pending | Human-in-the-loop / policy levels |
| 12 | Pending | Redis + BullMQ (async task queue) |
| 13 | Pending | Socket.IO (real-time events) |
| 14 | Pending | React dashboard |
| 15 | Pending | Desktop control (Windows) |
| 16 | Pending | Memory |
| 17 | Pending | Benchmarks |

---

## Engineering Principles

- **No hardcoded secrets** — all config from `.env`
- **Modular** — each concern in its own file/directory
- **AI never controls the browser directly** — tool registry + executor layer between them
- **Screenshots are opt-in** — never automatic, vision is a fallback
- **Design for failure** — every action has a verification strategy
- **Deterministic code for deterministic tasks** — AI only handles reasoning
