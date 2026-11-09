// "Notes server is offline" alert, bottom-right above the Agentation toolbar.
// Without a server the toolbar silently keeps notes in localStorage, so nobody (human or agent)
// notices they never reach the agent. This polls GET /health and says so.
// For agents and tests: the host element carries data-annotator-server="online|offline".
import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const POLL_DOWN = 5000
const POLL_UP = 15000

const CSS = `
:host { all: initial; }
.box {
  position: fixed; right: 1.25rem; bottom: calc(1.25rem + 56px); z-index: 100000;
  width: 300px; box-sizing: border-box; padding: 0.75rem 1rem;
  background: #1a1a1a; color: #fff; border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.08);
  font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  animation: in .18s ease-out;
}
@keyframes in { from { opacity: 0; transform: translateY(6px) } }
.head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #ff4d4f; box-shadow: 0 0 0 3px rgba(255,77,79,.2); }
.ok .dot { background: #34c759; box-shadow: 0 0 0 3px rgba(52,199,89,.2); }
.x { margin-left: auto; background: none; border: 0; color: rgba(255,255,255,.5); font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 4px; }
.x:hover { color: #fff; }
p { margin: 6px 0 0; color: rgba(255,255,255,.7); }
.cmd { display: flex; align-items: center; gap: 6px; margin-top: 8px; padding: 6px 6px 6px 10px;
  background: rgba(255,255,255,.06); border-radius: 8px; }
code { flex: 1; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: #fff; overflow-wrap: break-word; }
.copy { background: #3c82f7; color: #fff; border: 0; border-radius: 6px; padding: 3px 8px; font: inherit; font-size: 12px; cursor: pointer; }
.copy:hover { filter: brightness(1.1); }
.url { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color: rgba(255,255,255,.4); margin-top: 6px; word-break: break-all; }
`

function isLocal(endpoint) {
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(endpoint).hostname) } catch { return false }
}

async function ping(endpoint) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 4000)
  try {
    const res = await fetch(`${endpoint}/health`, { signal: ctl.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

export function ServerStatus({ endpoint, host }) {
  const [status, setStatus] = useState("checking") // checking | online | offline
  const [dismissed, setDismissed] = useState(false)
  const [justBack, setJustBack] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shadow, setShadow] = useState(null)
  const prev = useRef("checking")

  useEffect(() => {
    const el = document.createElement("div")
    el.id = "annotator-server-status"
    host.appendChild(el)
    const root = el.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = CSS
    root.appendChild(style)
    setShadow(root)
    return () => el.remove()
  }, [host])

  useEffect(() => {
    let timer, alive = true
    const tick = async () => {
      const up = await ping(endpoint)
      if (!alive) return
      const next = up ? "online" : "offline"
      if (next !== prev.current) {
        host.dataset.annotatorServer = next
        if (next === "offline") {
          console.warn(`[annotator] Notes server ${endpoint} is unreachable. Notes stay in this browser until it is back.`)
          setDismissed(false)
        } else if (prev.current === "offline") {
          console.info(`[annotator] Notes server ${endpoint} is back.`)
          setJustBack(true)
          setTimeout(() => alive && setJustBack(false), 2500)
        }
        prev.current = next
        setStatus(next)
      }
      timer = setTimeout(tick, up ? POLL_UP : POLL_DOWN)
    }
    tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [endpoint, host])

  if (!shadow) return null
  const local = isLocal(endpoint)
  const command = `npx -y agentation-mcp server${(() => { try { const p = new URL(endpoint).port; return p && p !== "4747" ? ` --port ${p}` : "" } catch { return "" } })()}`

  let body = null
  if (justBack) {
    body = (
      <div className="box ok" role="status">
        <div className="head"><span className="dot" />Notes server connected</div>
      </div>
    )
  } else if (status === "offline" && !dismissed) {
    body = (
      <div className="box" role="alert">
        <div className="head">
          <span className="dot" />Notes server is offline
          <button className="x" title="Hide" onClick={() => setDismissed(true)}>×</button>
        </div>
        <p>Notes stay in this browser and won't reach your agent until the server is back.
          {local ? " Start it:" : " Check that the shared server is running."}</p>
        {local && (
          <div className="cmd">
            <code>{command}</code>
            <button className="copy" onClick={async () => {
              try { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
            }}>{copied ? "Copied" : "Copy"}</button>
          </div>
        )}
        <div className="url">{endpoint}</div>
      </div>
    )
  }
  return body && createPortal(body, shadow)
}
