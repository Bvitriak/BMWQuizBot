require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const questions = require('./questions');
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not set. Create a .env file (see .env.example) with your bot token.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const busyUsers = new Set();

let users = {};

function createUser() {
    return {
        correct: 0,
        incorrect: 0,
        skipped: 0,
        answers: {},
        incorrectQuestions: [],
        currentQuestion: null,
        repeatingIncorrect: null,
        repeatMode: false,
        repeatCorrect: 0,
        repeatIncorrect: 0,
        repeatSkipped: 0,
        stats: {
            totalCorrect: 0,
            totalIncorrect: 0,
            totalSkipped: 0,
            quizzesCompleted: 0
        }
    };
}

function migrateAnswers(answers) {
    const out = {};
    for (const [id, value] of Object.entries(answers || {})) {
        if (value && typeof value === 'object' && 'correct' in value) {
            out[id] = { selected: value.selected ?? null, correct: value.correct };
        } else if (value === null) {
            out[id] = { selected: null, correct: null };
        } else {
            out[id] = { selected: null, correct: value === true };
        }
    }
    return out;
}

function normalizeUser(rawUser) {
    const base = createUser();
    const merged = { ...base, ...rawUser };
    merged.stats = { ...base.stats, ...(rawUser.stats || {}) };
    merged.answers = migrateAnswers(rawUser.answers);
    merged.incorrectQuestions = Array.isArray(rawUser.incorrectQuestions) ? rawUser.incorrectQuestions : [];
    delete merged.busy;
    return merged;
}

try {
    const data = fs.readFileSync('./users.json', 'utf8');
    const parsed = JSON.parse(data);
    for (const userId in parsed) {
        users[userId] = normalizeUser(parsed[userId]);
    }
} catch (err) {
    console.log('No users file found, starting fresh');
}

function saveUsers() {
    try {
        fs.writeFileSync('./users.json', JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('Failed to save users:', err.message);
    }
}

function esc(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function safeSend(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (err) {
        console.error('sendMessage failed:', err.message);
        return null;
    }
}

const WELCOME_MESSAGE =
`🌟 <b>Welcome to the BMW Knowledge Quiz!</b> 🌟

🚗 <b>Level up your BMW knowledge!</b> 🚗

This bot will help you:
• Deepen your knowledge of BMW models and technologies
• Prepare to work with customers
• Learn interesting technical details
• Boost your expertise in a fun way

📚 <b>How it works:</b>
1. You answer quiz questions
2. You get an explanation for each answer
3. You review your mistakes
4. You improve your score with every run

🔹 <b>Why it's useful:</b>
✔ You understand the BMW product better
✔ You can talk to customers more confidently
✔ You increase your professional value`;

function getMainMenuKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '🚀 Start Quiz' }],
                [{ text: '📊 My Stats' }, { text: '🆘 Help' }]
            ],
            resize_keyboard: true
        }
    };
}

function getAnswerKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
                [{ text: 'Skip question' }, { text: '◀️ Main menu' }]
            ],
            resize_keyboard: true
        }
    };
}

function getFinalMenuKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '🔁 Repeat mistakes' }, { text: '🔄 Restart' }],
                [{ text: '◀️ Main menu' }]
            ],
            resize_keyboard: true
        }
    };
}

function getStatsKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '🚀 Start Quiz' }, { text: '🆘 Help' }],
                [{ text: '🗑️ Reset stats' }, { text: '◀️ Main menu' }]
            ],
            resize_keyboard: true
        }
    };
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!users[userId]) {
        users[userId] = createUser();
        saveUsers();
    }

    safeSend(chatId, WELCOME_MESSAGE, {
        parse_mode: 'HTML',
        ...getMainMenuKeyboard()
    });
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (!text) return;

    if (!users[userId]) {
        await safeSend(chatId, 'Please press /start first.');
        return;
    }

    switch (text) {
        case '🚀 Start Quiz':
            await startQuiz(chatId, userId);
            break;
        case '📊 My Stats':
            await showStats(chatId, userId);
            break;
        case '🆘 Help':
            await showHelp(chatId);
            break;
        case '➡️ Next question':
            if (users[userId].repeatMode) {
                await askNextIncorrectQuestion(chatId, userId);
            } else {
                await askQuestion(chatId, userId);
            }
            break;
        case '🔄 Restart':
            await resetQuiz(chatId, userId);
            break;
        case '🔁 Repeat mistakes':
            await repeatIncorrectQuestions(chatId, userId);
            break;
        case 'Skip question':
            await skipQuestion(chatId, userId);
            break;
        case '🗑️ Reset stats':
            await resetStats(chatId, userId);
            break;
        case '◀️ Main menu':
            await safeSend(chatId, WELCOME_MESSAGE, {
                parse_mode: 'HTML',
                ...getMainMenuKeyboard()
            });
            break;
        case 'a':
        case 'b':
        case 'c':
            await handleAnswer(chatId, userId, text);
            break;
        default:
            if (text.startsWith('/')) return;
            await safeSend(chatId, 'Please use the buttons to navigate.', getMainMenuKeyboard());
    }
});

