// Injected by the service worker for "Show all notes" (Alt+Shift+N). Second injection hides them.
// fetch here is the bridge (see build script), so it works on strict-CSP pages too.
import { toggleNotes } from "../../embed/notes.js"

const cfg = window.__ANNOTATOR_CONFIG__ || {}
toggleNotes({ endpoint: cfg.endpoint, session: cfg.session }).catch((e) => console.warn("[annotator] notes:", e.message))
