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

This bot handles a Telegram bot token, an optional webhook secret and per-user
quiz statistics:

- **Credentials** – keep `BOT_TOKEN` and `WEBHOOK_SECRET` in environment variables
  or the ignored `.env` file. Revoke a leaked bot token immediately via
  [@BotFather](https://t.me/BotFather); replace a leaked webhook secret and
  restart the bot to register the new one.
- **User data** – PostgreSQL stores Telegram identifiers, counters, round
  progress and unresolved question IDs. Keep connection URLs and backups out
  of Git. A legacy `users.json` is an import only and must not be committed.
- **Webhook** – keep the internal listener private. Do not log request bodies
  or the `X-Telegram-Bot-Api-Secret-Token` header at the HTTPS proxy.

## Handling of Secrets

If you discover that a secret (such as a Telegram bot token) has been committed
to the repository history, please report it privately as described above so the
token can be revoked and the history remediated.
