# Deploying the FocusFlow

Three ways to run it, in increasing order of commitment: the whole thing in Docker on
one machine, the API on Fly, the web app on Vercel.

The one rule that spans all three: **the browser's origin has to be on the API's
`CORS_ORIGINS` list.** An origin that is not gets a 400 on preflight, and the app is a
blank page with no error anywhere near the cause.

---

## 1. Local production run — one command

```bash
docker compose up --build -d
```

| | |
|---|---|
| API | http://localhost:8200 |
| Web | http://localhost:3200 — `localhost`, never `127.0.0.1` |

Then, for something to look at:

```bash
docker compose exec backend python scripts/seed_demo.py --reset
```

Twenty questions, ten concepts, ladders played forward to today. Check it took:

```bash
curl -s http://localhost:8200/health     # {"status":"ok", ...}
curl -s http://localhost:8200/stats      # {"total_mistakes":20, ...}
```

Other things worth knowing:

- **The bank lives in the `bank-data` volume**, mounted at `/data`: the SQLite file and
  every uploaded picture. `docker compose down` keeps it; `docker compose down -v`
  deletes the bank. Back it up with
  `docker compose exec backend python scripts/backup.py` or by copying the file out:
  `docker compose cp backend:/data/mistake_bank.db ./bank-backup.db`.
- **The dev servers on :8000 and :3000 are untouched.** Different ports, different
  database, different upload directory, by design.
- **Migrations run on startup**, so a fresh volume builds its own schema. Nothing to run
  by hand.
- **`NEXT_PUBLIC_API_URL` is baked in at build time.** Next inlines `NEXT_PUBLIC_*` into
  the JavaScript the browser downloads, so changing it in the environment of a running
  container does nothing — it is a build arg in `docker-compose.yml`, and changing it
  means `docker compose build frontend`.
- **Turning the real AI on**: uncomment the two `AI_PROVIDER: claude` /
  `ANTHROPIC_API_KEY` lines in `docker-compose.yml` and put the key in a `.env` beside it
  (gitignored), then `docker compose up -d`. `AI_PROVIDER=agent` does **not** work in a
  container — see the note at the bottom.
- **Recordings work out of the box.** The `base` Whisper model is pre-fetched into the
  image at build, so the first upload with audio in it transcribes instead of quietly
  downloading 150MB mid-request. Set `TRANSCRIBER: whisper` to switch it on (the default
  follows `AI_PROVIDER`, so with the stub analyzer the stub transcriber is used).

---

## 2. The API on Fly.io

`backend/fly.toml` is committed and complete except for the two secrets. From a signed-in
shell:

```bash
brew install flyctl          # already installed on this machine
fly auth login               # opens a browser; only you can do this

cd backend
fly launch --no-deploy --copy-config          # adopts fly.toml as it stands
fly volumes create data --region iad --size 1 # 1GB, mounted at /data by fly.toml

fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly secrets set CORS_ORIGINS=https://YOUR-APP.vercel.app

fly deploy
fly open /health             # {"analyzer":"claude","analyzer_ready":true, ...}
```

Notes that matter:

- **The volume is the bank.** `/data` holds `mistake_bank.db` and `uploads/`. Without the
  mount both live on the machine's ephemeral filesystem and a redeploy erases them.
- **One machine only.** SQLite on one volume means exactly one writer, so `fly.toml` sets
  `min_machines_running = 1` and no autoscaling. If you ever want more than one machine,
  move `DATABASE_URL` to Neon Postgres (`postgresql+asyncpg://…?ssl=require`) first —
  the code already supports it.
- **`CORS_ORIGINS` is a secret only because it is easier to change that way.** It is not
  sensitive; it just has to match the Vercel URL exactly, scheme included, no trailing
  slash. Set it again after you know your production domain.
- **Set it before the front end goes live**, or the first load of the deployed app is
  blank.

---

## 3. The web app on Vercel

```bash
npm i -g vercel              # already installed on this machine
vercel login                 # emails you a code; only you can do this

cd frontend
vercel link                  # answer "frontend" when it asks for the root directory
vercel env add NEXT_PUBLIC_API_URL production   # paste https://mistake-bank-api.fly.dev
vercel --prod
```

- **Root directory is `frontend`**, not the repo root. Setting it in `vercel link` (or in
  Project Settings → General → Root Directory) is what makes `frontend/vercel.json`,
  `package.json` and the Next app the project.
- **`NEXT_PUBLIC_API_URL` must exist before the build**, not after: it is inlined into the
  client bundle. Changing it later needs a redeploy (`vercel --prod --force`), not a
  restart.
- Add it to the Preview environment too if you want preview deploys to work; they get
  their own URLs, so each one also needs to be on the API's `CORS_ORIGINS`, or use a
  wildcard regex in `CORS_ORIGIN_REGEX` (e.g.
  `https://.*\.vercel\.app`) — which is the looser, easier option.
- `output: "standalone"` in `next.config.ts` is for the Docker image; Vercel ignores it.

---

## The two things that do not travel to the cloud

**`AI_PROVIDER=agent` needs `claude auth login` on the host.** That path drives the Claude
Code CLI, which bills your claude.ai plan and reads its credentials from the machine's own
login — on a Mac, from the macOS keychain. A container or a Fly machine has no such login
and there is no way to hand it one. The CLI is installed in the image so the provider
*can* work on a Linux host where you have run `claude auth login` yourself, but for a
cloud deploy use:

```
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

`GET /health` is the check: `analyzer_ready: false` means the provider is selected and its
credential is missing, which is the difference between "the AI is off" and "the AI is
misconfigured".

**Whisper will not fit on a 256MB Fly machine.** Loading `base` at int8 needs on the order
of a gigabyte of resident memory, and the machine is OOM-killed mid-request — which
surfaces as an upload that hangs and then 502s, not as an error about memory. Either:

- run `shared-cpu-2x` with **2GB** (what `fly.toml` asks for), or
- set `TRANSCRIBER=stub` for a demo, and audio uploads are refused with a message that
  says why while everything else keeps working.

The model itself is already in the image, so neither option downloads anything at run time.
