# telegram-dev-agent

A headless Claude Code agent you talk to over Telegram. It develops software in
your repos and pushes to GitHub while you're away from the keyboard. Runs as a
Docker container in a self-hosted stack.

It is not a custom agent framework — it's a thin Telegram bridge around the
**Claude Agent SDK**, which is the same engine as the Claude Code CLI.

## How it works

```
Telegram  ──►  bot.ts (grammy long-poll)  ──►  Agent SDK query()  ──►  git / gh
```

- One Telegram chat ↔ one persistent Claude session (resumed across messages).
- Runs with `bypassPermissions` — the container is the sandbox, repos are git,
  and only allow-listed Telegram users can talk to it.
- `CLAUDE.md` and skills are loaded from the filesystem via `settingSources:
  ['user','project']` (`'project'` is what makes `CLAUDE.md` load).

## Commands

| Command            | Does                                                              |
|--------------------|------------------------------------------------------------------|
| `/projects`        | List repos in the workspace                                       |
| `/project <name>`  | Switch to a repo; clones `owner/repo` via `gh` if missing; resets the conversation |
| `/skills`          | List global + current-project skills the agent can use           |
| `/context`         | Show the active `CLAUDE.md` files (global + project)              |
| _any other text_   | Sent to the agent as a prompt                                     |

## Setup

1. **Bot token** — create a bot with [@BotFather], copy the token.
2. **Your user ID** — message [@userinfobot], copy the numeric id.
3. **GitHub token** — a PAT with `repo` scope.
4. Copy env and fill it in:
   ```sh
   cp .env.example .env    # set TELEGRAM_BOT_TOKEN, ALLOWED_USER_IDS, GH_TOKEN
   ```
5. **Seed your Claude subscription login** into the creds volume (one time):
   ```sh
   mkdir -p data/claude data/workspace data/state
   # copy your existing logged-in credentials:
   cp -r ~/.claude/.credentials.json data/claude/
   # (or run `npx @anthropic-ai/claude-agent-sdk` interactively once against this dir)
   ```
   The OAuth token refreshes itself; the volume is mounted read-write so it can.
6. **Run:**
   ```sh
   docker compose up -d --build
   ```

Put global agent rules in `data/claude/CLAUDE.md` (e.g. "always branch, open a
PR, never force-push main") and reusable skills in `data/claude/skills/<name>/SKILL.md`.

## Local dev

Needs Node ≥ 24 (or ≥ 18 to run). `npm install`, set the same env vars, then:

```sh
npm run dev        # watch mode
npm test           # util self-check
npm run typecheck
```

[@BotFather]: https://t.me/BotFather
[@userinfobot]: https://t.me/userinfobot
