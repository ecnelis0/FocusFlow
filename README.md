# FocusFlow — a wrong-answer journal for any subject

You get a question wrong. You log it. An AI explains *why* you got it wrong and files
it under the kind of mistake it was. Then it comes back — at **1 hour, 24 hours,
72 hours, 1 week and 1 month**.

That schedule is the product. The intervals are fixed and identical for every
question; this is deliberately not an SM-2/Anki ease-factor scheduler. Miss a review
and the ladder restarts from the top.

## What is here

| | |
|---|---|
| `backend/` | FastAPI + SQLAlchemy 2.0 (async). Owns the database, the ladder, and the analyzer. |
| `frontend/` | Next.js App Router + TypeScript, shadcn/ui, TanStack Query, Motion. |

Screens: **Study** at `/`, where material goes in and concepts come out; the bank with
filters; a question detail page with the analysis and its ladder; a review session; a log
form; and a dashboard of slots ("why you're losing points") at `/dashboard`.

Study is the front door on purpose. Everything the other screens list — concepts, the
questions in the bank, the ladder — is what comes *out* of reading some material, so the
first screen is the one that takes it rather than a report on what is already filed.

Search looks at **every field, word by word**: the question, where it came from, both
answers, your note, the topic and the AI's analysis. Each word must appear somewhere, so
"area circle" finds a question about the area of a circle even though those words never
sit next to each other, and "midterm" finds everything from that source.

## Subjects and folders

The bank is not one pile. Across the top of **The bank** are your courses as tabs —
APUSH, SAT, Calculus — and inside each one, the topic folders you make: *Unit 3:
Revolution*, *Related rates*. A folder holds **both halves**: the concepts filed under
that topic and the questions logged against it, so opening one shows what you know and
what you have got wrong about it together.

A subject is a **row**, not a name found by grouping what you have logged. That is the
point: you set your courses up before there is anything in them, and an empty course
still gets a tab to file into. Everything is a link — the tab and the open folder both
live in the URL, so a filtered view is shareable and survives a reload.

Renaming a subject carries the new name to every question and concept under it. Moving
a folder to another subject carries everything inside it. Deleting either keeps the
questions: only *where they were filed* is lost, and they reappear under **Not in a
folder**. Losing where something was filed is bad; losing the question is unthinkable.

**Study takes a folder up front.** Pick it beside the YouTube box before the video
is read — or make one there, subject and all, without leaving the page — and every concept and practice question that comes out of it is filed there
and takes that subject — and the folder's course steers the reading too, because it is
a course you actually set up rather than a word typed once. A question already in the
bank can be moved between folders from its own page.

`backend/app/filing.py` owns the rule that keeps this honest: the folder is
authoritative, each row's `subject` is that folder's name, and nothing else writes
either field.

## Concepts

A concept is the thing behind a family of misses — the rule you keep forgetting, not
the question you got wrong. Its own tab: write one down in your own words, then **tag
questions onto it after the fact** from the question's page. Tagging is many-to-many —
a question can sit under several concepts, and a concept collects many questions.

Filtering the bank by one concept leads with **the concept itself** — its title, your
notes, its diagrams and its count — above the questions filed under it, so the thing you
are revising is on the same screen as the evidence for it. The rail's ↗ opens the
concept's own page.

A concept with nothing tagged is marked **"nothing tagged"** in the rail, and filtering
by it says which concept is empty rather than showing a bare "nothing matches". The rail
also offers **"No concept yet"** — every question filed under nothing — and the dashboard
says how many those are, so the gap is visible instead of something you find by scrolling.

**The Concepts tab groups them by subject.** A subject is whatever you type — "Biology",
"Calculus", "Spanish" — and the form offers the ones already in your bank so one subject
does not end up spelled three ways. Concepts with no subject get their own group.

Tag from either end: from a question's page, or from the concept's own page — there is
a search-and-pick list at the bottom of every concept, and what you tag appears
underneath it immediately. Every question in the bank shows the concepts it belongs to
on its card. The rail filters the bank by concept alongside every other facet. Deleting
a concept removes only the tags; the questions are untouched.

