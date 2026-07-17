# BMW Quiz Telegram Bot

## Description

A Node.js Telegram bot that runs quizzes about BMW cars. The goal is to help new
employees get up to speed with the technical specifications of the cars — for
example, which engines are fitted to particular BMW models.

## Features

- **BMW model quiz**: users answer questions about engines and other car specs.
- **Answer feedback**: after every question the bot shows the correct answer and an explanation.
- **Progress tracking**: the bot keeps all-time statistics and recommends repeating the questions you got wrong.
- **Mistake review mode**: replay only the questions you answered incorrectly until you get them right.

## Getting started

### 1. Clone the repository
```bash
cd <your-project-location>
git clone <your-repository-url>
cd BMW-quiz-bot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure the bot token
Create a `.env` file from the provided example and paste your token from
[@BotFather](https://t.me/BotFather):
```bash
cp .env.example .env
```
```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

### 4. Run the bot
```bash
node index.js
```

## Usage

1. **Start the quiz**: press "🚀 Start Quiz" or send the `/start` command.
2. **Answer questions**: choose `a`, `b`, or `c`, or skip a question.
3. **Get help**: press "🆘 Help" or send `/help`.
4. **Track progress**: the bot tracks your results and offers to repeat the tricky questions.

### Commands
- `/start` — main menu
- `/quiz` — start the quiz
- `/stats` — show statistics
- `/help` — show help

## Tech stack
- **Telegram Bot API** (`node-telegram-bot-api`) for the bot
- **Node.js** for the bot logic
- **dotenv** for environment variables

## Requirements
- Node.js (version 12+ recommended)
- A Telegram account
- A bot token from [@BotFather](https://t.me/BotFather)

## About

This project was implemented as part of a first-year university project in 2025.
