require('dotenv').config();
const { pool, query } = require('../database/database');

async function addUsers() {
    try {
        const groupTitle = 'Группа для проверки';
        const chatRes = await query(`SELECT id FROM chats WHERE title = $1 LIMIT 1`, [groupTitle]);
        if (!chatRes.rows.length) {
            console.log('❌ Group chat not found');
            return;
        }
        const chatId = chatRes.rows[0].id;
        console.log(`Found group chat ID: ${chatId}`);

        // Find users to add
        const usersRes = await query(
            `SELECT id, username FROM users WHERE username IN ('matveytcey2012gmailcom', 'admin2282')`
        );
        const users = usersRes.rows;

        for (const u of users) {
            // Check if already in the group
            const checkMember = await query(
                `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
                [chatId, u.id]
            );
            if (checkMember.rows.length > 0) {
                console.log(`ℹ️ User ${u.username} is already a member of the group.`);
            } else {
                await query(
                    `INSERT INTO chat_members (id, chat_id, user_id, role, joined_at) 
                     VALUES (gen_random_uuid(), $1, $2, 'member', NOW())`,
                    [chatId, u.id]
                );
                console.log(`✅ Added user ${u.username} to group.`);
            }
        }
    } catch (e) {
        console.error('❌ Error adding users:', e.message);
    } finally {
        await pool.end();
    }
}

addUsers();