function resetSession(user) {
    user.answers = {};
    user.correct = 0;
    user.incorrect = 0;
    user.skipped = 0;
    user.incorrectQuestions = [];
    user.currentQuestion = null;
    user.repeatingIncorrect = null;
    user.repeatMode = false;
}

async function startQuiz(chatId, userId) {
    resetSession(users[userId]);
    saveUsers();
    await askQuestion(chatId, userId);
}

async function resetQuiz(chatId, userId) {
    resetSession(users[userId]);
    saveUsers();
    await safeSend(chatId, 'Quiz restarted! All previous answers have been cleared.');
    await askQuestion(chatId, userId);
}

async function resetStats(chatId, userId) {
    const user = users[userId];
    user.correct = 0;
    user.incorrect = 0;
    user.skipped = 0;
    user.incorrectQuestions = [];
    user.stats = createUser().stats;
    saveUsers();

    await safeSend(chatId, '📊 Your statistics have been reset!', getStatsKeyboard());
}

async function repeatIncorrectQuestions(chatId, userId) {
    const user = users[userId];

    if (!user.incorrectQuestions || user.incorrectQuestions.length === 0) {
        await safeSend(chatId, 'You have no incorrect questions to repeat!', getMainMenuKeyboard());
        return;
    }

    user.repeatingIncorrect = [...user.incorrectQuestions];
    user.repeatMode = true;
    user.repeatCorrect = 0;
    user.repeatIncorrect = 0;
    user.repeatSkipped = 0;
    saveUsers();

    await askNextIncorrectQuestion(chatId, userId);
}

async function askNextIncorrectQuestion(chatId, userId) {
    const user = users[userId];

    if (!user.repeatingIncorrect || user.repeatingIncorrect.length === 0) {
        const total = user.repeatCorrect + user.repeatIncorrect + user.repeatSkipped;
        const percentage = total > 0 ? Math.round((user.repeatCorrect / total) * 100) : 0;

        let resultMessage = `🔁 <b>Mistake review complete!</b>\n\n` +
            `📊 <b>Review results:</b>\n` +
            `✅ Correct: ${user.repeatCorrect}\n` +
            `❌ Incorrect: ${user.repeatIncorrect}\n` +
            `⏩ Skipped: ${user.repeatSkipped}\n` +
            `📈 Accuracy: ${percentage}%\n\n`;

        user.incorrectQuestions = user.repeatingIncorrect;
        user.repeatingIncorrect = null;
        user.repeatMode = false;
        saveUsers();

        if (user.incorrectQuestions.length > 0) {
            resultMessage += `📌 You still have questions with mistakes. You can repeat them again.`;
        } else {
            resultMessage += `🎉 Congratulations! You fixed all your mistakes!`;
        }

        await safeSend(chatId, resultMessage, {
            parse_mode: 'HTML',
            ...getFinalMenuKeyboard()
        });
        return;
    }

    const questionId = user.repeatingIncorrect[0];
    const question = questions.find(q => q.id === questionId);

    if (!question) {
        user.repeatingIncorrect.shift();
        await askNextIncorrectQuestion(chatId, userId);
        return;
    }

    user.currentQuestion = question.id;

    const currentIndex = user.incorrectQuestions.length - user.repeatingIncorrect.length + 1;
    let questionText = `🔁 <b>Mistake review (${currentIndex}/${user.incorrectQuestions.length}):</b>\n\n` +
        `❓ ${esc(question.text)}\n\n`;
    question.options.forEach((opt, i) => {
        const letter = String.fromCharCode(97 + i);
        questionText += `<b>${letter})</b> ${esc(opt.text)}\n`;
    });

    await safeSend(chatId, questionText, {
        parse_mode: 'HTML',
        ...getAnswerKeyboard()
    });
    saveUsers();
}

