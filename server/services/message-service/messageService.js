const { query } = require('../../../database/database');
const { v4: uuidv4 } = require('uuid');

async function sendMessage(chatId, senderId, content, type = 'text') {
    const messageId = uuidv4();
    await query(
        `INSERT INTO messages (id, chat_id, sender_id, content, type, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [messageId, chatId, senderId, content, type]
    );
    await query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [chatId]);
    return { messageId, chatId, senderId, content, type, createdAt: new Date() };
}

async function getMessages(chatId, limit = 50) {
    const result = await query(
        `SELECT m.*, u.username as sender_username, u.first_name as sender_first_name
         FROM messages m
         LEFT JOIN users u ON m.sender_id = u.id
         WHERE m.chat_id = $1 AND m.is_deleted = FALSE
         ORDER BY m.created_at DESC
         LIMIT $2`,
        [chatId, limit]
    );
    return result.rows.reverse();
}

module.exports = { sendMessage, getMessages };