const path = require('path');
const APP_DIR = path.join(require('os').homedir(), 'krishnabyrr');

module.exports = {
  apps: [
    {
      name: 'kb-api',
      cwd: path.join(APP_DIR, 'api'),
      script: 'dist/index.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'kb-web',
      cwd: path.join(APP_DIR, 'apps/web'),
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
