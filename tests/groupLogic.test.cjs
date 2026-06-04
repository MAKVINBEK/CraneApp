const assert = require('assert');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { app } = require('../server/gateway/apiGateway');
const { query, pool } = require('../database/database');

const TEST_PORT = 3001;
let serverInstance;

// Helper to sign token
function signToken(userId, username) {
    return jwt.sign({ userId, username }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
}

async function runTests() {
    console.log('🚀 Starting groupLogic integration tests...');

    // 1. Start test server
    serverInstance = app.listen(TEST_PORT, () => {
        console.log(`📡 Test server running on port ${TEST_PORT}`);
    });

    const ownerId = uuidv4();
    const member1Id = uuidv4();
    const member2Id = uuidv4();

    const ownerToken = signToken(ownerId, 'test_owner');
    const member1Token = signToken(member1Id, 'test_member1');
    const member2Token = signToken(member2Id, 'test_member2');

    try {
        // Clean up any leftover test users from previous failed runs
        await query(`DELETE FROM user_settings WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2'))`);
        await query(`DELETE FROM chat_members WHERE user_id IN (SELECT id FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2'))`);
        await query(`DELETE FROM chats WHERE owner_id IN (SELECT id FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2'))`);
        await query(`DELETE FROM users WHERE username IN ('test_owner', 'test_member1', 'test_member2')`);

        // 2. Insert test users
        await query(
            `INSERT INTO users (id, username, password_hash, first_name, is_bot) VALUES 
             ($1, 'test_owner', 'pwd', 'Owner', FALSE),
             ($2, 'test_member1', 'pwd', 'Member1', FALSE),
             ($3, 'test_member2', 'pwd', 'Member2', FALSE)`,
            [ownerId, member1Id, member2Id]
        );

        await query(
            `INSERT INTO user_settings (user_id, settings, privacy_settings) VALUES
             ($1, '{}', '{}'),
             ($2, '{}', '{}'),
             ($3, '{}', '{"groupsAdd": "none"}')`,
            [ownerId, member1Id, member2Id]
        );

        console.log('✅ Test users inserted');

        // 3. Test Group Creation
        const createRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/create-group`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                title: 'Test Group',
                description: 'Test Group Desc',
                members: [member1Id]
            })
        });

        assert.strictEqual(createRes.status, 201, 'Group creation should succeed');
        const createData = await createRes.json();
        const chatId = createData.chatId;
        assert.ok(chatId, 'Should return chatId');
        console.log('✅ Group creation test passed');

        // 4. Test adding a user with "groupsAdd: none" privacy
        const addPrivacyRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ userId: member2Id })
        });

        assert.strictEqual(addPrivacyRes.status, 403, 'Adding user with privacy=none should fail with 403');
        console.log('✅ Privacy validation (none) test passed');

        // 5. Test adding a user with "groupsAdd: contacts" privacy (no DM exists)
        await query(`UPDATE user_settings SET privacy_settings = '{"groupsAdd": "contacts"}' WHERE user_id = $1`, [member2Id]);
        const addPrivacyContactsRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ userId: member2Id })
        });
        assert.strictEqual(addPrivacyContactsRes.status, 403, 'Adding user with privacy=contacts without contact chat should fail');
        console.log('✅ Privacy validation (contacts) test passed');

        // 6. Test successful member addition
        await query(`UPDATE user_settings SET privacy_settings = '{"groupsAdd": "all"}' WHERE user_id = $1`, [member2Id]);
        const addSuccessRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ userId: member2Id })
        });
        assert.strictEqual(addSuccessRes.status, 200, 'Adding user with privacy=all should succeed');
        console.log('✅ Successful member addition test passed');

        // 7. Test kicking member (not by owner -> should fail)
        const kickFailRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members/${member2Id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${member1Token}`
            }
        });
        assert.strictEqual(kickFailRes.status, 403, 'Kicking member by non-owner should return 403');
        console.log('✅ Non-owner kick authorization test passed');

        // 8. Test kicking member (by owner -> should succeed)
        const kickSuccessRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members/${member2Id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${ownerToken}`
            }
        });
        assert.strictEqual(kickSuccessRes.status, 200, 'Kicking member by owner should succeed');
        
        const membersCheck = await query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, member2Id]);
        assert.strictEqual(membersCheck.rows.length, 0, 'Kicked member should be removed from chat_members');
        console.log('✅ Owner kick test passed');

        // 9. Test leaving group (by member)
        const leaveRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${member1Token}`
            }
        });
        assert.strictEqual(leaveRes.status, 200, 'Leaving group by member should succeed');
        const membersCheck2 = await query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, member1Id]);
        assert.strictEqual(membersCheck2.rows.length, 0, 'Left member should be removed from chat_members');
        console.log('✅ Leave group test passed');

        console.log('🎉 All groupLogic integration tests passed successfully!');
    } catch (e) {
        console.error('❌ Tests failed:', e);
        process.exitCode = 1;
    } finally {
        // Clean up DB
        console.log('🧹 Cleaning up database...');
        try {
            await query('DELETE FROM user_settings WHERE user_id IN ($1, $2, $3)', [ownerId, member1Id, member2Id]);
            await query('DELETE FROM chat_members WHERE user_id IN ($1, $2, $3)', [ownerId, member1Id, member2Id]);
            await query('DELETE FROM chats WHERE owner_id = $1', [ownerId]);
            await query('DELETE FROM users WHERE id IN ($1, $2, $3)', [ownerId, member1Id, member2Id]);
            console.log('🧹 Cleanup done');
        } catch (cleanupErr) {
            console.error('⚠️ Cleanup error:', cleanupErr.message);
        }

        // Close server
        if (serverInstance) {
            serverInstance.close(async () => {
                console.log('💤 Test server closed');
                try {
                    await pool.end();
                    console.log('💤 Database connection pool ended');
                } catch (e) {
                    console.error('⚠️ Error ending pool:', e);
                }
                process.exit(process.exitCode || 0);
            });
        } else {
            try {
                await pool.end();
                console.log('💤 Database connection pool ended');
            } catch (e) {}
            process.exit(process.exitCode || 0);
        }
    }
}

runTests();
