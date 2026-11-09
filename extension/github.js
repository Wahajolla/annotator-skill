// GitHub sign-in via the OAuth device flow: no backend and no client secret, only a public client id.
// The token is used once to read who you are and then discarded. Only {login, id, avatar} is kept.

// Public client id of the Annotator OAuth App (device flow enabled). Override it in the options.
export const DEFAULT_CLIENT_ID = ""

const json = { Accept: "application/json", "Content-Type": "application/json" }

export async function getIdentity() {
  return (await chrome.storage.local.get("github")).github ?? null
}

export async function signOut() {
  await chrome.storage.local.remove("github")
}

/** Starts the device flow. Returns {userCode, verificationUri, done: Promise<identity>}. */
export async function startSignIn(clientId) {
  if (!clientId) throw new Error("No GitHub OAuth client id configured")
  const start = await post("https://github.com/login/device/code", { client_id: clientId, scope: "" })
  if (start.error === "Not Found") throw new Error("GitHub doesn't know this OAuth client id")
  if (start.error === "device_flow_disabled") throw new Error("Enable Device Flow in the GitHub OAuth App settings")
  if (start.error) throw new Error(start.error_description || start.error)

  const done = (async () => {
    let interval = (start.interval || 5) * 1000
    const deadline = Date.now() + start.expires_in * 1000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval))
      const t = await post("https://github.com/login/oauth/access_token", {
        client_id: clientId,
        device_code: start.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      })
      if (t.access_token) {
        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${t.access_token}`, Accept: "application/vnd.github+json" },
        })
        if (!res.ok) throw new Error(`GitHub /user: HTTP ${res.status}`)
        const u = await res.json()
        const identity = { login: u.login, id: u.id, avatar: u.avatar_url, name: u.name || "" }
        await chrome.storage.local.set({ github: identity })
        return identity
      }
      if (t.error === "authorization_pending") continue
      if (t.error === "slow_down") { interval = (t.interval || interval / 1000 + 5) * 1000; continue }
      throw new Error(t.error_description || t.error || "Sign-in failed")
    }
    throw new Error("The code expired. Try again.")
  })()

  return { userCode: start.user_code, verificationUri: start.verification_uri, done }
}

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: json, body: JSON.stringify(body) })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { error: `HTTP ${res.status}`, error_description: text.slice(0, 200) } }
}
