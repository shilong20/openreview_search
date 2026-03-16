const path = require('path')
const ROOT = __dirname

module.exports = {
  apps: [
    {
      name: 'openreview-backend',
      cwd: ROOT,
      script: 'bash',
      args: '-lc "source venv/bin/activate && exec uvicorn backend.main:app --host 0.0.0.0 --port ${BACKEND_PORT:-8000}"',
      interpreter: 'none',
      watch: ['backend', '.env'],
      ignore_watch: ['storage', 'frontend', 'venv', '.git', '__pycache__'],
      watch_delay: 1000,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        PYTHONUNBUFFERED: '1',
      },
    },
    {
      name: 'openreview-frontend',
      cwd: path.join(ROOT, 'frontend'),
      script: 'bash',
      args: '-lc "exec npm run dev -- --host 0.0.0.0 --port ${FRONTEND_PORT:-5173} --strictPort"',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
}
