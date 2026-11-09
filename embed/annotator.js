// Annotator loader: mounts the Agentation feedback toolbar on ANY page, React app or not.
// It renders into its own container with its own React root, so it never touches the host app.
//
// Config comes from this script's query string (or window.ANNOTATOR_CONFIG, which wins):
//   endpoint  notes server URL, e.g. http://localhost:4747. Omit it for copy-only mode
//             (notes stay in the browser; press Copy and paste the markdown to your agent).
//   session   shared session id, so every viewer sees the same notes (shared mode).
//   app       app name shown in the copied/sent feedback.
//   hash=1    keep notes per #route (hash-router apps).
//
// Usage:
//   <script type="module" src="https://cdn.jsdelivr.net/gh/Wahajolla/annotator-skill@v0.4.0/embed/annotator.js?endpoint=http://localhost:4747"></script>
// or as a bookmarklet (see README). Loading it a second time toggles the toolbar off.

const REACT = "18.3.1"
const AGENTATION = "3.1.2"
const ID = "annotator-root"

const existing = document.getElementById(ID)
if (existing) {
  existing.__annotatorRoot?.unmount()
  existing.remove()
} else {
  const q = new URL(import.meta.url).searchParams
  const cfg = {
    endpoint: q.get("endpoint") || undefined,
    session: q.get("session") || undefined,
    app: q.get("app") || undefined,
    hash: q.get("hash") === "1",
    ...(window.ANNOTATOR_CONFIG || {}),
  }

  const deps = `deps=react@${REACT},react-dom@${REACT}`
  const [React, { createRoot }, { Agentation }] = await Promise.all([
    import(`https://esm.sh/react@${REACT}`),
    import(`https://esm.sh/react-dom@${REACT}/client?${deps}`),
    import(`https://esm.sh/agentation@${AGENTATION}?${deps}`),
  ])

  const host = document.createElement("div")
  host.id = ID
  document.body.appendChild(host)
  const root = createRoot(host)
  host.__annotatorRoot = root
  root.render(
    React.createElement(Agentation, {
      endpoint: cfg.endpoint,
      sessionId: cfg.session,
      appName: cfg.app,
      useHashLocation: cfg.hash,
    }),
  )
  console.info("[annotator] toolbar mounted", cfg.endpoint ? `→ ${cfg.endpoint}` : "(copy-only)")
}
