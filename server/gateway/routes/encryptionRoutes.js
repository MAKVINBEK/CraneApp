const express = require('express');

function createEncryptionRoutes({ authMiddleware, logger, query, uuidv4 }) {
    const router = express.Router();

    router.use(authMiddleware);

    router.post('/keys', async (req, res) => {
        try {
            const { publicKey, keyId } = req.body;
            if (!publicKey || !keyId) return res.status(400).json({ error: 'publicKey and keyId required' });

            await query(`
                INSERT INTO user_public_keys (user_id, public_key, key_id, created_at, updated_at)
                VALUES ($1, $2, $3, NOW(), NOW())
                ON CONFLICT (user_id) DO UPDATE SET public_key = $2, key_id = $3, updated_at = NOW()
            `, [req.user.id, publicKey, keyId]);

            res.json({ ok: true });
        } catch (error) {
            logger.error('❌ Upload key error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/keys/:userId', async (req, res) => {
        try {
            const result = await query(
                'SELECT public_key, key_id FROM user_public_keys WHERE user_id = $1',
                [req.params.userId]
            );
            if (!result.rows.length) return res.status(404).json({ error: 'Key not found' });
            res.json(result.rows[0]);
        } catch (_) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/chat-keys/:chatId', async (req, res) => {
        try {
            if (!(await isChatMember(query, req.params.chatId, req.user.id))) {
                return res.status(403).json({ error: req.t('accessDenied') });
            }
            const result = await query(`
                SELECT upk.user_id, upk.public_key, upk.key_id
                FROM chat_members cm
                JOIN user_public_keys upk ON cm.user_id = upk.user_id
                WHERE cm.chat_id = $1
            `, [req.params.chatId]);
            res.json({ keys: result.rows });
        } catch (_) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.post('/chat-keys/:chatId', async (req, res) => {
        try {
            const { encryptedKeys } = req.body;
            if (!Array.isArray(encryptedKeys)) return res.status(400).json({ error: 'encryptedKeys array required' });
            if (!(await isChatMember(query, req.params.chatId, req.user.id))) {
                return res.status(403).json({ error: req.t('accessDenied') });
            }

            for (const { userId, encryptedKey, senderKeyId } of encryptedKeys) {
                await query(`
                    INSERT INTO chat_encryption_keys (id, chat_id, user_id, encrypted_key, sender_key_id, created_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (chat_id, user_id) DO UPDATE SET encrypted_key = $4, sender_key_id = $5
                `, [uuidv4(), req.params.chatId, userId, encryptedKey, senderKeyId]);
            }
            res.json({ ok: true });
        } catch (error) {
            logger.error('❌ Save chat key error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/my-key/:chatId', async (req, res) => {
        try {
            const result = await query(
                'SELECT encrypted_key, sender_key_id FROM chat_encryption_keys WHERE chat_id = $1 AND user_id = $2',
                [req.params.chatId, req.user.id]
            );
            if (!result.rows.length) return res.status(404).json({ error: 'No key found' });
            res.json(result.rows[0]);
        } catch (_) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    return router;
}

function isChatMember(query, chatId, userId) {
    return query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId])
        .then((result) => result.rows.length > 0);
}

module.exports = createEncryptionRoutes;
