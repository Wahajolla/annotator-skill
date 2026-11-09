// Railway Function (Bun), cron "*/5 * * * *": snapshots every Agentation session and note
// from the notes server into a PRIVATE bucket (S3_* variables, never the public site bucket).
//   backups/latest.json      — always the newest snapshot
//   backups/<ISO time>.json  — written only when the notes changed
// Variables: FEEDBACK_URL, S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
// Restore: take a snapshot and POST its annotations back to /sessions/:id/annotations.
import { s3 } from "bun"

const BASE = Bun.env.FEEDBACK_URL
if (!BASE) throw new Error("FEEDBACK_URL is not set")

async function getJson(path: string) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

const list = await getJson("/sessions")
const sessions: { id: string }[] = Array.isArray(list) ? list : list.sessions ?? []
const full = []
for (const s of sessions) full.push(await getJson(`/sessions/${s.id}`))

const noteCount = full.reduce((n, s) => n + (s.annotations?.length ?? 0), 0)
const body = JSON.stringify({ sessions: full }, null, 2)
const hash = new Bun.CryptoHasher("sha256").update(body).digest("hex")

const latest = s3.file("backups/latest.json")
let previousHash: string | null = null
if (await latest.exists()) {
  try { previousHash = (await latest.json()).hash ?? null } catch { previousHash = null }
}

const takenAt = new Date().toISOString()
const snapshot = JSON.stringify({ takenAt, hash, noteCount, sessions: full }, null, 2)

if (hash !== previousHash) {
  await s3.write(`backups/${takenAt.replace(/[:.]/g, "-")}.json`, snapshot, { type: "application/json" })
  console.log(`changed: stored snapshot with ${noteCount} notes in ${full.length} sessions`)
} else {
  console.log(`unchanged: ${noteCount} notes in ${full.length} sessions`)
}
await s3.write("backups/latest.json", snapshot, { type: "application/json" })
