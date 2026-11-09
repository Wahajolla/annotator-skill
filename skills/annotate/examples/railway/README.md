# Worked example: shared mode on Railway

One way to run [shared mode](../../references/shared.md), via the Railway MCP tools or the Railway CLI. Use it only if the user picked Railway.

Files here:

- [site-function.ts](site-function.ts): a Bun function that serves a static build from a bucket, with a token-protected upload and optional Basic auth.
- [deploy.sh](deploy.sh): builds the site with the toolbar and uploads it, assets first and `index.html` last.
- [backup-function.ts](backup-function.ts): a cron job that snapshots all notes into a private bucket. It works with any S3-compatible bucket.

## Notes server (service `feedback`)

- `create-service` from image `node:22`.
- `startCommand`:
  `sh -c "mkdir -p /opt/app && cd /opt/app && npm init -y >/dev/null && npm i --no-audit --no-fund agentation-mcp@<version> && node -e 'require(process.env.PKG).startHttpServer(+process.env.PORT)'"`
- `healthcheckPath` `/health`, `healthcheckTimeout` 300, `restartPolicyType` ALWAYS.
- Variables:
  - `PKG=agentation-mcp`, `PORT=8080`, `HOME=/data`;
  - `AGENTATION_HOST=0.0.0.0`, `AGENTATION_STORE=sqlite`, `AGENTATION_EVENT_RETENTION_DAYS=365`;
  - `AGENTATION_CORS_ORIGINS` once the site has a domain.
- `create-volume` mounted at `/data`, and `generate-domain` with `targetPort` 8080. Stage everything, then run `accept-deploy`.

## Site hosting (bucket + function)

Railway has no plain static upload without a Git repo, and OAuth-connected tools get bucket credentials redacted. So:

- Create a bucket whose name is **different from every service name**, e.g. `sitefiles`. If a bucket and a service share a name, `${{name.X}}` resolves to the service and the S3 variables come out empty.
- Run `create-function` with `site-function.ts`. Set `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` as `${{<bucket>.ENDPOINT|BUCKET|REGION|ACCESS_KEY_ID|SECRET_ACCESS_KEY}}`. Use Bun's default `s3` client: a hand-built `S3Client` with `virtualHostedStyle` gets Access Denied.
- `UPLOAD_TOKEN`: generate it with `openssl rand -hex 24` and keep it in a gitignored `.deploy-token` (chmod 600).
- Optional `BASIC_USER`/`BASIC_PASS`: keep them in a gitignored `.site-auth`. Stage them together with the code and run one `accept-deploy`, so the site is never briefly open. Verify 401 without a password, 401 with a wrong one, and 200 with the right one.
- Copy `deploy.sh` into the project, fill in the URLs and session, and `generate-domain` for the function.

## Backups

Use a separate **private** bucket (e.g. `notesbackup`), never the site bucket. Create a function from `backup-function.ts` with the same `S3_*` references plus `FEEDBACK_URL`, `cronSchedule` `*/5 * * * *` and `restartPolicyType` NEVER. After the next 5-minute mark, the logs should say `changed: stored snapshot with N notes`.

To read a snapshot back, go through a function: bucket credentials are redacted for OAuth-connected tools.

## Gotchas

- `get-logs` with `types: ["http"]` shows who deleted what before you blame the server.
- Don't redeploy `feedback` while people are commenting.
