---
name: site-feedback-notes
description: Set up shared click-to-comment feedback (Agentation toolbar + self-hosted notes server on Railway, with backups) on any website, so colleagues pin notes on the live page and Claude reads them back. Use when the user wants colleagues/reviewers to leave comments on a mock, prototype or site, asks for "заметки/комменты на макете", or wants to read, apply or restore that feedback.
---

# Site feedback notes

Colleagues open the deployed site, click the toolbar, click any element and write a note. Every note lands on one notes server, everyone sees everyone's notes on each page, and a cron job keeps backups. Claude reads the notes over HTTP. Each note comes with a selector, the nearby text and the URL, so Claude can find the right element in the code.

Stack: [Agentation](https://github.com/benjitaylor/agentation) (`agentation` toolbar, React 18+, desktop only) and its server `agentation-mcp` (HTTP API on SQLite), hosted on Railway through the Railway MCP tools. Templates for every piece sit next to this file:

- [site-function.ts](site-function.ts): a Bun function that serves a static build from a bucket, with a token-protected upload endpoint.
- [deploy.sh](deploy.sh): builds the site with the toolbar and uploads it.
- [backup-function.ts](backup-function.ts): a cron job that snapshots all notes into a private bucket.

The user's main requirement is **never lose a note**. Every choice below follows from it.

## Ask first (only what you can't find out)

- Where the site lives: already hosted somewhere (then only add the toolbar), or it needs hosting (then use bucket + function, step 3).
- Which Railway workspace to use (`list-projects` shows them).
- Whether the site is React. The toolbar is a React component. On a non-React site, mount it in a tiny separate React root bundled as one script and include that script on the page.

## Steps

### 1. Notes server (Railway service `feedback`)

Create a project, then stage these changes and deploy them with `accept-deploy`:

- `create-service`, image `node:22`, name `feedback`.
- `update-service`:
  - `startCommand`:
    `sh -c "mkdir -p /opt/app && cd /opt/app && npm init -y >/dev/null && npm i --no-audit --no-fund agentation-mcp@<version> && node -e 'require(process.env.PKG).startHttpServer(+process.env.PORT)'"`
  - `healthcheckPath` `/health`, `healthcheckTimeout` 300, `restartPolicyType` ALWAYS.
  - Do not run `agentation-mcp server`: it also starts an MCP stdio server, which has nothing to talk to in a container. `startHttpServer` runs HTTP only.
- `set-variables`:
  - `PKG=agentation-mcp`, `PORT=8080`;
  - `HOME=/data` (SQLite goes to `$HOME/.agentation/store.db`);
  - `AGENTATION_HOST=0.0.0.0` (without it every remote request gets a 403);
  - `AGENTATION_STORE=sqlite`, `AGENTATION_EVENT_RETENTION_DAYS=365`.
- `create-volume` mounted at `/data`. This is what keeps notes across deploys.
- `generate-domain` with `targetPort` 8080.
- After the site has a domain, set `AGENTATION_CORS_ORIGINS=https://<site-domain>,http://localhost:<dev-port>`. Use exact origins, comma-separated.

Check it: `curl <feedback>/health` should return `{"status":"ok"}`.

### 2. Toolbar in the site, only in the shared build

```tsx
const feedbackUrl = import.meta.env.VITE_AGENTATION_URL as string | undefined
const feedbackSession = import.meta.env.VITE_AGENTATION_SESSION as string | undefined
// ...
{feedbackUrl && <Agentation endpoint={feedbackUrl} sessionId={feedbackSession} useHashLocation appName="<Name>" />}
```

- Gate it on an env var, so local, screenshot and production builds stay clean. Add a separate build script, e.g. `build:deploy` with `--outDir dist-deploy`.
- `useHashLocation` is only for hash routers. It keeps notes per `#route`.
- **Shared session:** without `sessionId` every viewer gets a private session and sees only their own notes. Create one session (`curl -X POST <feedback>/sessions -H 'content-type: application/json' -d '{"url":"<site>"}'`) or reuse an existing one, and bake its id into the build. Notes still filter per page by URL.

### 3. Hosting a static build (skip if the site is already hosted)

Railway has no plain static upload without a Git repo, and OAuth-connected tools get bucket credentials redacted. Use this setup instead:

- Create a bucket with a name **different from every service name**, e.g. `sitefiles`. If a bucket and a service share a name, `${{name.X}}` resolves to the service and the S3 variables end up empty.
- Run `create-function` with [site-function.ts](site-function.ts). On the function, set `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` as `${{<bucket>.ENDPOINT|BUCKET|REGION|ACCESS_KEY_ID|SECRET_ACCESS_KEY}}`. Use Bun's default `s3` client: a hand-built `S3Client` with `virtualHostedStyle` got Access Denied.
- Generate the upload token locally (`openssl rand -hex 24`). Store it in a gitignored `.deploy-token` (chmod 600) and set it as `UPLOAD_TOKEN` on the function.
- Copy [deploy.sh](deploy.sh) into the project and fill in the URLs and session. It uploads assets first and `index.html` last.
- `generate-domain` for the function.
- To keep bots out, add Basic auth (the template supports it). Generate a password locally (`openssl rand -base64 18 | tr -dc A-Za-z0-9 | head -c 16`). Save login and password to a gitignored file (e.g. `.site-auth`, chmod 600) and set `BASIC_USER`/`BASIC_PASS` on the function. Stage the variables together with the code and run one `accept-deploy`, so the site is never briefly open. `/health` and the token-protected upload stay outside the auth. The notes server stays CORS-only: the toolbar calls it straight from the page. Verify: 401 without credentials, 401 with a wrong password, 200 with the right one (page and an asset).

### 4. Backups (always do this)

Anyone can delete anyone's note. Add a cron function from [backup-function.ts](backup-function.ts):

- Use its own private bucket, e.g. `notesbackup`, never the bucket that serves the site, which is public through the site function.
- Set the same `S3_*` references (pointing at the backup bucket) plus `FEEDBACK_URL`.
- Use `update-service` with `cronSchedule` `*/5 * * * *` and `restartPolicyType` NEVER.

It writes `backups/latest.json` every run, plus a timestamped snapshot whenever the notes changed. Check the logs after the next 5-minute mark: they should say `changed: stored snapshot with N notes`.

### 5. Verify end to end before handing over the link

- Open the site in the browser pane at 1600×900 and clear `localStorage` so you act as a new viewer.
- Add a test note through the toolbar UI (button bottom-right → click an element → type → Add).
- Check `curl <feedback>/pending` shows it, then `DELETE <feedback>/annotations/<id>`.
- A second clean browser should show the toolbar badge with the shared notes count.

## Reading and acting on notes

- `GET /pending` returns all open notes. `GET /sessions` and `GET /sessions/:id` return everything.
- Useful fields: `comment`, `url` (the page/route), `element`, `elementPath`, `nearbyText`, `selectedText`, `boundingBox`.
- After fixing a note: `PATCH /annotations/:id` with `{"status":"resolved"}`. Let the user decide before deleting anything.
- Restore: read a snapshot from the backup bucket (through a function, since bucket credentials are redacted), then POST its annotations to `/sessions/<id>/annotations`.

## Pitfalls (learned the hard way)

- **Never restart or redeploy `feedback` while people are commenting.** A note sent during the downtime gets a 502 and stays only in the author's localStorage. The toolbar re-sends it the next time the author opens the page, but until then you can't see it. Redeploying the site does not touch `feedback`.
- An HTTP log entry for `DELETE /annotations/...` from a browser means a person deleted the note in the toolbar, not that the server lost it. Check `get-logs` with `types: ["http"]` before blaming the server.
- The toolbar does not work on phones. Tell colleagues to use a desktop.
- The notes server has no auth, only CORS. Anyone who can open the site can write and delete notes. That is fine for internal review, but say it out loud.
- Agentation is licensed PolyForm Shield, which is fine for internal feedback use.
