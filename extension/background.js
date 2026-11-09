// Annotator extension service worker.
// - Toolbar button / Alt+Shift+A: inject the bridge + toolbar into the active tab (toggle).
// - Relays the toolbar's HTTP calls to the notes server, only to the configured endpoint.
// - Strips the Origin header on those calls, so agentation-mcp treats them like a CLI client
//   and no CORS setup is needed for whatever site you annotate.
// - Signs new and edited notes with your GitHub login (authorId + optional "@login: " prefix).
import { getIdentity } from "./github.js"

const DEFAULTS = { endpoint: "http://localhost:4747", session: "", app: "", hash: false, showAuthor: true }
const RULE_ID = 1

export async function getConfig() {
  const cfg = { ...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS))) }
  cfg.endpoint = (cfg.endpoint || "").trim().replace(/\/+$/, "")
  return cfg
}

async function syncOriginRule() {
  const { endpoint } = await getConfig()
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: endpoint ? [{
      id: RULE_ID,
      priority: 1,
      action: { type: "modifyHeaders", requestHeaders: [{ header: "origin", operation: "remove" }] },
      condition: {
        urlFilter: `|${endpoint}/`,
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: ["xmlhttprequest", "other"],
      },
    }] : [],
  })
}

chrome.runtime.onInstalled.addListener(syncOriginRule)
chrome.runtime.onStartup.addListener(syncOriginRule)
chrome.storage.onChanged.addListener(syncOriginRule)

async function toggle(tab) {
  if (!tab?.id) return
  const cfg = await getConfig()
  const target = { tabId: tab.id }
  try {
    await chrome.scripting.executeScript({ target, files: ["content-bridge.js"] })
    await chrome.scripting.executeScript({
      target, world: "MAIN",
      func: (c) => { window.__ANNOTATOR_CONFIG__ = c },
      args: [{ endpoint: cfg.endpoint, session: cfg.session, app: cfg.app, hash: cfg.hash }],
    })
    await chrome.scripting.executeScript({ target, world: "MAIN", files: ["dist/toolbar.js"] })
  } catch (e) {
    // chrome://, the Web Store and similar pages can't be scripted.
    console.warn("[annotator] cannot annotate this page:", e?.message ?? e)
    await chrome.action.setBadgeText({ tabId: tab.id, text: "×" })
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 1500)
  }
}
chrome.action.onClicked.addListener(toggle)
globalThis.annotatorToggle = toggle // for automated tests

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== "annotator-fetch" || !sender.tab) return
  ;(async () => {
    const { endpoint } = await getConfig()
    if (!endpoint || !(msg.url === endpoint || msg.url.startsWith(endpoint + "/"))) {
      return reply({ error: "Annotator: request outside the configured notes server" })
    }
    try {
      const body = ["GET", "HEAD"].includes(msg.method) ? undefined : await signBody(msg)
      const res = await fetch(msg.url, { method: msg.method, headers: msg.headers, body })
      reply({
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers),
        body: await res.text(),
      })
    } catch (e) {
      reply({ error: String(e?.message ?? e) })
    }
  })()
  return true
})

const AUTHOR_PREFIX = /^@[A-Za-z0-9-]+: /

/** Adds the signed-in GitHub user to notes being created (POST) or edited (PATCH). */
export async function signBody(msg) {
  const isCreate = msg.method === "POST" && /\/sessions\/[^/]+\/annotations$/.test(new URL(msg.url).pathname)
  const isEdit = msg.method === "PATCH" && /\/annotations\/[^/]+$/.test(new URL(msg.url).pathname)
  if (!msg.body || (!isCreate && !isEdit)) return msg.body
  const me = await getIdentity()
  if (!me) return msg.body
  let data
  try { data = JSON.parse(msg.body) } catch { return msg.body }
  const { showAuthor } = await getConfig()
  if (isCreate) data.authorId = `github:${me.login}`
  // Edits keep the original author's prefix; only unsigned text gets the editor's name.
  if (showAuthor && typeof data.comment === "string" && !AUTHOR_PREFIX.test(data.comment)) {
    data.comment = `@${me.login}: ${data.comment}`
  }
  return JSON.stringify(data)
}
