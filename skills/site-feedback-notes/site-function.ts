// Railway Function (Bun): serves a static build from a bucket (S3_* variables).
// PUT /__upload/<path> with header x-upload-token replaces a file (used by deploy.sh).
// Variables: S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
//            (as ${{<bucket>.ENDPOINT}} etc.), UPLOAD_TOKEN,
//            optional BASIC_USER + BASIC_PASS: when set, the site requires HTTP Basic auth.
import { s3 } from "bun"

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  woff2: "font/woff2",
  woff: "font/woff",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
}

const UPLOAD = "__upload/"

/** Basic auth is on only when both variables are set. */
function authorized(req: Request): boolean {
  const user = Bun.env.BASIC_USER
  const pass = Bun.env.BASIC_PASS
  if (!user && !pass) return true
  const header = req.headers.get("authorization") ?? ""
  if (!header.startsWith("Basic ")) return false
  let decoded = ""
  try { decoded = atob(header.slice(6)) } catch { return false }
  return decoded === `${user}:${pass}`
}

async function handle(req: Request): Promise<Response> {
  let path = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "")
  if (path.includes("..")) return new Response("Bad request", { status: 400 })
  if (path === "health") return new Response("ok")

  if (path.startsWith(UPLOAD)) {
    const token = Bun.env.UPLOAD_TOKEN
    if (req.method !== "PUT" || !token || req.headers.get("x-upload-token") !== token) {
      return new Response("Forbidden", { status: 403 })
    }
    const key = path.slice(UPLOAD.length)
    if (!key) return new Response("Bad request", { status: 400 })
    await s3.write(key, await req.arrayBuffer())
    return new Response(`stored ${key}`)
  }

  if (!authorized(req)) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "www-authenticate": 'Basic realm="Site", charset="UTF-8"' },
    })
  }

  if (path === "" || path.endsWith("/")) path += "index.html"
  const file = s3.file(path)
  if (!(await file.exists())) return new Response("Not found", { status: 404 })
  const ext = path.split(".").pop() ?? ""
  return new Response(await file.arrayBuffer(), {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": ext === "html" ? "no-cache" : "private, max-age=300",
      "x-robots-tag": "noindex, nofollow",
    },
  })
}

Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  maxRequestBodySize: 50 * 1024 * 1024,
  async fetch(req) {
    try {
      return await handle(req)
    } catch (e) {
      console.error("request failed", req.method, new URL(req.url).pathname, e)
      return new Response(`Error: ${(e as Error)?.message ?? e}`, { status: 500 })
    }
  },
})
