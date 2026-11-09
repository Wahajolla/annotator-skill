import { DEFAULT_CLIENT_ID, getIdentity, signOut, startSignIn } from "./github.js"

const $ = (id) => document.getElementById(id)
const DEFAULTS = { endpoint: "http://localhost:4747", session: "", app: "", hash: false, showAuthor: true, clientId: "" }

const cfg = { ...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS))) }
$("endpoint").value = cfg.endpoint
$("session").value = cfg.session
$("app").value = cfg.app
$("hash").checked = cfg.hash
$("showAuthor").checked = cfg.showAuthor
$("clientId").value = cfg.clientId

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
  await chrome.storage.sync.set({
    endpoint,
    session: $("session").value.trim(),
    app: $("app").value.trim(),
    hash: $("hash").checked,
    showAuthor: $("showAuthor").checked,
    clientId: $("clientId").value.trim(),
  })
  show("Saved")
  await renderAccount()
})

function show(text, error = false) {
  $("status").textContent = text
  $("status").style.color = error ? "#b00" : ""
  setTimeout(() => ($("status").textContent = ""), 2500)
}

// --- GitHub account ---
async function renderAccount() {
  const me = await getIdentity()
  const configured = !!($("clientId").value.trim() || DEFAULT_CLIENT_ID)
  $("no-client").hidden = configured || !!me
  $("signed-in").hidden = !me
  $("signed-out").hidden = !!me || !configured
  if (me) {
    $("login").textContent = "@" + me.login
    $("avatar").src = me.avatar
  }
}
await renderAccount()

$("signin").addEventListener("click", async () => {
  $("auth-error").textContent = ""
  $("signin").disabled = true
  try {
    const clientId = $("clientId").value.trim() || DEFAULT_CLIENT_ID
    const flow = await startSignIn(clientId)
    $("user-code").textContent = flow.userCode
    $("verify-link").href = flow.verificationUri
    $("device").hidden = false
    navigator.clipboard.writeText(flow.userCode).catch(() => {})
    chrome.tabs.create({ url: flow.verificationUri })
    await flow.done
    $("device").hidden = true
    await renderAccount()
  } catch (e) {
    $("auth-error").textContent = e.message
    $("device").hidden = true
  } finally {
    $("signin").disabled = false
  }
})

$("signout").addEventListener("click", async () => {
  await signOut()
  await renderAccount()
})
