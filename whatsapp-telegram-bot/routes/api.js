const express = require('express');
const multer = require('multer');
const axios = require('axios');
const whatsappService = require('../services/whatsapp');
const logger = require('../utils/logger');
const config = require('../config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Utility function for random delay
const randomDelay = () => {
  const min = config.delays.minDelay;
  const max = config.delays.maxDelay;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Utility function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Login endpoint
router.post('/wa/login', async (req, res) => {
  try {
    const { number } = req.body;
    
    if (!number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    await whatsappService.init();
    await whatsappService.connect();
    
    const qrCode = whatsappService.getQRCode();
    const status = whatsappService.getConnectionStatus();
    
    if (status.connected) {
      return res.json({ 
        success: true, 
        message: 'Already connected',
        connected: true 
      });
    }
    
    if (qrCode) {
      return res.json({ 
        success: true, 
        qrCode,
        message: 'Scan QR code to login' 
      });
    }
    
    return res.json({ 
      success: true, 
      message: 'Connecting...' 
    });
    
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Status endpoint
router.get('/wa/status', async (req, res) => {
  try {
    const status = whatsappService.getConnectionStatus();
    res.json({ 
      success: true, 
      ...status 
    });
  } catch (error) {
    logger.error('Status error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get groups endpoint
router.get('/wa/groups', async (req, res) => {
  try {
    const groups = await whatsappService.getGroups();
    res.json({ 
      success: true, 
      groups,
      count: groups.length 
    });
  } catch (error) {
    logger.error('Get groups error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Update group settings endpoint
router.post('/wa/group/settings', async (req, res) => {
  try {
    const { setting, action, target } = req.body;
    
    if (!setting || !action || !target) {
      return res.status(400).json({ 
        success: false, 
        message: 'Setting, action, and target are required' 
      });
    }

    const groups = await whatsappService.getGroups();
    let targetGroups = [];

    if (target === 'all') {
      targetGroups = groups.filter(g => g.isAdmin);
    } else {
      const groupNumber = parseInt(target);
      const group = groups.find(g => g.number === groupNumber);
      if (group && group.isAdmin) {
        targetGroups = [group];
      }
    }

    if (targetGroups.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid admin groups found' 
      });
    }

    const results = [];
    
    for (let group of targetGroups) {
      try {
        await whatsappService.updateGroupSetting(group.id, setting, action);
        results.push({
          groupNumber: group.number,
          groupName: group.name,
          success: true
        });
        
        // Add delay between operations
        if (targetGroups.length > 1) {
          await sleep(randomDelay());
        }
      } catch (error) {
        results.push({
          groupNumber: group.number,
          groupName: group.name,
          success: false,
          error: error.message
        });
      }
    }

    res.json({ 
      success: true, 
      results,
      processed: results.length 
    });
    
  } catch (error) {
    logger.error('Group settings error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Rename group endpoint
router.post('/wa/group/rename', async (req, res) => {
  try {
    const { groupNumber, newName } = req.body;
    
    if (!groupNumber || !newName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Group number and new name are required' 
      });
    }

    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.number === groupNumber);
    
    if (!group) {
      return res.status(404).json({ 
        success: false, 
        message: 'Group not found' 
      });
    }

    if (!group.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not admin in this group' 
      });
    }

    await whatsappService.renameGroup(group.id, newName);
    
    res.json({ 
      success: true, 
      message: `Group renamed to "${newName}"`,
      groupNumber,
      oldName: group.name,
      newName 
    });
    
  } catch (error) {
    logger.error('Rename group error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Update group description endpoint
router.post('/wa/group/description', async (req, res) => {
  try {
    const { groupNumber, description } = req.body;
    
    if (!groupNumber || description === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Group number and description are required' 
      });
    }

    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.number === groupNumber);
    
    if (!group) {
      return res.status(404).json({ 
        success: false, 
        message: 'Group not found' 
      });
    }

    if (!group.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not admin in this group' 
      });
    }

    await whatsappService.updateGroupDescription(group.id, description);
    
    res.json({ 
      success: true, 
      message: 'Group description updated',
      groupNumber,
      groupName: group.name 
    });
    
  } catch (error) {
    logger.error('Update group description error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Update group picture endpoint
router.post('/wa/group/picture', upload.single('image'), async (req, res) => {
  try {
    const { groupNumber, fileUrl, action } = req.body;
    
    if (!groupNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Group number is required' 
      });
    }

    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.number === parseInt(groupNumber));
    
    if (!group) {
      return res.status(404).json({ 
        success: false, 
        message: 'Group not found' 
      });
    }

    if (!group.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not admin in this group' 
      });
    }

    if (action === 'delete') {
      await whatsappService.removeGroupPicture(group.id);
      return res.json({ 
        success: true, 
        message: 'Group picture removed',
        groupNumber,
        groupName: group.name 
      });
    }

    let imageBuffer;
    
    if (req.file) {
      imageBuffer = req.file.buffer;
    } else if (fileUrl) {
      // Download image from URL (for Telegram file)
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      imageBuffer = Buffer.from(response.data);
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Image file or URL is required' 
      });
    }

    await whatsappService.updateGroupPicture(group.id, imageBuffer);
    
    res.json({ 
      success: true, 
      message: 'Group picture updated',
      groupNumber,
      groupName: group.name 
    });
    
  } catch (error) {
    logger.error('Update group picture error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Invite to group endpoint
router.post('/wa/group/invite', async (req, res) => {
  try {
    const { groupNumber, number } = req.body;
    
    if (!groupNumber || !number) {
      return res.status(400).json({ 
        success: false, 
        message: 'Group number and phone number are required' 
      });
    }

    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.number === groupNumber);
    
    if (!group) {
      return res.status(404).json({ 
        success: false, 
        message: 'Group not found' 
      });
    }

    if (!group.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not admin in this group' 
      });
    }

    await whatsappService.inviteToGroup(group.id, number);
    
    res.json({ 
      success: true, 
      message: `Successfully invited ${number} to group`,
      groupNumber,
      groupName: group.name,
      invitedNumber: number 
    });
    
  } catch (error) {
    logger.error('Invite to group error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get group info endpoint
router.get('/wa/group/:groupNumber', async (req, res) => {
  try {
    const groupNumber = parseInt(req.params.groupNumber);
    
    if (!groupNumber || isNaN(groupNumber)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid group number is required' 
      });
    }

    const groups = await whatsappService.getGroups();
    const group = groups.find(g => g.number === groupNumber);
    
    if (!group) {
      return res.status(404).json({ 
        success: false, 
        message: 'Group not found' 
      });
    }

    const groupInfo = await whatsappService.getGroupInfo(group.id);
    
    res.json({ 
      success: true, 
      group: {
        ...groupInfo,
        number: groupNumber
      }
    });
    
  } catch (error) {
    logger.error('Get group info error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Logout endpoint
router.post('/wa/logout', async (req, res) => {
  try {
    await whatsappService.disconnect();
    
    res.json({ 
      success: true, 
      message: 'Successfully logged out' 
    });
    
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;