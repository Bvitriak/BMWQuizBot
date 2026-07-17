# Security Policy

## Supported Versions

This project is maintained on a best-effort basis. Security fixes are applied to
the latest version on the `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| latest (`main`) | :white_check_mark: |
| older commits   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you believe you have found a security vulnerability in the BMW Quiz Telegram
Bot, please report it privately using one of the following channels:

- Use GitHub's [**private vulnerability reporting**](https://github.com/Bvitriak/BMWQuizBot/security/advisories/new)
  ("Report a vulnerability" under the repository's *Security* tab), **or**
- Email **bvitriak@gmail.com** with the details.

Please include as much of the following as you can:

- A description of the vulnerability and its potential impact.
- Steps to reproduce, or a proof of concept.
- The affected file(s), function(s), or commit.
- Any suggested remediation, if you have one.

You can expect an initial response within a few days. We will keep you informed
as we investigate and work on a fix, and we will credit you for the report if
you would like.

## Scope

This bot handles a Telegram bot token and stores per-user quiz progress. Please
be especially mindful of:

- **Bot token exposure** — the token lives in the `.env` file, which is
  git-ignored. Never commit a real token. If a token is leaked, revoke it
  immediately via [@BotFather](https://t.me/BotFather).
- **User data** — `users.json` stores quiz progress and Telegram user
  identifiers. It is git-ignored and should not be committed.

## Handling of Secrets

If you discover that a secret (such as a Telegram bot token) has been committed
to the repository history, please report it privately as described above so the
token can be revoked and the history remediated.
