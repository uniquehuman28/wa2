require('dotenv').config();

module.exports = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    ownerId: process.env.OWNER_TELEGRAM_ID
  },
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  cache: {
    type: process.env.CACHE_TYPE || 'file',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  whatsapp: {
    sessionPath: process.env.SESSION_PATH || './sessions'
  },
  delays: {
    minDelay: 2000, // 2 seconds
    maxDelay: 5000  // 5 seconds
  }
};