async function skipQuestion(chatId, userId) {
    const user = users[userId];
    if (busyUsers.has(userId)) return;

    const questionId = user.currentQuestion;
    if (!questionId) {
        await safeSend(chatId, 'No active question to skip.');
        return;
    }

    const question = questions.find(q => q.id === questionId);
    if (!question) {
        user.currentQuestion = null;
        await safeSend(chatId, 'Error: question not found.');
        return;
    }

    busyUsers.add(userId);
    try {
        user.currentQuestion = null;

        if (user.repeatMode) {
            user.repeatSkipped++;
            user.repeatingIncorrect = user.repeatingIncorrect.filter(id => id !== question.id);
            user.repeatingIncorrect.push(question.id);
        } else {
            user.skipped++;
            user.stats.totalSkipped++;
            user.answers[question.id] = { selected: null, correct: null };
            if (!user.incorrectQuestions.includes(question.id)) {
                user.incorrectQuestions.push(question.id);
            }
        }

        const correctOption = question.options.find(opt => opt.correct);
        await safeSend(chatId,
            `⏩ Question skipped!\n` +
            `✅ Correct answer: ${esc(correctOption.text)}\n\n` +
            esc(question.explanation),
            { parse_mode: 'HTML' }
        );
        saveUsers();

        if (user.repeatMode) {
            await askNextIncorrectQuestion(chatId, userId);
        } else {
            const unanswered = questions.filter(q => user.answers[q.id] === undefined);
            if (unanswered.length === 0) {
                await showFinalResults(chatId, userId);
            } else {
                await askQuestion(chatId, userId);
            }
        }
    } finally {
        busyUsers.delete(userId);
    }
}

async function askQuestion(chatId, userId) {
    const user = users[userId];
    const unanswered = questions.filter(q => user.answers[q.id] === undefined);

    if (unanswered.length === 0) {
        await showFinalResults(chatId, userId);
        return;
    }

    const randomIndex = Math.floor(Math.random() * unanswered.length);
    const question = unanswered[randomIndex];
    user.currentQuestion = question.id;

    const answeredCount = questions.length - unanswered.length;
    let questionText = `❓ <b>Question ${answeredCount + 1}/${questions.length}:</b> ${esc(question.text)}\n\n`;
    question.options.forEach((opt, i) => {
        const letter = String.fromCharCode(97 + i);
        questionText += `<b>${letter})</b> ${esc(opt.text)}\n`;
    });

    await safeSend(chatId, questionText, {
        parse_mode: 'HTML',
        ...getAnswerKeyboard()
    });
    saveUsers();
}

async function handleAnswer(chatId, userId, answerLetter) {
    const user = users[userId];
    if (busyUsers.has(userId)) return;

    const questionId = user.currentQuestion;
    if (!questionId) {
        await safeSend(chatId, 'No active question. Press "🚀 Start Quiz" to begin.');
        return;
    }

    const question = questions.find(q => q.id === questionId);
    if (!question) {
        user.currentQuestion = null;
        await safeSend(chatId, 'Error: question not found.');
        return;
    }

    const optionIndex = answerLetter.charCodeAt(0) - 97;
    if (optionIndex < 0 || optionIndex >= question.options.length) {
        await safeSend(chatId, 'Invalid answer option.');
        return;
    }

    busyUsers.add(userId);
    try {
        user.currentQuestion = null;

        const selectedOption = question.options[optionIndex];
        const isCorrect = !!selectedOption.correct;
        const correctOption = question.options.find(opt => opt.correct);

        if (user.repeatMode) {
            user.repeatingIncorrect = user.repeatingIncorrect.filter(id => id !== question.id);
            if (isCorrect) {
                user.repeatCorrect++;
                await safeSend(chatId, `✅ <b>Correct!</b>\n${esc(question.explanation)}`, { parse_mode: 'HTML' });
            } else {
                user.repeatIncorrect++;
                user.repeatingIncorrect.push(question.id);
                await safeSend(chatId,
                    `❌ <b>Incorrect!</b>\nYou chose: ${esc(selectedOption.text)}\n` +
                    `✅ Correct answer: ${esc(correctOption.text)}\n\n` +
                    esc(question.explanation),
                    { parse_mode: 'HTML' }
                );
            }
            saveUsers();
            await askNextIncorrectQuestion(chatId, userId);
        } else {
            user.answers[question.id] = { selected: optionIndex, correct: isCorrect };

            if (isCorrect) {
                user.correct++;
                user.stats.totalCorrect++;
                user.incorrectQuestions = user.incorrectQuestions.filter(id => id !== question.id);
                await safeSend(chatId, `✅ <b>Correct!</b>\n${esc(question.explanation)}`, { parse_mode: 'HTML' });
            } else {
                user.incorrect++;
                user.stats.totalIncorrect++;
                if (!user.incorrectQuestions.includes(question.id)) {
                    user.incorrectQuestions.push(question.id);
                }
                await safeSend(chatId,
                    `❌ <b>Incorrect!</b>\nYou chose: ${esc(selectedOption.text)}\n` +
                    `✅ Correct answer: ${esc(correctOption.text)}\n\n` +
                    esc(question.explanation),
                    { parse_mode: 'HTML' }
                );
            }
            saveUsers();

            const unanswered = questions.filter(q => user.answers[q.id] === undefined);
            if (unanswered.length === 0) {
                await showFinalResults(chatId, userId);
            } else {
                await askQuestion(chatId, userId);
            }
        }
    } finally {
        busyUsers.delete(userId);
    }
}

