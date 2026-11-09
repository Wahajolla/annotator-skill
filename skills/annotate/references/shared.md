# Shared mode: architecture and how to deploy it

Colleagues open a hosted site, pin notes, and everyone sees everyone's notes. Claude reads them over HTTP. Any host works. This page lists what each piece needs. Agree on the hosting with the user. [examples/railway](../examples/railway/README.md) is one full worked setup.

The guiding requirement is **never lose a note**. Most choices below follow from it.

```
browser (site + toolbar) ──HTTPS + CORS──▶ notes server (agentation-mcp, SQLite on a persistent disk)
                                                   ▲                    │
                                     Claude (curl) ┘                    └─▶ periodic snapshot → separate storage
```

## 1. Notes server

Run `agentation-mcp` in **HTTP-only** mode. `agentation-mcp server` also starts an MCP stdio server, and in a container there is nothing on the other end of it. Use:

```sh
npm i agentation-mcp@<pinned version>
node -e "require('agentation-mcp').startHttpServer(+process.env.PORT)"
```

Requirements:

- **A persistent disk.** SQLite lives at `$HOME/.agentation/store.db`. Point `HOME` at a mounted volume (e.g. `HOME=/data`), or every redeploy wipes the notes.
- **HTTPS.** The site is HTTPS, so the server must be too, or browsers block the requests as mixed content. Most platforms terminate TLS for you. On a bare VPS, put Caddy or nginx in front.
- **Env:**
  - `AGENTATION_HOST=0.0.0.0`. Without it the server answers only loopback, and remote requests get a 403.
  - `AGENTATION_CORS_ORIGINS=https://<site-origin>[,http://localhost:<dev-port>]`. Exact origins, comma-separated.
  - `AGENTATION_STORE=sqlite`, `AGENTATION_EVENT_RETENTION_DAYS=365`.
  - `PORT`.
- **A health check** at `/health`, which returns `{"status":"ok"}`. Set the restart policy to always.

A generic Docker version, for any VPS or any platform that runs containers:

```sh
docker run -d --name annotator-notes --restart always -p 4747:4747 \
  -v annotator-data:/data -e HOME=/data -e PORT=4747 \
  -e AGENTATION_HOST=0.0.0.0 -e AGENTATION_STORE=sqlite -e AGENTATION_EVENT_RETENTION_DAYS=365 \
  -e AGENTATION_CORS_ORIGINS=https://site.example.com \
  node:22 sh -c "mkdir -p /opt/app && cd /opt/app && npm init -y >/dev/null && npm i --no-audit --no-fund agentation-mcp@1.3.2 && node -e \"require('agentation-mcp').startHttpServer(+process.env.PORT)\""
```

## 2. One shared session

Without a `sessionId`, every viewer gets a private session and sees only their own notes. Create one session and bake its id into whatever loads the toolbar:

```sh
curl -X POST https://<notes>/sessions -H 'content-type: application/json' -d '{"url":"https://<site>"}'
```

Notes are still filtered per page by URL.

## 3. Toolbar on the shared site

Use any of the options from SKILL.md, with `endpoint=https://<notes>` and `session=<id>`:

- **In the app:** add a separate build (e.g. `build:deploy`) that sets `VITE_AGENTATION_URL` and `VITE_AGENTATION_SESSION`. Render `<Agentation>` only when they are set, so production and local builds stay clean.
- **Script tag:** `annotator.js?endpoint=https://<notes>&session=<id>&app=<Name>`.
- **Bookmarklet:** good for reviewing a site you can't change. Every reviewer installs the same bookmarklet with the same `session`.
- **Chrome extension:** every reviewer sets the server URL and session in the extension options. It works on strict-CSP sites, and the server needs no CORS entry for it.

## 4. Hosting the site (only if it isn't hosted yet)

Any static host works, for example Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3 behind a CDN, or a bucket plus a tiny function (the Railway example). For a private review, put Basic auth or the platform's password protection in front. The notes server stays CORS-only, because the toolbar calls it directly from the page.

## 5. Backups (always)

Anyone can delete anyone's note. Snapshot every few minutes into storage that is **not** the notes server's disk and **not** publicly served:

```sh
# minimal: dump all sessions with their notes
for id in $(curl -fsS https://<notes>/sessions | jq -r '(if type=="array" then . else .sessions end)[].id'); do
  curl -fsS https://<notes>/sessions/$id
done | jq -s '{takenAt: (now|todate), sessions: .}' > "notes-$(date -u +%Y%m%dT%H%M%SZ).json"
```

Run it from cron, CI on a schedule, or a platform cron job. [backup-function.ts](../examples/railway/backup-function.ts) is a fuller version for any S3-compatible bucket: it keeps `latest.json` and writes a snapshot only when something changed.

**Restore:** take a snapshot and POST its annotations to `/sessions/<id>/annotations`.

## 6. Verify end to end before sharing the link

- Open the site in a clean browser (empty localStorage) at desktop size.
- Add a test note through the toolbar.
- Check that `curl https://<notes>/pending` shows it, then `DELETE /annotations/<id>`.
- A second clean browser should show the shared notes count on the toolbar badge.

## Pitfalls

- **Don't restart or redeploy the notes server while people are commenting.** A note sent during the downtime gets a 502 and stays only in its author's localStorage until they reopen the page. Redeploying the *site* is safe.
- A `DELETE /annotations/...` from a browser in the logs means a person deleted the note, not that the server lost it.
- There is no auth on the notes server. Say so out loud: it fits internal review, not public pages.
