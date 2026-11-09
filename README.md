# annotator

A Claude Code plugin that adds shared click-to-comment feedback to any website.

Colleagues open the deployed site, click the toolbar, click any element and write a note. Every note lands on one self-hosted notes server, everyone sees everyone's notes, and a cron job keeps backups. Claude reads the notes back over HTTP, with a selector, nearby text and URL for each one, so it can find the right element in the code and fix it.

Built on [Agentation](https://github.com/benjitaylor/agentation) (toolbar + `agentation-mcp` server), hosted on [Railway](https://railway.com).

## Install

In Claude Code:

```
/plugin marketplace add Wahajolla/annotator-skill
/plugin install annotator@wahajolla
```

Then just ask, for example:

- "Set up comments on this mock so colleagues can leave feedback"
- "Read the feedback notes and apply them"
- "Restore notes from the backup"

The skill is `annotator:site-feedback-notes`.

## What it sets up

1. **Notes server** — `agentation-mcp` on Railway with a persistent volume (SQLite), CORS locked to your site.
2. **Toolbar** — the `<Agentation>` React component, only in a dedicated shared build (gated by env vars), with one shared session so everyone sees all notes.
3. **Hosting** (optional) — a Bun function serving a static build from a Railway bucket, token-protected upload, optional Basic auth. See [`site-function.ts`](skills/site-feedback-notes/site-function.ts) and [`deploy.sh`](skills/site-feedback-notes/deploy.sh).
4. **Backups** — a cron function snapshotting all notes into a private bucket every 5 minutes ([`backup-function.ts`](skills/site-feedback-notes/backup-function.ts)).

## Requirements

- A Railway account and Railway tools available to Claude (the Railway MCP connector or the Railway CLI).
- The site is React 18+ (for non-React sites the skill mounts the toolbar in a tiny separate React root).
- The toolbar is desktop only.

## Caveats

- The notes server has no auth, only CORS: anyone who can open the site can add and delete notes. Fine for internal review; backups cover accidental deletes.
- Agentation itself is licensed under PolyForm Shield. This repo (the skill and templates) is MIT.

## License

MIT
