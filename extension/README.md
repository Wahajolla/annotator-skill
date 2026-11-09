# Annotator for Chrome

Toggle the Agentation feedback toolbar on any page with one click or **Alt+Shift+A**. Click an element, write a note, and your coding agent reads it from the notes server.

Unlike the bookmarklet, it also works on sites with a strict Content-Security-Policy (GitHub, Notion, most big apps), and it needs no CORS setup on the notes server.

## Install

1. Download `annotator-extension.zip` from the [latest release](https://github.com/Wahajolla/annotator-skill/releases/latest) and unzip it. Or clone this repo and use the `extension/` folder.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the folder.
3. Pin the Annotator icon.

## Use

- **Local:** run `npx -y agentation-mcp server` (or register it as MCP: `claude mcp add agentation -- npx -y agentation-mcp server`). The default server setting, `http://localhost:4747`, already points at it.
- **Shared:** in the extension options, set the server to your hosted `https://…` notes server and fill in the shared session id. Chrome asks once for permission to reach that server.
- **Copy-only:** clear the server field. Notes stay in the page, and you press Copy in the toolbar and paste into your agent.

Click the icon on a page to toggle the toolbar.

## Sign in with GitHub (who left the note)

In the extension options, click **Sign in with GitHub**. A GitHub tab opens and the code is already in your clipboard: paste it and approve. After that, every note you create is signed:

- `authorId: "github:<login>"` is stored on the note, so your agent sees who wrote it;
- `@<login>: ` is prefixed to the note text, so other people see it in the toolbar. You can turn this off in the options.

Edits keep the original author's prefix. Sign-in uses GitHub's device flow, with no backend and no secret. The token is used once to read your login and then discarded; the extension keeps only your login and avatar.

This is a signature, not access control. The notes server has no auth, so anyone who can reach it with curl can write under any name. For an internal review among colleagues this is usually enough.

## How it works

- The toolbar (React + Agentation, bundled into `dist/toolbar.js`) is injected into the page on click. Nothing runs on pages you haven't clicked.
- The toolbar's `fetch` and `EventSource` are rewired at build time to a message bridge: page → content script → service worker → notes server. The page's CSP and CORS never apply to those requests. The service worker only talks to the configured server, and it strips the `Origin` header so the server accepts it like a CLI client.
- Signed in: the service worker adds your GitHub login to note create/edit requests on the way out.
- Live updates become polling: the session is re-fetched every 5 seconds. Notes other people delete disappear for you after a page reload.

Limits: Chrome blocks extensions on `chrome://` pages and on the Web Store. The toolbar is desktop only.

## Build

```sh
cd extension && npm install && npm run build
```

This regenerates `dist/toolbar.js`. Update `agentation` in `package.json` to pick up new toolbar versions.
