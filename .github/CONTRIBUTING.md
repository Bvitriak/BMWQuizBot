# Contributing to BMW Quiz Telegram Bot

Thanks for taking the time to contribute! 🎉 This project is a Node.js Telegram
bot that runs quizzes about BMW cars. Contributions of all kinds are welcome –
bug reports, new quiz questions, features, and documentation improvements.

By participating in this project, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Table of Contents

- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Making changes](#making-changes)
- [Adding or editing quiz questions](#adding-or-editing-quiz-questions)
- [Coding style](#coding-style)
- [Commit messages](#commit-messages)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs and requesting features](#reporting-bugs-and-requesting-features)

## Ways to contribute

- **Report a bug** – open a [bug report](https://github.com/Bvitriak/BMWQuizBot/issues/new/choose).
- **Suggest a feature** – open a [feature request](https://github.com/Bvitriak/BMWQuizBot/issues/new/choose).
- **Add quiz questions** – extend the question bank in [`src/data/bmw-questions.ts`](../src/data/bmw-questions.ts).
- **Improve the docs** – fix typos or clarify the README and this guide.
- **Fix a bug or build a feature** – open a pull request (see below).

## Development setup

You will need [Node.js](https://nodejs.org/) **26 LTS**, pnpm and a Telegram bot
token from [@BotFather](https://t.me/BotFather).

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-username>/BMWQuizBot.git
cd BMWQuizBot

# 2. Install dependencies
command -v pnpm >/dev/null || npm install --global pnpm@10.34.9
pnpm install --frozen-lockfile

# 3. Configure your bot token
cp .env.example .env
# then edit .env and set BOT_TOKEN
# Set DATABASE_URL and apply migrations.

# 4. Run the bot
pnpm dev
```

> **Never commit your `.env` file or a real bot token.** They are already listed
> in `.gitignore`. If you accidentally leak a token, revoke it immediately in
> [@BotFather](https://t.me/BotFather).

## Making changes

1. Create a branch from `main`:
   ```bash
   git checkout -b feature/short-description
   ```
2. Make your changes in small, focused commits.
3. Run the checks locally before pushing:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   ```
   For the complete suite including PostgreSQL, use the Docker Desktop setup
   in the [README](../README.md#optional-local-tests-with-docker-desktop-macos). The suite uses a mock Telegram API.
4. Push your branch and open a pull request.

## Adding or editing quiz questions

Quiz content lives in [`src/data/bmw-questions.ts`](../src/data/bmw-questions.ts). Each question follows the
existing object shape used in that file. When adding questions, please:

- Keep the answer options and the marked correct answer consistent.
- Assign a `category`. A topic appears once it has at least five questions.
- Keep question IDs stable: saved rounds and unresolved mistakes refer to them.
- Include a short explanation so users learn from each question.
- Double-check technical facts (engine codes, specs) before submitting.
- Keep the wording clear and neutral.

## Coding style

- This project uses strict TypeScript and ECMAScript modules on Node.js.
- Match the style of the surrounding code: 2-space indentation, semicolons, and
  descriptive variable names.
- Keep functions small and focused; avoid unrelated changes in the same PR.
- Do not introduce new dependencies without a clear reason.

## Commit messages

Write clear, imperative commit messages, for example:

```
Add questions about the B58 engine
Fix crash when users.json is empty
```

## Submitting a pull request

1. Make sure your branch is up to date with `main`.
2. Ensure the checks pass and the bot runs.
3. Fill out the pull request template completely.
4. Link any related issues (e.g. `Closes #12`).
5. Be responsive to review feedback – maintainers may ask for changes.

Continuous Integration (GitHub Actions) will run on your pull request. Please
make sure all checks are green.

## Reporting bugs and requesting features

Use the [issue templates](https://github.com/Bvitriak/BMWQuizBot/issues/new/choose). For **security-related**
issues, do **not** open a public issue – follow the process in
[SECURITY.md](SECURITY.md) instead.

Thank you for helping improve the BMW Quiz Bot! 🚗💨
