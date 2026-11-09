// Runs in the page (MAIN world), bundled only into the toolbar.
// The toolbar's fetch/EventSource are rewired (esbuild --define) to these, so its requests go
// page → content script → extension service worker. That sidesteps the page's CSP (connect-src)
// and CORS, so the toolbar works on sites like GitHub. Page globals are never patched.
const pending = new Map()
let seq = 0

window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.__annotator !== "res") return
  const p = pending.get(e.data.id)
  if (!p) return
  pending.delete(e.data.id)
  if (e.data.error) return p.reject(new TypeError(e.data.error))
  const nullBody = [101, 204, 205, 304].includes(e.data.status)
  p.resolve(new Response(nullBody ? null : e.data.body, {
    status: e.data.status,
    statusText: e.data.statusText,
    headers: e.data.headers,
  }))
})

export function bridgeFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const signal = init.signal
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"))
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${++seq}`
    pending.set(id, { resolve, reject })
    signal?.addEventListener("abort", () => {
      if (pending.delete(id)) reject(new DOMException("Aborted", "AbortError"))
    })
    window.postMessage({
      __annotator: "req",
      id,
      url,
      method: init.method || "GET",
      headers: init.headers ? Object.fromEntries(new Headers(init.headers)) : {},
      body: typeof init.body === "string" ? init.body : undefined,
    }, "*")
  })
}

// Stand-in for EventSource: fires "open" every few seconds. The toolbar reacts to "open" by
// re-fetching the whole session, which turns live updates into polling through the bridge.
export class BridgeEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.listeners = {}
    this.timer = setTimeout(() => this.tick(), 0)
  }
  tick() {
    if (this.readyState === 2) return
    this.readyState = 1
    for (const f of this.listeners.open ?? []) f(new Event("open"))
    this.timer = setTimeout(() => this.tick(), 5000)
  }
  addEventListener(type, f) { (this.listeners[type] ??= []).push(f) }
  removeEventListener(type, f) { this.listeners[type] = (this.listeners[type] ?? []).filter((x) => x !== f) }
  close() { this.readyState = 2; clearTimeout(this.timer) }
}
