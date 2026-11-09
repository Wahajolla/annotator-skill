// Injected into the page (MAIN world) by the service worker on toolbar-button click.
// Second injection toggles the toolbar off.
import React from "react"
import { createRoot } from "react-dom/client"
import { Agentation } from "agentation"

const ID = "annotator-ext-root"
const existing = document.getElementById(ID)
if (existing) {
  window.__annotatorExtRoot?.unmount()
  existing.remove()
  window.__annotatorExtRoot = undefined
} else {
  const cfg = window.__ANNOTATOR_CONFIG__ || {}
  const host = document.createElement("div")
  host.id = ID
  document.documentElement.appendChild(host)
  const root = createRoot(host)
  window.__annotatorExtRoot = root
  root.render(
    <Agentation
      endpoint={cfg.endpoint || undefined}
      sessionId={cfg.session || undefined}
      appName={cfg.app || undefined}
      useHashLocation={!!cfg.hash}
    />,
  )
}