## Scanning notes into concepts

You do not have to type a concept to have one. **Study**, the app's front page, takes a photo of
a handwritten page, a PDF, a text file, a pasted block of text, a **recording** — drop a
file, or press *Record a voice note* and talk — or a **YouTube link**. For a video the
captions are read (the uploader's, then YouTube's automatic ones); a video with none has
its audio downloaded and transcribed locally, the same path a recording takes. The AI goes through the whole thing, every
page, and lists **every concept it contains with a description of each**, and where it
came from ("page 3"). They come back as something to read — a heading and its
description in prose — because understanding what the AI found is the point and a page
of form fields is the one shape that cannot be read. Correcting any of it is behind
**Edit** on the concept itself.

**It pulls out the practice questions too.** Every question the material poses — worked
examples, exercises, quiz items, the questions a lecturer asks and then answers — is listed
under the concept it exercises, with its answer. A lecture often poses none, so for any
concept the material never questions the model writes one or two short ones itself, and
they are labelled **"written for you"** so you can tell them apart. Approved questions go
into the bank as *not attempted yet*, tagged `practice`, filed under their concept, and on
the ladder from that moment — so they come round in Review, where you answer and get
marked. Their source is the video's title or the kind of scan.

**Nothing is filed until you say so.** The list comes back as a form: edit any title,
description or subject, untick what you do not want, then *Approve and log*. Only then
are the concepts written, with the picture attached to the ones it produced. Discard
throws the whole proposal away.

The model is handed the concepts already in your bank before it reads, so when the page
covers something you already have, it proposes **adding to that concept** rather than
filing it twice — shown as a ticked "Add to existing …" you can untick to file it as new.
The result screen says which happened for each one ("new" or "added to existing") and
links to each; a recording's transcript is shown so a mis-heard word is visible instead
of silently filed.

What the model sees is the bytes, not the filename: a text file named `.png` is read as
text, and anything that is not a picture, a PDF, a recording or UTF-8 text is refused with
a reason. Pictures are capped at 10MB, PDFs at 32MB, recordings at 25MB.

Claude reads pictures and PDFs directly. It takes no audio, so **recordings are
transcribed locally first** with Whisper (`faster-whisper`): no second API key, and the
audio never leaves the machine — only the transcript goes to the extractor. It is an
optional extra because it downloads a model on first use:

```bash
cd backend && uv sync --extra audio
```

Without it, an audio upload gets a 503 that says exactly that, and everything else still
works. `GET /health` reports `transcriber` and `transcriber_ready`. With `AI_PROVIDER=stub`
the offline extractor splits pasted text into paragraphs and calls each one a concept;
it cannot read a picture, so it files the page as one placeholder concept with the picture
attached. The endpoints are `POST /capture` (multipart: `file` or `text`, optional
`subject`) which proposes, `POST /capture/commit` which files what was approved, and
`DELETE /capture/source/{name}` which drops a discarded picture. `backend/app/analysis/extract.py`
holds the contract, the stub and the Claude adapter, `backend/app/transcribe.py` the
transcribers.

## Reviewing: answer it, get marked

A due review shows the question and, for a multiple-choice one, its choices. You pick or
type an answer and press **Check answer**; the server marks it. Case, spacing and
notation are forgiven (`36 pi` is `36π`, `x^2` is `x²`), and a choice can be given as its
letter or its text. Right leaves the ladder alone; wrong sends the question back to the
top, exactly as a self-reported miss did — and only then does the debrief appear, with
the correct answer. **Skip** still exists for when you cannot answer now. The endpoint is
`POST /reviews/{id}/answer`; `is_correct` in `backend/app/routers/reviews.py` is the marker.

## The assistant sees the whole bank

When you ask the panel something, the model is given two things: the rows your sentence
matched, and **the entire bank as background** — every concept with what you wrote about
it, every question with its subject, topic, reason, urgency, tags, concepts, takeaway,
your note and its full review record, and the totals. So "what else is under that
concept" or "how does this compare to my chemistry" can be answered without a second
search. It is still told to count from what it is given, never to invent a row.
`bank_context` in `backend/app/query.py` builds it; it is capped at the newest 300
questions.

