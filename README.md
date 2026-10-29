# BookLeaf Author Support & Communication Portal

A two-sided web app (author portal + admin portal) where authors raise support tickets and BookLeaf's ops team handles them faster with AI-assisted classification, prioritisation and drafted replies.

- **Live demo:** `https://frontend-ft66.vercel.app`  ·  **API docs (Swagger):** `https://bookleaf-portal-2d11.onrender.com/api/docs`
- **Stack:** React (Vite) · Node.js + Express 5 · MongoDB (Mongoose) · Server-Sent Events · Groq LLM API

## Test credentials (seeded)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@bookleaf.com` | `Admin@123` |
| Author (2 books, pending royalty) | `priya.sharma@email.com` | `Author@123` |
| Author (never paid, pending ₹2,546) | `ananya.reddy@email.com` | `Author@123` |
| Author (book in production) | `kavita.deshmukh@email.com` | `Author@123` |
| Author (3 books, one in cover design) | `sneha.kulkarni@email.com` | `Author@123` |

All 10 authors from `bookleaf_sample_data.json` are seeded with password `Author@123` and their own email. Six demo tickets are pre-loaded so the admin queue is not empty.

## Run locally

Requirements: Node 20+, a MongoDB (local, or free MongoDB Atlas), optionally a free Groq API key.

```bash
# 1. API
cd backend
cp .env.example .env          # set MONGODB_URI, JWT_SECRET, GROQ_API_KEY
npm install
npm run seed                  # loads the sample dataset + demo tickets + admin user
npm run dev                   # http://localhost:5000  (Swagger: /api/docs)

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173  (Vite proxies /api to :5000)

# 3. Tests (needs MongoDB + seeded data)
cd backend && npm test
```

**No Groq key?** The app still works end to end: tickets are classified by keyword rules, and admins write replies manually (see "Graceful degradation").

## Deploy (free tier)

1. **Database:** MongoDB Atlas free cluster. Allow access from anywhere (`0.0.0.0/0`), copy the connection string.
2. **API on Render:** New Web Service, root dir `backend`, build `npm install`, start `npm start`. Env vars: `MONGODB_URI`, `JWT_SECRET` (long random string), `GROQ_API_KEY`, `CLIENT_ORIGIN` (your frontend URL, comma-separate for several). Then run the seed once from the Render shell: `npm run seed`.
3. **Frontend on Vercel:** root dir `frontend`, framework Vite, env `VITE_API_URL=https://<your-render-app>.onrender.com/api`. `vercel.json` already handles SPA routing.
4. Render's free tier sleeps after inactivity: open the API URL once before a demo.

## Architecture

```
backend/src
  config/        env (single place secrets are read), db
  models/        User, Author, Book, Ticket
  middleware/    auth (JWT + role guard), validate (zod), errorHandler
  routes/        auth, books, tickets (author), admin, stream (SSE)
  services/
    ticketAI.js  orchestration: triage + draft, fallback, policy rules
    events.js    SSE hub
    ai/          groqClient, prompts, knowledgeBase, context (facts), fallbackClassifier
frontend/src
  pages/author   Books, NewTicket, MyTickets
  pages/admin    Queue, TicketDetail
```

Key decisions:

- **Routes are thin; logic lives in services.** Routes validate input and call services. The AI layer has no Express code, so it is unit-testable with a mocked `fetch`.
- **Two roles, two route trees.** `/api/tickets` is author-only and always scoped by `req.user.author`; `/api/admin/*` is admin-only. Authors never send an author id, so there is nothing to tamper with. Another author's resource returns 404, not 403, so existence is not leaked.
- **Author responses are projections.** Authors get tickets with internal notes, AI draft, AI reasoning, category, assignee and sources stripped at query level.
- **Real-time via SSE.** One-way server push is all that is needed, it works through simple proxies and `EventSource` reconnects automatically. Events carry only `{type, ticketId}`; clients refetch through the normal authorised REST API, so SSE can never leak data. Every (re)connect triggers a refetch so nothing is missed. Authors only receive events for their own tickets. (`EventSource` cannot set headers, so the JWT is accepted as `?token=` on that one route.)
- **Denormalised sort fields** (`priorityRank`, `isActive`) keep the "most urgent, then oldest" queue sort a single indexed query.
- **Uniform errors:** every failure is `{ error: { code, message, details? } }`; zod validation errors list the failing fields; no generic 500s for client mistakes. Login is rate limited.
- **Overrides are sticky.** Each of category/priority records its source (`ai`, `rules`, `admin`). If an admin overrides while an AI call is in flight, or re-runs AI later, the admin's value is never overwritten.

## AI integration

**Model choice: Groq (Llama 3.1 8B + Llama 3.3 70B).** The task is short classification plus templated-tone drafting grounded in supplied policy, which small open models do well. Groq has a free tier, very low latency (admins see a draft almost instantly), and an OpenAI-compatible API. I split the models by task to control cost: the cheap 8B model does classification, the 70B model writes drafts. Both are env-configurable (`GROQ_TRIAGE_MODEL`, `GROQ_DRAFT_MODEL`), and everything provider-specific is in `groqClient.js`, so swapping providers is a one-file change.

**Two calls, two jobs:**

