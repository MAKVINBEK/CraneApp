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
    console.log('🚀 Starting groupModeration integration tests...');

    serverInstance = app.listen(TEST_PORT, () => {
        console.log(`📡 Test server running on port ${TEST_PORT}`);
    });

    const ownerId = uuidv4();
    const adminId = uuidv4();
    const memberId = uuidv4();
    const strangerId = uuidv4();
    const applicantId = uuidv4();

    const ownerToken = signToken(ownerId, 'mod_owner');
    const adminToken = signToken(adminId, 'mod_admin');
    const memberToken = signToken(memberId, 'mod_member');
    const strangerToken = signToken(strangerId, 'mod_stranger');
    const applicantToken = signToken(applicantId, 'mod_applicant');

    let chatId;

    try {
        // Cleanup leftover
        await query(`DELETE FROM user_settings WHERE user_id IN (SELECT id FROM users WHERE username IN ('mod_owner', 'mod_admin', 'mod_member', 'mod_stranger', 'mod_applicant'))`);
        await query(`DELETE FROM chat_members WHERE user_id IN (SELECT id FROM users WHERE username IN ('mod_owner', 'mod_admin', 'mod_member', 'mod_stranger', 'mod_applicant'))`);
        await query(`DELETE FROM chat_bans WHERE user_id IN (SELECT id FROM users WHERE username IN ('mod_owner', 'mod_admin', 'mod_member', 'mod_stranger', 'mod_applicant'))`);
        await query(`DELETE FROM chats WHERE owner_id IN (SELECT id FROM users WHERE username IN ('mod_owner', 'mod_admin', 'mod_member', 'mod_stranger', 'mod_applicant'))`);
        await query(`DELETE FROM users WHERE username IN ('mod_owner', 'mod_admin', 'mod_member', 'mod_stranger', 'mod_applicant')`);

        // Insert test users
        await query(
            `INSERT INTO users (id, username, password_hash, first_name, is_bot) VALUES 
             ($1, 'mod_owner', 'pwd', 'Owner', FALSE),
             ($2, 'mod_admin', 'pwd', 'Admin', FALSE),
             ($3, 'mod_member', 'pwd', 'Member', FALSE)`,
            [ownerId, adminId, memberId]
        );

        await query(
            `INSERT INTO user_settings (user_id, settings, privacy_settings) VALUES
             ($1, '{}', '{}'),
             ($2, '{}', '{}'),
             ($3, '{}', '{}')`,
            [ownerId, adminId, memberId]
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
                title: 'Moderation Group',
                description: 'Group for testing moderation',
                members: [adminId, memberId]
            })
        });

        assert.strictEqual(createRes.status, 201);
        const createData = await createRes.json();
        chatId = createData.chatId;
        console.log('✅ Group created:', chatId);

        // 1. Promote member to admin with permissions
        const promoteRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members/${adminId}/role`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({
                newRole: 'admin',
                permissions: {
                    can_change_info: true,
                    can_delete_messages: true,
                    can_ban_users: true,
                    can_invite_users: true,
                    can_pin_messages: true
                }
            })
        });

        assert.strictEqual(promoteRes.status, 200, 'Promote to admin should succeed');
        
        const adminCheck = await query('SELECT role, permissions FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, adminId]);
        assert.strictEqual(adminCheck.rows[0].role, 'admin');
        assert.strictEqual(adminCheck.rows[0].permissions.can_ban_users, true);
        console.log('✅ Admin promotion test passed');

        // 2. Mute member inside group (by Admin)
        const muteRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members/${memberId}/mute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                duration: 3600,
                reason: 'Spamming'
            })
        });
        assert.strictEqual(muteRes.status, 200, 'Muting member by admin should succeed');
        
        const muteCheck = await query('SELECT muted_until FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
        assert.ok(muteCheck.rows[0].muted_until, 'Muted until should be set');
        console.log('✅ Muting member test passed');

        // 3. Verify muted user cannot send messages
        const sendMsgRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/messages/${chatId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${memberToken}`
            },
            body: JSON.stringify({ content: 'Hello!' })
        });
        assert.strictEqual(sendMsgRes.status, 403, 'Muted user should be blocked from sending messages');
        console.log('✅ Muted user blocked test passed');

        // 4. Unmute member inside group (by Owner)
        const unmuteRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members/${memberId}/unmute`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ownerToken}`
            }
        });
        assert.strictEqual(unmuteRes.status, 200);
        const unmuteCheck = await query('SELECT muted_until FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
        assert.strictEqual(unmuteCheck.rows[0].muted_until, null, 'Muted until should be cleared');
        console.log('✅ Unmuting member test passed');

        // 5. Send message (should succeed after unmute)
        const sendMsgRes2 = await fetch(`http://localhost:${TEST_PORT}/api/v1/messages/${chatId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${memberToken}`
            },
            body: JSON.stringify({ content: 'Hello again!' })
        });
        assert.strictEqual(sendMsgRes2.status, 201, 'Sending message should succeed after unmute');
        const msgData = await sendMsgRes2.json();
        const messageId = msgData.message.id;
        console.log('✅ Message sending after unmute test passed');

        // 6. Admin pins message
        const pinRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/messages/${messageId}/pin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        assert.strictEqual(pinRes.status, 200, 'Admin should be able to pin message');
        console.log('✅ Pinning message by admin test passed');

        // 7. Admin deletes member's message for everyone
        const deleteRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/messages/${messageId}?forEveryone=true`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        assert.strictEqual(deleteRes.status, 200, 'Admin should be able to delete message for everyone');
        console.log('✅ Deleting message by admin test passed');

        // 8. Ban member inside group (by Admin)
        const banRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members/${memberId}/ban`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                duration: 86400,
                reason: 'Bad behavior'
            })
        });
        assert.strictEqual(banRes.status, 200, 'Banning member by admin should succeed');
        
        const banCheck = await query('SELECT 1 FROM chat_bans WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
        assert.strictEqual(banCheck.rows.length, 1, 'Ban record should exist');
        
        const memberCheck = await query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
        assert.strictEqual(memberCheck.rows.length, 0, 'Banned member should be deleted from chat_members');
        console.log('✅ Banning member test passed');

        // 9. Re-inviting banned member should fail
        const inviteRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ userId: memberId })
        });
        assert.strictEqual(inviteRes.status, 400, 'Should not be able to invite banned member');
        console.log('✅ Re-invite blocked test passed');

        // 10. Unban member (by Admin)
        const unbanRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members/${memberId}/unban`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        assert.strictEqual(unbanRes.status, 200, 'Unbanning by admin should succeed');
        const banCheck2 = await query('SELECT 1 FROM chat_bans WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
        assert.strictEqual(banCheck2.rows.length, 0, 'Ban record should be removed');
        console.log('✅ Unbanning member test passed');

        // 11. Re-inviting member should succeed now
        const inviteRes2 = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ userId: memberId })
        });
        assert.strictEqual(inviteRes2.status, 200, 'Should be able to invite member after unban');
        console.log('✅ Re-invite success after unban test passed');

        // 12. Slow Mode test
        console.log('⏳ Running Slow Mode tests...');
        await query('UPDATE chats SET slow_mode_seconds = 5 WHERE id = $1', [chatId]);
        
        const slowMsg1 = await fetch(`http://localhost:${TEST_PORT}/api/v1/messages/${chatId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${memberToken}`
            },
            body: JSON.stringify({ content: 'Slow message 1' })
        });
        assert.strictEqual(slowMsg1.status, 201, 'First message in slow mode should succeed');

        const slowMsg2 = await fetch(`http://localhost:${TEST_PORT}/api/v1/messages/${chatId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${memberToken}`
            },
            body: JSON.stringify({ content: 'Slow message 2' })
        });
        assert.strictEqual(slowMsg2.status, 429, 'Second message immediately should be rate limited');
        const rateLimitData = await slowMsg2.json();
        assert.ok(rateLimitData.retryAfter > 0, 'retryAfter should be returned');
        console.log('✅ Slow Mode rate limiting test passed');

        // 13. Invite Links tests
        console.log('🔗 Running Invite Links tests...');
        const createLinkRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/invite-links`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ requestToJoin: false, usageLimit: 5 })
        });
        assert.strictEqual(createLinkRes.status, 201);
        const linkData = await createLinkRes.json();
        const inviteCode = linkData.inviteLink.link_code;
        const linkId = linkData.inviteLink.id;
        assert.ok(inviteCode, 'Invite code should be generated');
        console.log('✅ Invite link creation test passed');

        const getLinksRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/invite-links`, {
            headers: { 'Authorization': `Bearer ${ownerToken}` }
        });
        assert.strictEqual(getLinksRes.status, 200);
        const listData = await getLinksRes.json();
        assert.ok(listData.inviteLinks.length > 0, 'Invite links list should not be empty');
        console.log('✅ Retrieve invite links test passed');

        await query(`INSERT INTO users (id, username, password_hash, first_name) VALUES ($1, 'mod_stranger', 'pwd', 'Stranger')`, [strangerId]);
        await query(`INSERT INTO user_settings (user_id, settings) VALUES ($1, '{}')`, [strangerId]);

        const joinLinkRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/join-link/${inviteCode}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${strangerToken}` }
        });
        assert.strictEqual(joinLinkRes.status, 200);
        const joinLinkData = await joinLinkRes.json();
        assert.strictEqual(joinLinkData.joined, true, 'User should directly join the group');

        const memberCountRes = await query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, strangerId]);
        assert.strictEqual(memberCountRes.rows.length, 1, 'Stranger should be in chat members');
        console.log('✅ Join via link test passed');

        // 14. Join Requests (Approval flow) tests
        console.log('📝 Running Join Requests tests...');
        const createApprovalLinkRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/invite-links`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ownerToken}`
            },
            body: JSON.stringify({ requestToJoin: true })
        });
        assert.strictEqual(createApprovalLinkRes.status, 201);
        const approvalLinkData = await createApprovalLinkRes.json();
        const approvalCode = approvalLinkData.inviteLink.link_code;

        await query(`INSERT INTO users (id, username, password_hash, first_name) VALUES ($1, 'mod_applicant', 'pwd', 'Applicant')`, [applicantId]);
        await query(`INSERT INTO user_settings (user_id, settings) VALUES ($1, '{}')`, [applicantId]);

        const joinReqRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/join-link/${approvalCode}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${applicantToken}` }
        });
        assert.strictEqual(joinReqRes.status, 200);
        const joinReqData = await joinReqRes.json();
        assert.strictEqual(joinReqData.approvalRequired, true, 'Approval should be required');

        const getReqsRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/join-requests`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(getReqsRes.status, 200);
        const reqsData = await getReqsRes.json();
        assert.ok(reqsData.joinRequests.length > 0, 'Pending requests should not be empty');
        const requestId = reqsData.joinRequests[0].id;

        const approveRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/join-requests/${requestId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(approveRes.status, 200);

        const applicantMemberRes = await query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, applicantId]);
        assert.strictEqual(applicantMemberRes.rows.length, 1, 'Applicant should be a member now');
        console.log('✅ Join request approval test passed');

        // 15. Revoke Invite Link test
        console.log('🗑️ Running Revoke Invite Link tests...');
        const revokeRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/${chatId}/invite-links/${linkId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${ownerToken}` }
        });
        assert.strictEqual(revokeRes.status, 200, 'Revoking invite link should succeed');
        
        const useRevokedRes = await fetch(`http://localhost:${TEST_PORT}/api/v1/chats/join-link/${inviteCode}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${strangerToken}` }
        });
        assert.strictEqual(useRevokedRes.status, 404, 'Using revoked link should fail with 404');
        console.log('✅ Revoking invite link test passed');

        console.log('🎉 All groupModeration integration tests passed successfully!');
    } catch (e) {
        console.error('❌ Tests failed:', e);
        process.exitCode = 1;
    } finally {
        console.log('🧹 Cleaning up database...');
        try {
            await query('DELETE FROM user_settings WHERE user_id IN ($1, $2, $3, $4, $5)', [ownerId, adminId, memberId, strangerId, applicantId]);
            await query('DELETE FROM chat_members WHERE user_id IN ($1, $2, $3, $4, $5)', [ownerId, adminId, memberId, strangerId, applicantId]);
            await query('DELETE FROM chat_bans WHERE user_id IN ($1, $2, $3, $4, $5)', [ownerId, adminId, memberId, strangerId, applicantId]);
            await query('DELETE FROM chats WHERE owner_id = $1', [ownerId]);
            await query('DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5)', [ownerId, adminId, memberId, strangerId, applicantId]);
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