## Demo data

```bash
cd backend && uv run python scripts/seed_demo.py --reset
```

Twenty questions across five subjects and ten concepts, logged over the past ten weeks
with their review ladders played forward to today. Four different chain-rule questions
are still wrong every time they come back; one stoichiometry question has been missed
twice. Ask the bank *"which questions have I consistently been getting wrong in the past
month"* and it should name the chain rule first. `--reset` removes only what the script
added (every seeded source starts with `Seed:`).

## Your own labels

Separately from the AI's slots and from concepts, every question takes **labels you write
yourself** — "by mistake", "ran out of time", "forgot the +C". Add them on the log form
while it is fresh: type one and press Enter, or click one you have used before. A starting
vocabulary is offered until you have your own, and labels you invent are offered back to
the next question so the bank does not fill up with three spellings of one idea. They
filter the bank like every other facet, and the assistant is told which ones exist.

The log form also files a question **under a concept as you log it**, rather than only
afterwards — and the question's own page has the same label picker, so a label added later
is the same act as one added at the time. Relabelling never counts as editing the AI's
debrief, so it cannot lock a re-run.

## Pictures and diagrams

**Drag a picture straight onto the log form** while you are writing the question — it
previews there, and uploads once the question is saved. Concepts take diagrams the same
way, both while writing one and afterwards on its page. Drag-and-drop, click-to-browse
and multi-select all work in the same zone.

Click any picture to open it full-size, then zoom (buttons, scroll wheel, or pinch),
pan, and step between pictures with the arrow keys.

A failed upload never costs you the thing it was attached to: the question or concept is
saved first, and a picture that will not upload is reported so you can add it again.

Uploads are validated by **decoding the bytes**, not by trusting the declared type or
the filename: a shell script named `.png` is refused, and the stored filename is
generated by the server so nothing a client sends can reach outside the upload
directory. Limit is 10MB per image; PNG, JPEG, GIF, WebP and HEIC. Files live in
`backend/uploads/` (gitignored) and are served from `/uploads/...`.

## The side panel

A rail on every page, opened with **Ask the bank** in the nav, with two tabs.

**Ask** takes a question in your own words. Before writing the filter, the model is
handed **what your bank actually contains** — your topics, your concept titles, your
sources — so "the circles ones" and "everything under *Circumference gives the radius*"
resolve to filters that match, instead of guessed strings that quietly match nothing.
Overview questions ("what am I worst at") are answered from real tallies computed over
the matched rows, not by asking the model to count a list by eye.

Example:

> give me all the questions logged in the past 3 months that are very important and from
> biology

The model does not answer from a recollection of your bank. It turns the sentence into a
structured filter, the database runs it, and only then does the model get to speak — about
rows that exist. So a count is a count and a list is the real list. The panel prints the
filter it used ("Searched: very important, in Biology, logged since 2026-06-09"), so
a misread sentence looks like a misread sentence rather than an empty bank. Each hit links
straight to the question.

If the model fails to interpret, you get the whole bank rather than nothing. If it fails to
summarise, you still get the rows — the prose is the disposable half.

### What you keep getting wrong

Ask *"which questions have I consistently been getting wrong in the past month"* and you
get an answer built from counts, not from the model's impression of a list:

```
Topics missed across several different questions: inverse trig (4 different questions)
2 question(s) have also been missed again on review, 5 time(s) in total.
Topics that keep coming back: inverse trig (5 repeat misses)
Worst offenders: "cos^-1(0) is which angle?" (3x); "arctan(1) in radians?" (2x)
```

**Two things count as consistently getting something wrong**, and only one of them is
about repeating a question:

- **Breadth** — several *different* questions missed in the same topic, concept or for
  the same reason. Four different inverse trig questions, each wrong once, is a weakness
  in inverse trig even though no single one has ever come back.
- **Repetition** — the same question still wrong when it came round again.

A single question wrong once is never dressed up as a pattern. A review answered *wrong*
is a repeat; the rungs that miss retires are bookkeeping and are excluded. The dashboard
shows both under **"What keeps coming back"**, without needing to ask.

