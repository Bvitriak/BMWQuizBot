# BMWQuizBot

[![CI](https://github.com/Bvitriak/BMWQuizBot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Bvitriak/BMWQuizBot/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Bvitriak/BMWQuizBot/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/Bvitriak/BMWQuizBot/actions/workflows/codeql.yml)

An educational Telegram bot with BMW quizzes, explanations, and mistake review. Built with Node.js 26 LTS, strict TypeScript, grammY, Zod, PostgreSQL 18, and Drizzle. The repository does not provide a publicly hosted bot.

## Features

| Command             | What it does                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/start`, `/help`   | Open the menu or show the help guide.                                                                                                                                                         |
| `/quiz`, `/restart` | Start or resume the full 16-question quiz. `/restart` starts a new full round.                                                                                                                |
| `/topics`           | Pick BMW M or History for a five-question round without repeats. Topics with fewer than five questions are hidden. The answers count toward your stats, but not toward completed full rounds. |
| `/mistakes`         | Review missed and skipped questions in a private chat. A correct answer removes a question from the list. Review attempts do not affect your overall score.                                   |
| `/stats`            | View your results and rank. Resetting your stats does not delete rounds or unresolved mistakes.                                                                                               |

Each answer, score change, and round step is saved in one database transaction. Buttons are bound to a player, chat, and round step, so duplicate taps cannot change the score. Progress survives a restart. The importer can migrate scores and supported progress fields from a legacy `users.json` file.

## Verify without installing anything

Check the `main` branch runs in [GitHub Actions](https://github.com/Bvitriak/BMWQuizBot/actions). `Build & test (Node 26.x)` runs the linter, dependency audit, build, and tests. `Analyze (javascript-typescript)` runs CodeQL. Both checks are required to merge a pull request. If you rename a required job, verify the new job on a PR before updating the branch rules.

The integration tests use a real PostgreSQL instance and a mock Telegram Bot API. They cover commands, progress, legacy imports, and transaction rollback. **No bot token, personal database, or `users.json` is required.** Passing CI does not verify behavior against the live Telegram API.

## Optional local tests with Docker Desktop (macOS)

If you already have Docker Desktop:

1. Open [`docker/Docker Tests.command`](docker/Docker%20Tests.command) in Finder.
2. In Docker Desktop, open **Containers → bmwquiz-tests → tests → Logs**. A successful run ends with **Exited (0)**.
3. To run again, click **Start** on `tests`. If `db` is stopped, start it first. Open the launcher again after changing dependencies or the Dockerfile.

The [test database](docker/compose.yaml) does not publish a port. Its data is cleared when `db` stops. The tests never use a production database.

## Optional self-hosted bot

```bash
nvm install
command -v pnpm >/dev/null || npm install --global pnpm@10.34.9
pnpm install --frozen-lockfile
(umask 077; cp -n .env.example .env)
```

Get `BOT_TOKEN` from [@BotFather](https://t.me/BotFather), set `DATABASE_URL`, and apply the migrations using the [PostgreSQL guide](docs/postgres.md). When upgrading an older JavaScript installation, set `BOT_TOKEN` to the value previously stored as `TELEGRAM_BOT_TOKEN`. Polling is the default and only needs one process per token.

```bash
pnpm build
pnpm start
```

Use `pnpm dev` for development. After building, you can start the application with `pm2 start config/ecosystem.config.cjs` or build the container image with `docker build -f docker/Dockerfile --target app .`.

For webhook mode, set `BOT_MODE=webhook`, `WEBHOOK_URL` to an HTTPS URL ending in `/telegram`, and `WEBHOOK_SECRET` as shown in the [environment template](.env.example). The reverse proxy must forward `X-Telegram-Bot-Api-Secret-Token` without logging it or the request body. Switching to polling unregisters the webhook without dropping queued updates.

## Project layout

| Directory             | Contents                                                             |
| --------------------- | -------------------------------------------------------------------- |
| [`src/`](src)         | Telegram handlers, quiz logic, question bank, and PostgreSQL storage |
| [`tests/`](tests)     | Unit and integration tests                                           |
| [`drizzle/`](drizzle) | SQL migrations                                                       |
| [`config/`](config)   | TypeScript, Vitest, Drizzle, and PM2 configuration                   |
| [`docker/`](docker)   | Container images, Compose stacks, and the Finder test launcher       |
| [`docs/`](docs)       | Project documentation                                                |
| [`.github/`](.github) | CI workflows, issue templates, and contribution guides               |
