const { resolve } = require('node:path');

module.exports = {
  apps: [
    {
      name: 'bmw-quiz-bot',
      script: 'dist/index.js',
      node_args: '--env-file-if-exists=.env',
      cwd: resolve(__dirname, '..'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 26000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
