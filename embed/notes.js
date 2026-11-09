// Show every note on the page at once: an outline around each element, its number, and a card
// with the full text. Made for screenshots, of your own notes or of notes an agent writes.
//
// As a script (a second load toggles it off):
//   <script type="module" src=".../embed/notes.js?endpoint=http://localhost:4747"></script>
//     → notes from the notes server for this page (pending ones; add &all=1 for resolved too)
//   window.ANNOTATOR_NOTES = [{ selector: "h1", comment: "Too long" }, …] before loading
//     → the agent's own notes, no server needed. Each note: selector | boundingBox, comment, author?
//   no endpoint and no ANNOTATOR_NOTES → notes the toolbar keeps in this page's localStorage
// As a module: import { showNotes, hideNotes, toggleNotes, loadNotes } from ".../notes.js"
//
// When it's done drawing, <html> gets data-annotator-notes="<count>", so a script can wait for it.

const HOST_ID = "annotator-notes-overlay"
const ACCENT = "#3c82f7"
const CARD_W = 260
const GAP = 12

const CSS = `
:host { all: initial; }
.layer { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 99990; pointer-events: none;
  font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.box { position: absolute; box-sizing: border-box; border: 2px solid ${ACCENT}; border-radius: 4px;
  background: color-mix(in srgb, ${ACCENT} 6%, transparent); }
.num { position: absolute; width: 22px; height: 22px; border-radius: 50%; background: ${ACCENT}; color: #fff;
  font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 6px rgba(0,0,0,.25); transform: translate(-50%, -50%); }
.line { position: absolute; height: 2px; background: ${ACCENT}; transform-origin: 0 50%; opacity: .7; }
.card { position: absolute; box-sizing: border-box; width: ${CARD_W}px; padding: 8px 12px 10px;
  background: #1a1a1a; color: #fff; border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.08); }
.top { display: flex; align-items: center; gap: 6px; font-size: 11px; color: rgba(255,255,255,.55); margin-bottom: 3px; }
.badge { flex: none; width: 18px; height: 18px; border-radius: 50%; background: ${ACCENT}; color: #fff;
  font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
.el { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.author { color: #8fb6ff; font-weight: 600; flex: none; }
.text { white-space: pre-wrap; overflow-wrap: break-word; }
.fixed { position: fixed; }
`

/** Normalizes notes from the server, the toolbar's localStorage or an agent. */
function normalize(n, i) {
  let comment = String(n.comment ?? n.text ?? "")
  let author = n.author ?? (typeof n.authorId === "string" ? n.authorId.replace(/^github:/, "") : "")
  const m = comment.match(/^@([A-Za-z0-9-]+): /)
  if (m) { author ||= m[1]; comment = comment.slice(m[0].length) }
  return {
    n: i + 1,
    comment,
    author,
    element: n.element ?? n.selector ?? "",
    selectors: [n.selector, n.fullPath, n.elementPath].filter(Boolean),
    boundingBox: n.boundingBox,
    fixed: !!n.isFixed,
  }
}

function findElement(note) {
  for (const s of note.selectors) {
    try { const el = document.querySelector(s); if (el) return el } catch {}
  }
  return null
}

