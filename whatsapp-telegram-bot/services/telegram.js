const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class TelegramService {
  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, { polling: true });
    this.ownerId = config.telegram.ownerId;
    this.baseApiUrl = `http://localhost:${config.server.port}/api`;
    this.waitingForPhoto = new Map(); // Store users waiting to upload photo
    this.setupCommands();
  }

  setupCommands() {
    // Check if user is owner
    this.bot.on('message', async (msg) => {
      if (msg.from.id.toString() !== this.ownerId) {
        await this.bot.sendMessage(msg.chat.id, '❌ Unauthorized access');
        return;
      }

      // Handle photo upload for setpp command
      if (msg.photo && this.waitingForPhoto.has(msg.chat.id)) {
        const groupNumber = this.waitingForPhoto.get(msg.chat.id);
        this.waitingForPhoto.delete(msg.chat.id);
        
        try {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          const file = await this.bot.getFile(fileId);
          const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
          
          await this.apiCall('POST', '/wa/group/picture', {
            groupNumber: parseInt(groupNumber),
            fileUrl
          });
          
          await this.bot.sendMessage(msg.chat.id, `✅ Foto profil grup ${groupNumber} berhasil diubah`);
        } catch (error) {
          await this.bot.sendMessage(msg.chat.id, `❌ Error mengubah foto profil: ${error.message}`);
        }
        return;
      }
    });

    // Login command
    this.bot.onText(/\/login (.+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const number = match[1];
      try {
        const response = await this.apiCall('POST', '/wa/login', { number });
        
        if (response.qrCode) {
          // Send QR code as photo
          const buffer = Buffer.from(response.qrCode.split(',')[1], 'base64');
          await this.bot.sendPhoto(msg.chat.id, buffer, { caption: '📱 Scan QR code ini di WhatsApp Anda' });
        } else {
          await this.bot.sendMessage(msg.chat.id, '✅ Login berhasil!');
        }
      } catch (error) {
        await this.bot.sendMessage(msg.chat.id, `❌ Error login: ${error.message}`);
      }
    });

    // Status command
    this.bot.onText(/\/status/, async (msg) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      try {
        const response = await this.apiCall('GET', '/wa/status');
        const status = response.connected ? '🟢 Connected' : '🔴 Disconnected';
        await this.bot.sendMessage(msg.chat.id, `📱 WhatsApp Status: ${status}`);
      } catch (error) {
        await this.bot.sendMessage(msg.chat.id, `❌ Error getting status: ${error.message}`);
      }
    });

    // List groups command
    this.bot.onText(/\/list_groups/, async (msg) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      try {
        const response = await this.apiCall('GET', '/wa/groups');
        const groups = response.groups;
        
        if (groups.length === 0) {
          await this.bot.sendMessage(msg.chat.id, '📋 Tidak ada grup ditemukan');
          return;
        }

        let message = '📋 Daftar Grup:\n\n';
        groups.forEach(group => {
          message += `${group.number}. ${group.name}\n`;
          message += `   👥 Anggota: ${group.participants}\n`;
          message += `   ⏳ Pending: ${group.pending}\n`;
          message += `   🔗 Link: ${group.inviteCode || '-'}\n`;
          message += `   👑 Status: ${group.isAdmin ? 'Admin' : 'Anggota'}\n\n`;
        });

        await this.bot.sendMessage(msg.chat.id, message);
      } catch (error) {
        await this.bot.sendMessage(msg.chat.id, `❌ Error listing groups: ${error.message}`);
      }
    });

    // Set info command
    this.bot.onText(/\/set_info (on|off) (.+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const [, action, target] = match;
      await this.handleGroupSetting(msg.chat.id, 'info', action, target, 'Info');
    });

    // Set message command
    this.bot.onText(/\/set_msg (on|off) (.+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const [, action, target] = match;
      await this.handleGroupSetting(msg.chat.id, 'msg', action, target, 'Pesan');
    });

    // Set media command
    this.bot.onText(/\/set_media (on|off) (.+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const [, action, target] = match;
      await this.handleGroupSetting(msg.chat.id, 'media', action, target, 'Media');
    });

    // Set approval command
    this.bot.onText(/\/set_approve (on|off) (.+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const [, action, target] = match;
      await this.handleGroupSetting(msg.chat.id, 'approve', action, target, 'Approval');
    });

    // Rename group command
    this.bot.onText(/\/rename (\d+) (.+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const [, groupNumber, newName] = match;
      
      try {
        await this.apiCall('POST', '/wa/group/rename', {
          groupNumber: parseInt(groupNumber),
          newName
        });
        
        await this.bot.sendMessage(msg.chat.id, `✅ Nama grup ${groupNumber} berhasil diubah menjadi "${newName}"`);
      } catch (error) {
        await this.bot.sendMessage(msg.chat.id, `❌ Error rename group: ${error.message}`);
      }
    });

    // Update bio command
    this.bot.onText(/\/bio (\d+) (.+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const [, groupNumber, bio] = match;
      
      try {
        await this.apiCall('POST', '/wa/group/description', {
          groupNumber: parseInt(groupNumber),
          description: bio
        });
        
        await this.bot.sendMessage(msg.chat.id, `✅ Bio grup ${groupNumber} berhasil diubah`);
      } catch (error) {
        await this.bot.sendMessage(msg.chat.id, `❌ Error update bio: ${error.message}`);
      }
    });

    // Set profile picture command
    this.bot.onText(/\/setpp (\d+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const groupNumber = match[1];
      this.waitingForPhoto.set(msg.chat.id, groupNumber);
      
      await this.bot.sendMessage(msg.chat.id, `📷 Kirim foto untuk dijadikan profil picture grup ${groupNumber}`);
    });

    // Delete profile picture command
    this.bot.onText(/\/delpp (\d+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const groupNumber = match[1];
      
      try {
        await this.apiCall('POST', '/wa/group/picture', {
          groupNumber: parseInt(groupNumber),
          action: 'delete'
        });
        
        await this.bot.sendMessage(msg.chat.id, `✅ Foto profil grup ${groupNumber} berhasil dihapus`);
      } catch (error) {
        await this.bot.sendMessage(msg.chat.id, `❌ Error hapus foto profil: ${error.message}`);
      }
    });

    // Invite member command
    this.bot.onText(/\/invite (\d+) (\d+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const [, groupNumber, phoneNumber] = match;
      
      try {
        await this.apiCall('POST', '/wa/group/invite', {
          groupNumber: parseInt(groupNumber),
          number: phoneNumber
        });
        
        await this.bot.sendMessage(msg.chat.id, `✅ Nomor ${phoneNumber} berhasil diundang ke grup ${groupNumber}`);
      } catch (error) {
        await this.bot.sendMessage(msg.chat.id, `❌ Error invite member: ${error.message}`);
      }
    });

    // Group info command
    this.bot.onText(/\/group_info (\d+)/, async (msg, match) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const groupNumber = match[1];
      
      try {
        const response = await this.apiCall('GET', `/wa/group/${groupNumber}`);
        const group = response.group;
        
        let message = `📌 Nama: ${group.name}\n`;
        message += `👥 Anggota: ${group.participants}\n`;
        message += `⏳ Pending: ${group.pending}\n`;
        message += `🔗 Link: ${group.inviteCode || '-'}\n`;
        message += `👑 Status: ${group.isAdmin ? 'Admin' : 'Anggota'}\n`;
        
        if (group.description) {
          message += `📝 Deskripsi: ${group.description}\n`;
        }
        
        await this.bot.sendMessage(msg.chat.id, message);
      } catch (error) {
        await this.bot.sendMessage(msg.chat.id, `❌ Error getting group info: ${error.message}`);
      }
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      if (msg.from.id.toString() !== this.ownerId) return;
      
      const helpMessage = `
🤖 WhatsApp Bot Commands:

📱 **Connection:**
/login <nomor> - Login WhatsApp
/status - Check connection status

📋 **Groups:**
/list_groups - List all groups
/group_info <no> - Get group info

⚙️ **Group Settings:**
/set_info on|off <no/all> - Toggle group info edit
/set_msg on|off <no/all> - Toggle messaging
/set_media on|off <no/all> - Toggle media sharing
/set_approve on|off <no/all> - Toggle member approval

✏️ **Group Management:**
/rename <no> <nama_baru> - Rename group
/bio <no> <bio_baru> - Update group description
/setpp <no> - Set group profile picture
/delpp <no> - Delete group profile picture
/invite <no> <nomor> - Invite member to group

Example: /rename 1 Grup Baru
`;
      
      await this.bot.sendMessage(msg.chat.id, helpMessage);
    });

    logger.info('Telegram bot commands initialized');
  }

  async handleGroupSetting(chatId, setting, action, target, settingName) {
    try {
      const response = await this.apiCall('POST', '/wa/group/settings', {
        setting,
        action,
        target
      });
      
      let message = '';
      const actionText = action === 'on' ? 'dinyalakan' : 'dimatikan';
      
      if (response.results) {
        response.results.forEach(result => {
          if (result.success) {
            message += `✅ Grup ${result.groupNumber}: ${settingName} ${actionText}\n`;
          } else {
            message += `❌ Grup ${result.groupNumber}: ${result.error}\n`;
          }
        });
      }
      
      await this.bot.sendMessage(chatId, message || `✅ ${settingName} ${actionText}`);
    } catch (error) {
      await this.bot.sendMessage(chatId, `❌ Error setting ${settingName}: ${error.message}`);
    }
  }

  async apiCall(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseApiUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error(`API call error: ${method} ${endpoint}`, error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  async sendMessage(chatId, message) {
    try {
      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      logger.error('Failed to send Telegram message:', error);
    }
  }
}

module.exports = TelegramService;