**Categories** is the browsing half. Topics are folded under the subject they belong to —
click a subject's arrow and its topics expand beneath it. Everything is a checkbox, and
selections combine: **OR within a facet, AND across them**. So *Biology + cell respiration +
concept gap + very important* is one click each and returns only questions satisfying all
four. The chosen filters become the URL, so a filtered bank is a link you can share or come
back to, and each one can be peeled off individually from the pills at the top of the bank.

## How urgent is it

Every question carries one of three levels, most urgent first:

| | |
|---|---|
| **Fundamental concept** | The miss exposes a hole in something the rest of the subject is built on. |
| **Very important** | A high-frequency skill, or a trap you will walk into again. |
| **Important** | Worth coming back to, but not what is costing you the most. |

**You can set it while logging**, before the AI sees the question — pick a level on the
log form and the analyzer will not overrule it (the question shows "your call"). Leave it
to the AI and it judges the *gap*, not the question's difficulty. Either way you can
change it later. It is not just a label: **the review queue is ordered by
urgency, then by date**, so when several questions are due at once the one that matters
most is the one on screen. `/reviews/upcoming` stays chronological; urgency decides what
to do now, not what the calendar looks like. The dashboard leads with a "what to fix
first" row, and the bank filters by it.

## The AI is optional, and nothing it writes is final

- **Log it and ask the AI** runs the debrief straight away.
- **Just log it** saves the question with no analysis at all. The ladder still starts.
  The question then sits there offering two buttons: *Ask the AI to debrief this*, and
  *Write it myself*.
- **Everything is editable** — the question, source, choices, both answers, your note,
  and every field the AI wrote: the slot, topic, difficulty, why-you-got-it-wrong, the
  trap, the reasoning, the takeaway, the tags.
- An analysis you wrote or edited **files exactly like an AI one** — same slots, same
  filters, same counts — and is credited to you.
- Re-running the AI over an analysis you have edited **asks first**, and the API refuses
  it outright without `force=true`. Your words are not lost to a stray click.

## Running it

Two processes. The defaults need no configuration at all — SQLite on disk and the
offline analyzer.

```bash
# API on :8000
cd backend && uv sync && uv run uvicorn app.main:app --reload

# Web on :3000
cd frontend && npm install && npm run dev
```

Then open **http://localhost:3000** — `localhost`, not `127.0.0.1`. (The IP works too,
but only because `allowedDevOrigins` is set in `next.config.ts`; without it Next blocks
its own dev resources and the page renders a loading skeleton forever.)

## Configuration

Copy `.env.example` to `.env` at the repo root. Everything has a working default.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./mistake_bank.db` | Neon: `postgresql+asyncpg://…?ssl=require` |
| `AI_PROVIDER` | `stub` | `stub`, `agent` (Claude plan, no key) or `claude` (API key) |
| `ANTHROPIC_API_KEY` | — | Required when `AI_PROVIDER=claude` |
| `TRANSCRIBER` | follows `AI_PROVIDER` | `stub` or `whisper`; see *Scanning notes* |
| `WHISPER_MODEL` | `base` | Any faster-whisper size: `tiny`, `base`, `small`, `medium` |
| `ANTHROPIC_MODEL` | `claude-opus-5` | |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | Where the browser finds the API |

### Turning the real AI on

Two lines in **`.env` at the repo root** — the file is already there, already
gitignored, already `chmod 600`. Edit those two lines and restart the API. No code
change:

```
AI_PROVIDER=agent
```

That is the **Claude Agent SDK** path: the API process drives the Claude Code CLI, and
the CLI bills whatever `claude auth login` signed you into - a claude.ai plan, no API key.
`claude auth status` must say `"loggedIn": true` on the machine running the API; `/health`
checks the same thing and reports `analyzer_ready`. Pictures and PDFs go to the agent as
files it reads with its own `Read` tool; text and transcripts go in the prompt; every
answer comes back through the same structured-output schemas as the API adapter.

Prefer a key? The API adapter is still there:

