const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/authMiddleware');
const chatService = require('./chatService');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const chats = await chatService.getUserChats(req.user.id);
        res.status(200).json({ success: true, chats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:chatId/members', authMiddleware, async (req, res) => {
    try {
        const members = await chatService.getChatMembers(req.params.chatId);
        res.status(200).json({ success: true, members });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;