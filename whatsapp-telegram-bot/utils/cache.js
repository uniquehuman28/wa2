const fs = require('fs').promises;
const path = require('path');
const redis = require('redis');
const config = require('../config');
const logger = require('./logger');

class CacheManager {
  constructor() {
    this.cacheType = config.cache.type;
    this.fileCachePath = path.join(__dirname, '../cache');
    this.redisClient = null;
    
    this.init();
  }

  async init() {
    if (this.cacheType === 'redis') {
      try {
        this.redisClient = redis.createClient({ url: config.cache.redisUrl });
        await this.redisClient.connect();
        logger.info('Redis connected successfully');
      } catch (error) {
        logger.error('Redis connection failed, falling back to file cache', error);
        this.cacheType = 'file';
      }
    }

    if (this.cacheType === 'file') {
      try {
        await fs.mkdir(this.fileCachePath, { recursive: true });
        logger.info('File cache initialized');
      } catch (error) {
        logger.error('File cache initialization failed', error);
      }
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      if (this.cacheType === 'redis' && this.redisClient) {
        await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      } else {
        const filePath = path.join(this.fileCachePath, `${key}.json`);
        const data = {
          value,
          expires: Date.now() + (ttl * 1000)
        };
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      }
      logger.debug(`Cache set: ${key}`);
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  async get(key) {
    try {
      if (this.cacheType === 'redis' && this.redisClient) {
        const value = await this.redisClient.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        const filePath = path.join(this.fileCachePath, `${key}.json`);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        if (data.expires && Date.now() > data.expires) {
          await this.delete(key);
          return null;
        }
        
        return data.value;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Cache get error for key ${key}:`, error);
      }
      return null;
    }
  }

  async delete(key) {
    try {
      if (this.cacheType === 'redis' && this.redisClient) {
        await this.redisClient.del(key);
      } else {
        const filePath = path.join(this.fileCachePath, `${key}.json`);
        await fs.unlink(filePath);
      }
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Cache delete error for key ${key}:`, error);
      }
    }
  }

  async has(key) {
    const value = await this.get(key);
    return value !== null;
  }
}

module.exports = new CacheManager();