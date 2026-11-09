#!/bin/sh
# Builds the mock with the Agentation feedback toolbar and uploads it to Railway (service "site").
# Template from the site-feedback-notes skill. Needs .deploy-token (the site service's UPLOAD_TOKEN variable).
set -eu
cd "$(dirname "$0")/.."
SITE=https://<site-domain>
FEEDBACK=https://<feedback-domain>
TOKEN=$(cat .deploy-token)
# Shared feedback session: all notes live here and every viewer sees them.
SESSION=<shared-session-id>

rm -rf dist-deploy
VITE_AGENTATION_URL=$FEEDBACK VITE_AGENTATION_SESSION=$SESSION pnpm build:deploy

cd dist-deploy
# Assets first, index.html last, so the page never points at missing files.
for f in $(find . -type f ! -name index.html ! -name .DS_Store | sed 's|^\./||') index.html; do
  curl -fsS -X PUT -H "x-upload-token: $TOKEN" --data-binary "@$f" "$SITE/__upload/$f" >/dev/null
  echo "uploaded $f"
done
echo "Deployed: $SITE"
