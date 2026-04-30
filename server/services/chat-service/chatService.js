const { query } = require('../../../database/database');
const { v4: uuidv4 } = require('uuid');

async function getUserChats(userId) {
    const result = await query(
        `SELECT c.*, cm.role,
                (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.is_deleted = FALSE) as message_count,
                (SELECT MAX(created_at) FROM messages m WHERE m.chat_id = c.id) as last_message_at
         FROM chats c
         JOIN chat_members cm ON c.id = cm.chat_id
         WHERE cm.user_id = $1
         ORDER BY last_message_at DESC NULLS LAST`,
        [userId]
    );
    return result.rows;
}

async function getChatMembers(chatId) {
    const result = await query(
        `SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, cm.role
         FROM chat_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.chat_id = $1`,
        [chatId]
    );
    return result.rows;
}

module.exports = { getUserChats, getChatMembers };