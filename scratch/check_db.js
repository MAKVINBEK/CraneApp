require('dotenv').config();
const { pool, query } = require('../database/database');

async function check() {
    try {
        console.log('--- USERS ---');
        const users = await query('SELECT id, username, first_name FROM users ORDER BY username');
        console.log(users.rows);

        console.log('--- CHATS ---');
        const chats = await query('SELECT id, type, title, owner_id FROM chats');
        console.log(chats.rows);

        console.log('--- CHAT MEMBERS ---');
        const members = await query(
            `SELECT cm.chat_id, u.username, cm.role 
             FROM chat_members cm 
             JOIN users u ON cm.user_id = u.id`
        );
        console.log(members.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