async function showFinalResults(chatId, userId) {
    const user = users[userId];
    const total = questions.length;
    const percentage = total > 0 ? Math.round((user.correct / total) * 100) : 0;

    user.stats.quizzesCompleted++;
    user.currentQuestion = null;
    saveUsers();

    let detailedResults = `📝 <b>Detailed results:</b>\n\n`;
    questions.forEach((question, index) => {
        const answer = user.answers[question.id];
        const correctOption = question.options.find(opt => opt.correct);

        detailedResults += `${index + 1}. ${esc(question.text)}\n`;

        if (!answer || answer.correct === null) {
            detailedResults += `   ⏩ Skipped\n`;
        } else if (answer.correct === true) {
            detailedResults += `   ✅ Correct\n`;
        } else {
            const selectedOption = answer.selected != null ? question.options[answer.selected] : null;
            detailedResults += `   ❌ Wrong${selectedOption ? ` (chose: ${esc(selectedOption.text)})` : ''}\n`;
        }

        detailedResults += `   🔹 Correct answer: ${esc(correctOption.text)}\n\n`;
    });

    let statsMessage = `🎉 <b>Quiz complete!</b>\n\n` +
        `📊 <b>Your results:</b>\n` +
        `✅ Correct: ${user.correct}/${total} (${percentage}%)\n` +
        `❌ Incorrect: ${user.incorrect}\n` +
        `⏩ Skipped: ${user.skipped}\n\n` +
        `${detailedResults}`;

    if (user.incorrectQuestions && user.incorrectQuestions.length > 0) {
        statsMessage += `📌 <b>We recommend repeating:</b>\n`;
        user.incorrectQuestions.forEach((qId, index) => {
            const q = questions.find(question => question.id === qId);
            if (q) {
                const qNumber = questions.findIndex(question => question.id === qId) + 1;
                statsMessage += `${index + 1}. [Question ${qNumber}] ${esc(q.text)}\n`;
            }
        });
        statsMessage += `\nPress "🔁 Repeat mistakes" to work on them.`;
    } else {
        statsMessage += `🎯 Great result! All answers are correct!`;
    }

    await safeSend(chatId, statsMessage, {
        parse_mode: 'HTML',
        ...getFinalMenuKeyboard()
    });
}

async function showStats(chatId, userId) {
    const user = users[userId];
    if (!user) {
        await safeSend(chatId, 'Error: user not found.');
        return;
    }

    const s = user.stats;
    const totalAnswered = s.totalCorrect + s.totalIncorrect + s.totalSkipped;
    const percentage = totalAnswered > 0 ? Math.round((s.totalCorrect / totalAnswered) * 100) : 0;

    const statsMessage = `📊 <b>Your all-time statistics:</b>\n\n` +
        `✅ Correct answers: ${s.totalCorrect}\n` +
        `❌ Incorrect answers: ${s.totalIncorrect}\n` +
        `⏩ Skipped questions: ${s.totalSkipped}\n` +
        `🏁 Quizzes completed: ${s.quizzesCompleted}\n` +
        `📈 Accuracy: ${percentage}%`;

    await safeSend(chatId, statsMessage, {
        parse_mode: 'HTML',
        ...getStatsKeyboard()
    });
}

async function showHelp(chatId) {
    const helpMessage = `🛠 <b>Help</b>\n\n` +
        `This bot helps you learn the technical specs of BMW cars.\n\n` +
        `<b>How to use the quiz:</b>\n` +
        `- Press "🚀 Start Quiz"\n` +
        `- Choose answers (a, b, c) or skip questions\n` +
        `- After each answer you'll see the result and an explanation\n` +
        `- At the end you'll get recommendations for the tricky questions\n\n` +
        `<b>All commands:</b>\n` +
        `/start - Main menu\n` +
        `/quiz - Start the quiz\n` +
        `/stats - Show statistics\n` +
        `/help - This help`;

    await safeSend(chatId, helpMessage, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                [{ text: '🚀 Start Quiz' }],
                [{ text: '📊 My Stats' }, { text: '◀️ Main menu' }]
            ],
            resize_keyboard: true
        }
    });
}

bot.onText(/\/quiz/, (msg) => {
    if (!users[msg.from.id]) users[msg.from.id] = createUser();
    startQuiz(msg.chat.id, msg.from.id);
});
bot.onText(/\/stats/, (msg) => {
    if (!users[msg.from.id]) users[msg.from.id] = createUser();
    showStats(msg.chat.id, msg.from.id);
});
bot.onText(/\/help/, (msg) => showHelp(msg.chat.id));

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

function shutdown() {
    saveUsers();
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Bot started...');