```
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

Rules that keep it out of trouble:

- **Only in `.env`.** Never in a source file, never in `frontend/`, never pasted into
  a chat or an issue.
- **Never prefix it `NEXT_PUBLIC_`.** That prefix is Next's instruction to inline the
  value into the JavaScript every visitor downloads. `NEXT_PUBLIC_API_URL` is a URL and
  is meant to be public; a key never is.
- **Only the API process reads it.** The browser talks to FastAPI, FastAPI talks to
  Anthropic. The key never crosses to the client.
- `git check-ignore .env` should print a match. If it ever doesn't, stop before
  committing.
- If a key does leak, **rotate it in the Anthropic console** rather than trying to
  scrub it out of history — a pushed secret should be assumed read.

`GET /health` tells you whether it took:

```json
{ "analyzer": "claude", "analyzer_ready": true, "model": "claude-opus-5" }
```

`analyzer_ready: false` means a provider is selected but its key is missing — the
difference between "the AI is off" and "the AI is misconfigured", which is otherwise only
discoverable by watching an analysis fail. Override the model with `ANTHROPIC_MODEL`.

The side panel says which analyzer answered, so the offline stub returning everything is
never mistaken for a real search that matched everything.

**This path is covered by tests, not just by hope.** `tests/test_claude_path.py` drives
the real Anthropic SDK against a stand-in endpoint over a real HTTP stack, and checks the
request shape (model, adaptive thinking, `json_schema` output), that the bank's
vocabulary reaches the prompt, and that the structured response validates. Between that
and production, only the host and the credential differ.

The key is read from the environment on the **server** only. It is never sent to the
browser and never appears in the client bundle.

That one switch turns on all three AI jobs at once: the debrief on a logged question, the
side panel's reading of your sentence, and its summary of the results.

**The analyzer is pluggable.** `stub` is an offline analyzer: no API key, no network,
deterministic output, and what the test suite runs against — its answers are obviously
canned and its search is keyword matching, not understanding. `claude` is the real one,
using structured outputs so responses are validated objects rather than prose to scrape.
Adding an OpenAI adapter means one file implementing `Analyzer` in `backend/app/analysis/`
plus a line in its `__init__.py`.

## The ladder, precisely

Logging a mistake arms five review events immediately, anchored to the moment it was
logged — before the analyzer runs, so a slow or failed analysis never costs you your
first review.

Completing a review:

- **correct** or **skipped** — the rest of the ladder is untouched.
- **wrong** — the rungs you never reached are retired as `superseded` (kept, not
  deleted, so the history stays readable) and a fresh cycle is armed from now.

A failed analysis leaves the question logged, on the ladder, and re-analyzable from its
detail page. The schedule never depends on the AI succeeding.

## Schema changes and backups

The API runs **Alembic migrations on startup**, so a database is built or brought up to
date automatically — nothing to run by hand on a new machine. After changing a model:

```bash
cd backend
uv run alembic revision --autogenerate -m "what changed"   # review the file it writes
uv run alembic upgrade head                                # or just restart the API
```

**A migration copies the database aside first**, to `~/Documents/mistake-bank-backups/`,
keeping the last 20. To take one any time:

```bash
cd backend && uv run python scripts/backup.py
```

`tests/test_migrations.py` fails if a model is changed without a migration — the exact
mistake that used to surface as `no such column` at the first query after a clean start.

## If the app looks empty

Your questions live in `backend/mistake_bank.db` and survive restarts, refreshes and new
browsers. If a screen looks empty, check the API is running — it will say **"Can't reach
the app's API"** rather than showing an empty bank. The database file is the whole of
your data; copy it to back it up.

## Tests

```bash
cd backend  && uv run pytest && uv run ruff check app tests
cd frontend && npm run typecheck && npm run lint && npm test && npm run e2e
```

`npm run e2e` starts its own API and production build on ports 8001/3401 against a
separate database file, so it never touches your dev data.

## Not done yet

- **Auth.** Every query is already scoped by a user id, but it comes from an
  `X-User-Id` header that defaults to `local`. Clerk goes here.
- **Auth is still the gap.** Everything else below is done.
- **Notifications.** Nothing tells you a review came due; you have to open the app.
