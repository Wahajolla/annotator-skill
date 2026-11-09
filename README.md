# annotator

A Claude Code plugin that adds click-to-comment feedback to any web page. You click an element, write a note, and Claude gets the note with a selector, nearby text and URL, so it finds the right element in the code and fixes it.

Built on [Agentation](https://github.com/benjitaylor/agentation) (the toolbar plus the `agentation-mcp` notes server).

## Install

In Claude Code:

```
/plugin marketplace add Wahajolla/annotator-skill
/plugin install annotator@wahajolla
```

Then ask, for example:

- "Add the annotator to my dev app" or "I want to annotate this page"
- "Read my notes and fix them"
- "Set up comments on this mock so colleagues can leave feedback"

The skill is `annotator:annotate`.

## Two modes

**Local (default):** just you and Claude. The notes server runs on `localhost:4747`, either through MCP (`claude mcp add agentation -- npx -y agentation-mcp server`) or as a plain background process. Nothing is deployed. If you don't want a server at all, the toolbar can run copy-only: you press Copy and paste the notes into the chat.

**Shared:** colleagues comment on a hosted site and everyone sees all the notes. You host the notes server wherever you like (Docker, VPS, Fly, Render, Railway and so on). [references/shared.md](skills/annotate/references/shared.md) covers the architecture and requirements: persistent disk, HTTPS, CORS, one shared session, backups. [examples/railway](skills/annotate/examples/railway/README.md) is one worked example, not a requirement.

## Put the toolbar anywhere

1. **In your React app:** `<Agentation endpoint="http://localhost:4747" />`, gated to dev builds.
2. **On any HTML page, React or not:**
   ```html
   <script type="module" src="https://cdn.jsdelivr.net/gh/Wahajolla/annotator-skill@v0.3.0/embed/annotator.js?endpoint=http://localhost:4747"></script>
   ```
3. **On any site, without touching its code:** save this as a bookmark. Clicking it toggles the toolbar on and off:
   ```
   javascript:(()=>{const s=document.createElement('script');s.type='module';s.src='https://cdn.jsdelivr.net/gh/Wahajolla/annotator-skill@v0.3.0/embed/annotator.js?endpoint=http://localhost:4747&t='+Date.now();document.head.appendChild(s)})()
   ```
   On a public site, start the notes server with `AGENTATION_CORS_ORIGINS=https://that-site.com`. Sites with a strict Content-Security-Policy block the injected scripts, so the toolbar won't load there. Use the extension for those.
4. **Chrome extension:** one click or Alt+Shift+A on any page, including strict-CSP sites like GitHub, with no CORS setup. See [extension/](extension/README.md); install it from the [latest release](https://github.com/Wahajolla/annotator-skill/releases/latest) with Load unpacked.

[`embed/annotator.js`](embed/annotator.js) takes `endpoint`, `session`, `app` and `hash=1` as query params. Leave out `endpoint` for copy-only mode, and add `session` for shared mode.

## Caveats

- The toolbar is desktop only.
- The notes server has no auth, only CORS. Anyone with an allowed origin can add and delete notes. In shared mode, keep backups.
- Agentation is licensed under PolyForm Shield. This repo (the skill, loader, extension source and templates) is MIT; the built `extension/dist/toolbar.js` bundles Agentation and React under their own licenses (see `extension/THIRD_PARTY_LICENSES.txt`).

## License

MIT
