// Isolated-world relay between the page-side toolbar and the service worker. Injected once per page.
if (!window.__annotatorBridge) {
  window.__annotatorBridge = true
  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.data?.__annotator !== "req") return
    const { id, url, method, headers, body } = e.data
    let res
    try {
      res = await chrome.runtime.sendMessage({ type: "annotator-fetch", url, method, headers, body })
    } catch (err) {
      res = { error: String(err?.message ?? err) }
    }
    window.postMessage({ __annotator: "res", id, ...(res ?? { error: "no response" }) }, "*")
  })
}
