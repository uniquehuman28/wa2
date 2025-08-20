module.exports = {
  apps: [{
    name: 'wa-telegram-bot',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // Restart policy
    min_uptime: '10s',
    max_restarts: 10,
    // Memory and CPU monitoring
    max_memory_restart: '500M',
    kill_timeout: 5000,
    // Graceful shutdown
    listen_timeout: 8000,
    // Health monitoring
    health_check_grace_period: 30000,
    // Log rotation
    log_type: 'json',
    // Environment specific settings
    node_args: '--max-old-space-size=512'
  }],

  deploy: {
    production: {
      user: 'node',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:username/whatsapp-telegram-bot.git',
      path: '/var/www/whatsapp-telegram-bot',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};