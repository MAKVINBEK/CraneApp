require('dotenv').config();
const { pool, query } = require('../database/database');
const { v4: uuidv4 } = require('uuid');

async function setup() {
    console.log('🧹 Cleaning up old test users and groups...');
    try {
        // Clean up chats where test users were owners
        await query(`DELETE FROM user_chat_settings WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2'))`);
        await query(`DELETE FROM chat_members WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2'))`);
        await query(`DELETE FROM contacts WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2')) OR contact_user_id IN (SELECT id FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2'))`);
        
        // Find chat IDs for group chats owned by test users to delete their messages
        const chatsToDelete = await query(`SELECT id FROM chats WHERE owner_id IN (SELECT id FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2'))`);
        const chatIds = chatsToDelete.rows.map(r => r.id);
        if (chatIds.length > 0) {
            await query(`DELETE FROM messages WHERE chat_id = ANY($1)`, [chatIds]);
            await query(`DELETE FROM chat_members WHERE chat_id = ANY($1)`, [chatIds]);
            await query(`DELETE FROM chats WHERE id = ANY($1)`, [chatIds]);
        }
        
        await query(`DELETE FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2')`);
        console.log('✅ Cleaned database');

        const users = [
            { username: 'test_owner', firstName: 'Owner', password: 'password123' },
            { username: 'test_member1', firstName: 'Member1', password: 'password123' },
            { username: 'test_member2', firstName: 'Member2', password: 'password123' }
        ];

        console.log('👤 Registering test users...');
        const registeredUsers = [];
        for (const u of users) {
            const res = await fetch('http://localhost:3000/api/v1/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(u)
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Failed to register ${u.username}: ${text}`);
            }
            const data = await res.json();
            console.log(`✅ Registered ${u.username}`);
            registeredUsers.push(data.user);
        }

        const owner = registeredUsers[0];
        const m1 = registeredUsers[1];
        const m2 = registeredUsers[2];

        console.log('🤝 Creating mutual contact relations...');
        await query(
            `INSERT INTO contacts (id, user_id, contact_user_id, name, is_blocked) VALUES 
             (gen_random_uuid(), $1, $2, 'Member 1', FALSE),
             (gen_random_uuid(), $2, $1, 'Owner User', FALSE),
             (gen_random_uuid(), $1, $3, 'Member 2', FALSE),
             (gen_random_uuid(), $3, $1, 'Owner User', FALSE)`,
            [owner.id, m1.id, m2.id]
        );
        console.log('✅ Mutual contacts created');

        console.log('🔒 Configuring user privacy settings...');
        // Set test_member1 privacy to 'contacts'
        await query(
            `UPDATE user_settings SET privacy_settings = jsonb_set(privacy_settings, '{groupsAdd}', '"contacts"') WHERE user_id = $1`,
            [m1.id]
        );
        // Set test_member2 privacy to 'none'
        await query(
            `UPDATE user_settings SET privacy_settings = jsonb_set(privacy_settings, '{groupsAdd}', '"none"') WHERE user_id = $1`,
            [m2.id]
        );
        console.log('✅ Privacy settings configured');

        console.log('👥 Creating group chat programmatically...');
        const chatId = uuidv4();
        const groupTitle = 'Группа для проверки';
        const groupDesc = 'Эта группа создана автоматически для проверки функций добавления, удаления и выхода участников.';
        
        // 1. Create chat
        await query(
            `INSERT INTO chats (id, type, title, description, owner_id, created_at)
             VALUES ($1, 'group', $2, $3, $4, NOW())`,
            [chatId, groupTitle, groupDesc, owner.id]
        );
        
        // 2. Add members directly
        await query(
            `INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES 
             ($1, $2, 'owner', NOW()),
             ($1, $3, 'member', NOW()),
             ($1, $4, 'member', NOW())`,
            [chatId, owner.id, m1.id, m2.id]
        );

        // 3. Insert system message
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : owner.id;
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) 
             VALUES ($1, $2, $3, $4, NOW())`,
            [uuidv4(), chatId, systemSenderId, `Группа "${groupTitle}" создана`]
        );

        // 4. Insert welcome message from owner
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) 
             VALUES ($1, $2, $3, $4, NOW() + interval '1 second')`,
            [uuidv4(), chatId, owner.id, 'Всем привет! Проверяем логику группы.']
        );

        console.log(`✅ Pre-populated group "${groupTitle}" created containing all test users!`);

        console.log('\n🎉 Setup complete! Use the following credentials to test:');
        console.log('---------------------------------------------------------');
        console.log('1. Owner (Group Creator)');
        console.log('   Username: test_owner');
        console.log('   Password: password123');
        console.log('---------------------------------------------------------');
        console.log('2. Member 1 (Contacts Privacy)');
        console.log('   Username: test_member1');
        console.log('   Password: password123');
        console.log('---------------------------------------------------------');
        console.log('3. Member 2 (None/Disabled Privacy)');
        console.log('   Username: test_member2');
        console.log('   Password: password123');
        console.log('---------------------------------------------------------');

    } catch (e) {
        console.error('❌ Setup failed:', e.message);
    } finally {
        await pool.end();
    }
}

setup();