/** Rect in document coordinates (or viewport coordinates for fixed notes). */
function rectFor(note) {
  const el = findElement(note)
  if (el) {
    const r = el.getBoundingClientRect()
    if (r.width || r.height) {
      return note.fixed
        ? { x: r.left, y: r.top, w: r.width, h: r.height }
        : { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
    }
  }
  const b = note.boundingBox
  return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null
}

function samePage(url) {
  try {
    const u = new URL(url, location.href)
    return u.origin === location.origin && u.pathname.replace(/\/$/, "") === location.pathname.replace(/\/$/, "")
  } catch { return false }
}

/** Loads notes for this page: from the notes server, or from the toolbar's localStorage. */
export async function loadNotes({ endpoint, session, all = false } = {}) {
  if (!endpoint) {
    try { return JSON.parse(localStorage.getItem(`feedback-annotations-${location.pathname}`) || "[]") } catch { return [] }
  }
  endpoint = endpoint.replace(/\/+$/, "")
  const get = async (p) => { const r = await fetch(endpoint + p); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json() }
  let ids
  if (session) ids = [session]
  else {
    const list = await get("/sessions")
    ids = (Array.isArray(list) ? list : list.sessions ?? []).filter((s) => samePage(s.url)).map((s) => s.id)
  }
  const out = []
  for (const id of ids) {
    const s = await get(`/sessions/${id}`)
    for (const a of s.annotations ?? []) {
      if (a.url && !samePage(a.url)) continue
      if (!all && ["resolved", "dismissed"].includes(a.status)) continue
      out.push(a)
    }
  }
  return out.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
}

// Kept on window, not in module scope: the extension injects a fresh copy each time.
const getState = () => window.__annotatorNotesState ?? null
const setState = (v) => { window.__annotatorNotesState = v }

/** Draws the notes. Returns how many it could place. */
export function showNotes(raw) {
  hideNotes()
  const notes = raw.map(normalize)
  const host = document.createElement("div")
  host.id = HOST_ID
  document.documentElement.appendChild(host)
  const shadow = host.attachShadow({ mode: "open" })
  shadow.innerHTML = `<style>${CSS}</style><div class="layer"></div><div class="layer fixed"></div>`
  const [docLayer, fixedLayer] = shadow.querySelectorAll(".layer")

  const draw = () => {
    docLayer.replaceChildren(); fixedLayer.replaceChildren()
    const placed = notes.map((n) => ({ n, r: rectFor(n) })).filter((p) => p.r)
    for (const p of placed) {
      const layer = p.n.fixed ? fixedLayer : docLayer
      const add = (cls, style, html = "") => {
        const d = document.createElement("div"); d.className = cls; Object.assign(d.style, style); d.innerHTML = html
        layer.appendChild(d); return d
      }
      add("box", { left: `${p.r.x}px`, top: `${p.r.y}px`, width: `${p.r.w}px`, height: `${p.r.h}px` })
      add("num", { left: `${p.r.x}px`, top: `${p.r.y}px` }, String(p.n.n))
      const card = add("card", { left: "-9999px", top: "0px" })
      const top = document.createElement("div"); top.className = "top"
      top.innerHTML = `<span class="badge">${p.n.n}</span>`
      if (p.n.author) { const a = document.createElement("span"); a.className = "author"; a.textContent = `@${p.n.author}`; top.appendChild(a) }
      const el = document.createElement("span"); el.className = "el"; el.textContent = p.n.element; top.appendChild(el)
      const text = document.createElement("div"); text.className = "text"; text.textContent = p.n.comment
      card.append(top, text)
      p.card = card
      p.ch = card.offsetHeight
    }
    // Greedy placement: try right, below, left, above the element; take the first spot that stays
    // on the page and covers neither another card nor another noted element. Else slide down on the right.
    const pageW = document.documentElement.clientWidth
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    const taken = []
    for (const p of placed) {
      const { x, y, w, h } = p.r
      const others = placed.filter((q) => q !== p).map((q) => q.r)
      const free = (c) => c.x >= 8 && c.x + CARD_W <= pageW - 8 && c.y >= 0 &&
        !taken.some((t) => hit(c, t)) && !others.some((o) => hit(c, o))
      const spots = [
        { x: x + w + GAP, y, side: "right" },
        { x, y: y + h + GAP, side: "below" },
        { x: x - GAP - CARD_W, y, side: "left" },
        { x, y: y - GAP - p.ch, side: "above" },
      ].map((c) => ({ ...c, w: CARD_W, h: p.ch }))
      let spot = spots.find(free)
      if (!spot) {
        spot = { x: Math.min(Math.max(8, x + w + GAP), pageW - CARD_W - 8), y, w: CARD_W, h: p.ch, side: "right" }
        while (taken.some((t) => hit(spot, t)) && spot.y < y + 4000) spot.y += 16
      }
      taken.push(spot)
      Object.assign(p, { cx: spot.x, cy: spot.y, side: spot.side })
      p.card.style.left = `${spot.x}px`; p.card.style.top = `${spot.y}px`
    }
    // Leader line from the element edge to its card when the card had to move.
    for (const p of placed) {
      const cxm = Math.min(Math.max(p.r.x + p.r.w / 2, p.cx + 16), p.cx + CARD_W - 16)
      const [x1, y1, x2, y2] = {
        right: [p.r.x + p.r.w, p.r.y + Math.min(p.r.h / 2, 12), p.cx, p.cy + 14],
        left: [p.r.x, p.r.y + Math.min(p.r.h / 2, 12), p.cx + CARD_W, p.cy + 14],
        below: [cxm, p.r.y + p.r.h, cxm, p.cy],
        above: [cxm, p.r.y, cxm, p.cy + p.ch],
      }[p.side]
      const len = Math.hypot(x2 - x1, y2 - y1)
      if (len < 4) continue
      const line = document.createElement("div"); line.className = "line"
      Object.assign(line.style, { left: `${x1}px`, top: `${y1}px`, width: `${len}px`, transform: `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)` })
      ;(p.n.fixed ? fixedLayer : docLayer).prepend(line)
    }
    document.documentElement.dataset.annotatorNotes = String(placed.length)
    if (placed.length < notes.length) {
      console.warn(`[annotator] ${notes.length - placed.length} of ${notes.length} notes have no element on this page`)
    }
    return placed.length
  }

  const count = draw()
  let t
  const redraw = () => { clearTimeout(t); t = setTimeout(draw, 150) }
  addEventListener("resize", redraw)
  setState({ host, redraw })
  return count
}

export function hideNotes() {
  const state = getState()
  if (!state) return
  removeEventListener("resize", state.redraw)
  state.host.remove()
  delete document.documentElement.dataset.annotatorNotes
  setState(null)
}

export async function toggleNotes(opts) {
  if (getState()) { hideNotes(); return null }
  const notes = Array.isArray(window.ANNOTATOR_NOTES) ? window.ANNOTATOR_NOTES : await loadNotes(opts)
  return showNotes(notes)
}

// Loaded as a <script type="module"> (or injected by an agent): read options and toggle.
if (import.meta.url && !import.meta.url.startsWith("file:") && new URL(import.meta.url).pathname.endsWith("/notes.js")) {
  const q = new URL(import.meta.url).searchParams
  const cfg = window.ANNOTATOR_CONFIG || {}
  toggleNotes({
    endpoint: q.get("endpoint") ?? cfg.endpoint,
    session: q.get("session") ?? cfg.session,
    all: q.get("all") === "1",
  }).catch((e) => console.warn("[annotator] notes:", e.message))
}
