const $ = (id) => document.getElementById(id)
const DEFAULTS = { endpoint: "http://localhost:4747", session: "", app: "", hash: false }

const cfg = { ...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS))) }
$("endpoint").value = cfg.endpoint
$("session").value = cfg.session
$("app").value = cfg.app
$("hash").checked = cfg.hash

$("save").addEventListener("click", async () => {
  const endpoint = $("endpoint").value.trim().replace(/\/+$/, "")
  if (endpoint) {
    let origin
    try { origin = new URL(endpoint).origin } catch { return show("Not a valid URL", true) }
    // localhost is granted at install; anything else needs the user's OK once.
    const granted = await chrome.permissions.request({ origins: [origin + "/*"] }).catch(() => false)
    if (!granted && !(await chrome.permissions.contains({ origins: [origin + "/*"] }))) {
      return show("Permission for this server was not granted", true)
    }
  }
  await chrome.storage.sync.set({ endpoint, session: $("session").value.trim(), app: $("app").value.trim(), hash: $("hash").checked })
  show("Saved")
})

function show(text, error = false) {
  $("status").textContent = text
  $("status").style.color = error ? "#b00" : ""
  setTimeout(() => ($("status").textContent = ""), 2500)
}
