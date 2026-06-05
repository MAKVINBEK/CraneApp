const assert = require('assert');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { app } = require('../server/gateway/apiGateway');
const { query, pool } = require('../database/database');

const TEST_PORT = 3002;
let serverInstance;

function signToken(userId, username) {
    return jwt.sign({ userId, username }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
}

async function runTests() {
    console.log('🚀 Starting groupTopics integration tests...');

    serverInstance = app.listen(TEST_PORT, () => {
        console.log(`📡 Test server running on port ${TEST_PORT}`);
    });

    const ownerId = uuidv4();
    const memberId = uuidv4();

    const ownerToken = signToken(ownerId, 'topic_owner');
    const memberToken = signToken(memberId, 'topic_member');

    let chatId;
    let topicId;

    try {
        // Clean up any leftover test users
        await query(`DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE owner_id = $1)`, [ownerId]);
        await query(`DELETE FROM chat_topics WHERE chat_id IN (SELECT id FROM chats WHERE owner_id = $1)`, [ownerId]);
        await query(`DELETE FROM chat_members WHERE user_id IN ($1, $2)`, [ownerId, memberId]);
        await query(`DELETE FROM chats WHERE owner_id = $1`, [ownerId]);
        await query(`DELETE FROM users WHERE id IN ($1, $2)`, [ownerId, memberId]);

        // Insert test users
        await query(
            `INSERT INTO users (id, username, password_hash, first_name, is_bot) VALUES 
             ($1, 'topic_owner', 'pwd', 'Owner', FALSE),
             ($2, 'topic_member', 'pwd', 'Member', FALSE)`,
            [ownerId, memberId]
        );

        console.log('✅ Test users inserted');

        // Create Group
        const createRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/create-group`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                title: 'Topics Test Group',
                members: [memberId]
            })
        });

        assert.strictEqual(createRes.status, 201, 'Group creation should succeed');
        const createData = await createRes.json();
        chatId = createData.chatId;
        assert.ok(chatId, 'Should return chatId');
        console.log('✅ Group creation test passed');

        // 1. Upgrade to Supergroup
        const upgradeRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/settings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                isSupergroup: true
            })
        });

        assert.strictEqual(upgradeRes.status, 200, 'Upgrading to supergroup should succeed');
        
        const chatCheck = await query('SELECT is_supergroup FROM chats WHERE id = $1', [chatId]);
        assert.strictEqual(chatCheck.rows[0].is_supergroup, true, 'is_supergroup column should be TRUE in database');
        console.log('✅ Supergroup upgrade test passed');

        // 2. Create Topic
        const createTopicRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/topics`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                title: 'Development discussion',
                iconColor: '#00B0FF',
                iconEmoji: '🛠️'
            })
        });

        assert.strictEqual(createTopicRes.status, 201, 'Topic creation should succeed');
        const topicData = await createTopicRes.json();
        topicId = topicData.topic.id;
        assert.ok(topicId, 'Should return created topic object with id');
        console.log('✅ Topic creation test passed');

        // 3. List Topics (verify General is dynamically present)
        const listTopicsRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/topics`, {
            headers: {
                'Authorization': `Bearer ${ownerToken}`
            }
        });

        assert.strictEqual(listTopicsRes.status, 200);
        const listData = await listTopicsRes.json();
        assert.strictEqual(listData.topics.length, 2, 'Should return 2 topics (General + Development)');
        
        const generalTopic = listData.topics.find(t => t.id === null);
        assert.ok(generalTopic, 'Dynamic General topic should be returned');
        console.log('✅ List topics test passed');

        // 4. Post Message to Topic
        const postRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/messages/${chatId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                content: 'Hello devs!',
                type: 'text',
                topicId: topicId
            })
        });

        assert.strictEqual(postRes.status, 201, 'Posting message to topic should succeed');
        const postData = await postRes.json();
        assert.strictEqual(postData.message.topicId, topicId, 'Returned message should have the correct topicId');
        console.log('✅ Post message to topic test passed');

        // 5. Close Topic
        const closeTopicRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/topics/${topicId}/close`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ownerToken}`
            }
        });

        assert.strictEqual(closeTopicRes.status, 200, 'Closing topic should succeed');
        const topicCheck2 = await query('SELECT is_closed FROM chat_topics WHERE id = $1', [topicId]);
        assert.strictEqual(topicCheck2.rows[0].is_closed, true, 'Topic is_closed should be TRUE in database');
        console.log('✅ Close topic test passed');

        // 6. Try posting to closed topic -> Should fail with 403
        const postClosedRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/messages/${chatId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                content: 'Can I send this?',
                type: 'text',
                topicId: topicId
            })
        });

        assert.strictEqual(postClosedRes.status, 403, 'Posting to a closed topic should fail with 403');
        console.log('✅ Send message to closed topic rejection test passed');

        // 7. Reopen Topic
        const reopenTopicRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/topics/${topicId}/reopen`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ownerToken}`
            }
        });

        assert.strictEqual(reopenTopicRes.status, 200, 'Reopening topic should succeed');
        const topicCheck3 = await query('SELECT is_closed FROM chat_topics WHERE id = $1', [topicId]);
        assert.strictEqual(topicCheck3.rows[0].is_closed, false, 'Topic is_closed should be FALSE in database');
        console.log('✅ Reopen topic test passed');

        // 8. Delete Topic
        const deleteTopicRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/topics/${topicId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${ownerToken}`
            }
        });

        assert.strictEqual(deleteTopicRes.status, 200, 'Deleting topic should succeed');
        const topicCheck4 = await query('SELECT COUNT(*)::int AS cnt FROM chat_topics WHERE id = $1', [topicId]);
        assert.strictEqual(topicCheck4.rows[0].cnt, 0, 'Topic should be removed from database');
        console.log('✅ Delete topic test passed');

        console.log('🎉 All groupTopics integration tests passed successfully!');
    } catch (e) {
        console.error('❌ Tests failed:', e);
        process.exitCode = 1;
    } finally {
        console.log('🧹 Cleaning up database...');
        try {
            if (chatId) {
                await query('DELETE FROM messages WHERE chat_id = $1', [chatId]);
                await query('DELETE FROM chat_topics WHERE chat_id = $1', [chatId]);
                await query('DELETE FROM chat_members WHERE chat_id = $1', [chatId]);
                await query('DELETE FROM chats WHERE id = $1', [chatId]);
            }
            await query('DELETE FROM users WHERE id IN ($1, $2)', [ownerId, memberId]);
            console.log('🧹 Cleanup done');
        } catch (cleanupErr) {
            console.error('⚠️ Cleanup error:', cleanupErr.message);
        }

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
