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
      max_memory_restart: '200M',
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
      max_memory_restart: '400M', // 1 GB total: OS ~200M + api ~200M + web ~400M
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
        // API is co-located — SSR fetches go direct, never via the public hostname
        SERVER_API_ORIGIN: 'http://localhost:3001',
        // REVALIDATE_SECRET is exported into the shell before `pm2 reload` by the
        // deploy workflow, so process.env picks it up when this file is evaluated.
        ...(process.env.REVALIDATE_SECRET && { REVALIDATE_SECRET: process.env.REVALIDATE_SECRET }),
      },
    },
  ],
};
