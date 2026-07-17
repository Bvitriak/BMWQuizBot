module.exports = {
    apps: [
        {
            name: 'bmw-quiz-bot',
            script: 'index.js',
            cwd: __dirname,
            instances: 1,           // Telegram polling allows only ONE instance per token
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_restarts: 10,
            restart_delay: 3000,
            max_memory_restart: '200M',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