1. **Triage (on ticket creation, background).** Prompt has category definitions and priority rules only, no knowledge base. JSON mode, `temperature: 0`, `max_tokens: 120`. Output is validated with zod against the exact category/priority enums; anything invalid is treated as a failure. Then a **policy floor** in code applies KB rules the model must not break (ISBN errors are always at least High).
2. **Draft (lazy, when an admin opens the ticket).** The system prompt has company overview, the tone guidelines, **only the policy section for that ticket's category**, one few-shot example for that category (style, not facts), and strict rules (no invented numbers, own BookLeaf's mistakes, give a 48-hour timeline, end with a next step, sign-off format). The user message has computed **facts** plus the author's text.

**Facts computed in code, not by the LLM.** `context.js` turns the author's records into compact facts: the book's status/MRP/copies/earned/paid/pending/last payout/platforms, the author's total pending vs the ₹1,000 threshold, the **next payout deadline** (quarter end + 45 days), and flags like `NEVER PAID although pending is above threshold: OVERDUE` or `below threshold: roll-over is expected`. The model only writes the words, so it cannot hallucinate a payout date or misread a balance. Books still in production are described as having no sales or royalty. General tickets get a one-line summary per book.

**Cost awareness.**
- Triage uses the small model, no KB, input clipped to ~1.7k chars, 120 output tokens.
- Drafts are generated only when a ticket is opened (tickets nobody opens cost nothing), cached on the ticket, and reused unless the category changed or the admin clicks Regenerate.
- Per call the draft prompt carries one category's policy + one example (not the whole KB) and only the relevant book(s). No ticket history is resent.
- Token usage is logged per call and counted in `GET /api/admin/ai/status`.

**Graceful degradation.** Ticket creation never waits on AI (fire-and-forget after the 201).
- 20 s timeout, 2 retries with backoff on 429/5xx/timeouts (honours `retry-after`), concurrency cap of 2 so bursts do not self-inflict rate limits.
- Circuit breaker: 3 consecutive failures pause AI calls for 60 s (fail fast, no hanging admins).
- If triage fails: the ticket is classified by **keyword rules** (marked `Rules`), `aiStatus` records `failed`/`skipped`, the admin sees a banner with a **Retry AI** button.
- If drafting fails: `503` with a clear message; the reply box stays editable so the admin writes manually.
- No `GROQ_API_KEY`: everything above runs in manual mode.

**Security.** The key is read only in `config/env.js` from the environment; it is never sent to the browser and not in the repo (`.env` is git-ignored, `.env.example` has no secrets). Author text is clipped and fenced in `<ticket>`/`<author_message>` tags with an explicit "untrusted data" rule against prompt injection, and nothing the model returns is executed.

## API

Interactive docs: **`/api/docs`** (Swagger UI from `backend/openapi.yaml`). Summary:

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | Email + password, returns JWT |
| GET | `/api/auth/me` | any | Current user |
| GET | `/api/books`, `/api/books/:id` | any | Author: own books. Admin: all |
| POST | `/api/tickets` | author | Create ticket (validated; AI triage runs in background) |
| GET | `/api/tickets`, `/api/tickets/:id` | author | Own tickets with admin responses |
| GET | `/api/admin/tickets` | admin | Queue: filter by status, category, priority, assignee, date range, search; sort; paginate |
| GET | `/api/admin/tickets/stats` | admin | Counts, oldest waiting, unassigned |
| GET | `/api/admin/tickets/:id` | admin | Full ticket + internal notes + book record |
| PATCH | `/api/admin/tickets/:id` | admin | Status, override category/priority, assign |
| POST | `/api/admin/tickets/:id/notes` | admin | Internal note (never visible to author) |
| POST | `/api/admin/tickets/:id/responses` | admin | Reply to author (live to them) |
| POST | `/api/admin/tickets/:id/ai/draft` | admin | AI draft (`?regenerate=true`) |
| POST | `/api/admin/tickets/:id/ai/triage` | admin | Retry AI classification |
| GET | `/api/admin/ai/status` | admin | AI health + token counters |
| GET | `/api/stream?token=` | any | SSE events |

Status codes: `400` validation (with `details`), `401` missing/invalid token or credentials, `403` wrong role, `404` not found or not yours, `429` rate limited, `503` AI unavailable.

## Product decisions

- **Admin queue** defaults to active tickets sorted by priority then oldest first; Critical rows get a red edge, tickets waiting over 48 h show their age in red; stat tiles show active, critical, unassigned and longest waiting.
- **Replying takes ownership:** sending a reply auto-assigns an unassigned ticket and moves Open to In Progress (the admin can pick the resulting status).
- **Author view** shows a plain-language hint per status, a "New reply" highlight when an admin responds live, and book cards with sensible handling for books in production (no fake zero royalties) and never-paid books ("No payout yet").
- **Empty/error states** everywhere; the book-card link pre-selects the book in the query form.

## Known limitations / next steps

- Attachments are UI-only (file name stored). Next: S3/Cloudinary upload with signed URLs and virus scan.
- SSE hub is in-memory (single instance). For multiple instances, back it with Redis pub/sub. Same for the AI circuit-breaker and counters.
- No author reply/follow-up thread or reopen action yet; authors can raise a new ticket.
- No email notifications to authors (would hook onto the same events).
- JWT is kept in `localStorage` for simplicity; production would use httpOnly cookies + refresh tokens, and passwords-reset flow.
- Add an eval set of real tickets to track classification accuracy, and store admin edits to AI drafts as feedback for prompt tuning.
- Royalty facts use today's date; `REFERENCE_DATE` can pin it for demos.
