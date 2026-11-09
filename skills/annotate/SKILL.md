---
name: annotate
description: Click-to-comment feedback on any web page (Agentation toolbar) that Claude reads back and applies. Two modes - local (you annotate your own dev app or any page, notes go straight to Claude) and shared (colleagues comment on a hosted site via a self-hosted notes server). The toolbar can go into an app, onto any HTML page via a script tag, or onto any site via a bookmarklet or the Chrome extension. Use when the user wants to annotate/comment on a page, leave visual feedback for Claude, set up "заметки/комменты на макете" for colleagues, or read, apply or restore that feedback.
---

# Annotate

The user clicks an element on a page, writes a note, and Claude gets the note with a selector, nearby text, bounding box and URL, so it can find the element in the code and fix it.

Built on [Agentation](https://github.com/benjitaylor/agentation): the `agentation` toolbar (React 18+, desktop only) and the `agentation-mcp` notes server (HTTP API on SQLite, plus optional MCP tools).

## Pick the mode first

Ask the user if it isn't obvious:

- **Local**: just the user and Claude, on this machine. The notes server runs on `localhost:4747`. Nothing gets deployed. This is the default.
- **Shared**: colleagues comment on a hosted site, and everyone sees everyone's notes. It needs a notes server on a public HTTPS host. See [references/shared.md](references/shared.md). That page describes the architecture and requirements; the user chooses the hosting. [examples/railway/](examples/railway/README.md) is one worked example, not a requirement.

## Where the toolbar goes

Choose by what the page is. The same options work in both modes; only `endpoint` and `session` change.

1. **Inside the user's React app.** `npm i -D agentation`, then render it next to the app, gated so it never reaches production:
   ```tsx
   {import.meta.env.DEV && <Agentation endpoint="http://localhost:4747" />}
   ```
   Add `useHashLocation` for hash routers and `appName` to label the feedback.
2. **Any HTML page they control, React or not.** Add one script tag. The [loader](../../embed/annotator.js) mounts the toolbar in its own container and its own React root, so it does not touch the host page:
   ```html
   <script type="module" src="https://cdn.jsdelivr.net/gh/Wahajolla/annotator-skill@v0.4.0/embed/annotator.js?endpoint=http://localhost:4747"></script>
   ```
   Query params: `endpoint`, `session`, `app`, `hash=1`. Alternatively, set `window.ANNOTATOR_CONFIG = {endpoint, session, app, hash}` before the script loads.
3. **Any site at all, without touching its code.** Use a bookmarklet. Give the user this line to save as a bookmark; clicking it toggles the toolbar on and off:
   ```
   javascript:(()=>{const s=document.createElement('script');s.type='module';s.src='https://cdn.jsdelivr.net/gh/Wahajolla/annotator-skill@v0.4.0/embed/annotator.js?endpoint=http://localhost:4747&t='+Date.now();document.head.appendChild(s)})()
   ```
   Limits to tell the user about:
   - Sites with a strict Content-Security-Policy (GitHub, many banks and big apps) block the injected scripts, so the toolbar won't appear there.
   - On a public `https://` site that talks to `localhost`, the browser may ask for local network access: allow it.
   - The notes server must allow that site's origin (see CORS below).
   - Notes are tied to the site's URL, and the toolbar's local drafts live in that site's localStorage.
4. **Chrome extension.** This is the most robust way to annotate any site. It toggles with one click or Alt+Shift+A, works on strict-CSP sites (GitHub, Notion, etc.), and needs no CORS setup: requests go through the extension. Install: download `annotator-extension.zip` from https://github.com/Wahajolla/annotator-skill/releases/latest, then `chrome://extensions` → Developer mode → Load unpacked. The notes server is set in the extension options. It defaults to `http://localhost:4747`; for shared mode, use the hosted URL plus the session id. Live sync is polling every 5 seconds. In the options, "Sign in with GitHub" signs every note with the user's login, so colleagues' notes show who left them.

Without `endpoint` the toolbar runs **copy-only**. Notes stay in the browser, and the user presses Copy and pastes the markdown into the chat. This needs no server, so use it when the user only wants it once.

## Local mode

1. **Run the notes server.** Pick one:
   - **MCP (best for repeated use).** With the user's OK: `claude mcp add agentation -- npx -y agentation-mcp server`. Claude Code then starts it with each session, and the `agentation_*` tools appear after a restart: `get_all_pending`, `resolve`, `reply`, and `watch_annotations` for hands-free loops.
   - **Plain HTTP (no restart).** Run `npx -y agentation-mcp server` as a background command, and read notes over HTTP (see below).

   Check it with `curl http://localhost:4747/health`, which should return `{"status":"ok"}`.
2. **CORS.** By default only dev origins are allowed (`localhost`, `*.localhost`, `127.0.0.1`, private IPs, `.local`, `.test`, `.internal`). For a bookmarklet on a public site, start the server with `AGENTATION_CORS_ORIGINS=https://that-site.com` (exact origins, comma-separated). `*` also works, but it lets any open tab write notes, so prefer exact origins.
3. **Put the toolbar on the page** using one of the options above, with `endpoint=http://localhost:4747`.
4. **Verify.** Add one test note through the toolbar, check that `curl localhost:4747/pending` shows it, then delete it.

Notes persist in `~/.agentation/store.db`.

## Reading and acting on notes (both modes)

- MCP: `agentation_get_all_pending`, then fix the code, then `agentation_resolve` with a short summary.
- HTTP: `GET /pending` (all open notes), `GET /sessions`, `GET /sessions/:id`. After fixing a note, send `PATCH /annotations/:id` with `{"status":"resolved"}`.
- **Who wrote it:** notes from the Chrome extension with GitHub sign-in carry `authorId: "github:<login>"`, and by default the comment starts with `@<login>: `. A note with no `authorId` is anonymous (any other way of loading the toolbar). Mention the author when you report back.
- Useful fields are `comment`, `url`, `element`, `elementPath`, `fullPath`, `nearbyText`, `selectedText`, `boundingBox` and `reactComponents` (dev builds only).
- Let the user decide before deleting anything.

## Pitfalls

- The toolbar is desktop only.
- The notes server has no auth, only CORS. Anyone whose browser origin is allowed can write and delete notes.
- `useHashLocation` keeps notes per `#route`. Turning it on later doesn't move existing notes.
- Agentation is licensed PolyForm Shield, which is fine for internal feedback use.
