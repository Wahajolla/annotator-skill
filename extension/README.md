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

## How it works

- The toolbar (React + Agentation, bundled into `dist/toolbar.js`) is injected into the page on click. Nothing runs on pages you haven't clicked.
- The toolbar's `fetch` and `EventSource` are rewired at build time to a message bridge: page → content script → service worker → notes server. The page's CSP and CORS never apply to those requests. The service worker only talks to the configured server, and it strips the `Origin` header so the server accepts it like a CLI client.
- Live updates become polling: the session is re-fetched every 5 seconds. Notes other people delete disappear for you after a page reload.

Limits: Chrome blocks extensions on `chrome://` pages and on the Web Store. The toolbar is desktop only.

## Build

```sh
cd extension && npm install && npm run build
```

This regenerates `dist/toolbar.js`. Update `agentation` in `package.json` to pick up new toolbar versions.
