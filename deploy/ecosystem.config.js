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
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'kb-web',
      // Standalone build bundles its own minimal node_modules — no npm install needed on server.
      cwd: path.join(APP_DIR, 'apps/web/.next/standalone/apps/web'),
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '900M', // needs headroom for image optimisation cache
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};
