const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.qrCode = null;
    this.isConnected = false;
    this.authState = null;
    this.sessionPath = path.join(config.whatsapp.sessionPath, 'auth');
    this.groups = [];
  }

  async init() {
    try {
      await fs.mkdir(this.sessionPath, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
      this.authState = { state, saveCreds };
      
      // Check if we have cached session
      const cachedSession = await cache.get('wa_session');
      if (cachedSession) {
        await this.connect();
      }
      
      logger.info('WhatsApp service initialized');
    } catch (error) {
      logger.error('WhatsApp service init failed:', error);
      throw error;
    }
  }

  async connect() {
    try {
      const { version } = await fetchLatestBaileysVersion();
      
      this.sock = makeWASocket({
        auth: this.authState.state,
        version,
        printQRInTerminal: false,
        logger: {
          level: 'silent',
          child: () => ({ level: 'silent' })
        }
      });

      this.setupEventHandlers();
      
      logger.info('WhatsApp socket created');
    } catch (error) {
      logger.error('WhatsApp connect failed:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        this.qrCode = await QRCode.toDataURL(qr);
        logger.info('QR Code generated');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        
        logger.info('Connection closed due to:', lastDisconnect?.error);
        
        if (shouldReconnect) {
          await this.connect();
        } else {
          this.isConnected = false;
          await cache.delete('wa_session');
          await cache.delete('wa_groups');
        }
      } else if (connection === 'open') {
        this.isConnected = true;
        this.qrCode = null;
        await cache.set('wa_session', { connected: true, timestamp: Date.now() }, 86400);
        await this.loadGroups();
        logger.info('WhatsApp connected successfully');
      }
    });

    this.sock.ev.on('creds.update', this.authState.saveCreds);
  }

  async loadGroups() {
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      this.groups = Object.values(groups).map((group, index) => ({
        id: group.id,
        number: index + 1,
        name: group.subject,
        participants: group.participants.length,
        pending: group.participants.filter(p => p.admin === null).length,
        inviteCode: null,
        isAdmin: group.participants.find(p => p.id === this.sock.user.id)?.admin !== null
      }));

      // Get invite codes for groups where user is admin
      for (let group of this.groups) {
        if (group.isAdmin) {
          try {
            const inviteCode = await this.sock.groupInviteCode(group.id);
            group.inviteCode = `https://chat.whatsapp.com/${inviteCode}`;
          } catch (error) {
            logger.warn(`Failed to get invite code for group ${group.name}:`, error);
          }
        }
      }

      await cache.set('wa_groups', this.groups, 3600);
      logger.info(`Loaded ${this.groups.length} groups`);
    } catch (error) {
      logger.error('Failed to load groups:', error);
    }
  }

  async getGroups() {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    // Try to get from cache first
    const cachedGroups = await cache.get('wa_groups');
    if (cachedGroups) {
      this.groups = cachedGroups;
      return this.groups;
    }

    await this.loadGroups();
    return this.groups;
  }

  async updateGroupSetting(groupId, setting, action) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const settingMap = {
      info: 'subject',
      msg: 'messaging',
      media: 'media',
      approve: 'membership_approval'
    };

    const baileysSetting = settingMap[setting];
    if (!baileysSetting) {
      throw new Error('Invalid setting');
    }

    try {
      await this.sock.groupSettingUpdate(groupId, baileysSetting, action === 'on');
      return true;
    } catch (error) {
      logger.error(`Failed to update group setting ${setting}:`, error);
      throw error;
    }
  }

  async renameGroup(groupId, newName) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    try {
      await this.sock.groupUpdateSubject(groupId, newName);
      return true;
    } catch (error) {
      logger.error('Failed to rename group:', error);
      throw error;
    }
  }

  async updateGroupDescription(groupId, description) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    try {
      await this.sock.groupUpdateDescription(groupId, description);
      return true;
    } catch (error) {
      logger.error('Failed to update group description:', error);
      throw error;
    }
  }

  async updateGroupPicture(groupId, imageBuffer) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    try {
      await this.sock.updateProfilePicture(groupId, imageBuffer);
      return true;
    } catch (error) {
      logger.error('Failed to update group picture:', error);
      throw error;
    }
  }

  async removeGroupPicture(groupId) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    try {
      await this.sock.removeProfilePicture(groupId);
      return true;
    } catch (error) {
      logger.error('Failed to remove group picture:', error);
      throw error;
    }
  }

  async inviteToGroup(groupId, number) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    try {
      const formattedNumber = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
      await this.sock.groupParticipantsUpdate(groupId, [formattedNumber], 'add');
      return true;
    } catch (error) {
      logger.error('Failed to invite to group:', error);
      throw error;
    }
  }

  async getGroupInfo(groupId) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    try {
      const groupMetadata = await this.sock.groupMetadata(groupId);
      const group = this.groups.find(g => g.id === groupId);
      
      return {
        id: groupMetadata.id,
        name: groupMetadata.subject,
        description: groupMetadata.desc,
        participants: groupMetadata.participants.length,
        pending: groupMetadata.participants.filter(p => p.admin === null).length,
        inviteCode: group?.inviteCode || null,
        isAdmin: groupMetadata.participants.find(p => p.id === this.sock.user.id)?.admin !== null
      };
    } catch (error) {
      logger.error('Failed to get group info:', error);
      throw error;
    }
  }

  getQRCode() {
    return this.qrCode;
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      hasQR: !!this.qrCode
    };
  }

  async disconnect() {
    if (this.sock) {
      await this.sock.logout();
      this.sock = null;
      this.isConnected = false;
      this.qrCode = null;
    }
  }
}

module.exports = new WhatsAppService();