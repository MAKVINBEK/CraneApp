const express = require('express');

function createMediaRoutes({ authMiddleware, logger, query, uploadLimiter, uuidv4 }) {
    const router = express.Router();

    router.post('/upload', uploadLimiter, authMiddleware, async (req, res) => {
        try {
            const { file } = req.body;

            if (!file) {
                return res.status(400).json({ error: 'File required' });
            }

            const mediaId = uuidv4();
            const mimeMatch = file.match(/^data:([^;]+);base64,/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
            const base64Data = file.replace(/^data:[^;]+;base64,/, '');
            const sizeBytes = Math.round(base64Data.length * 0.75);

            await query(
                `INSERT INTO media_files (id, user_id, data, mime_type, size_bytes, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [mediaId, req.user.id, file, mimeType, sizeBytes]
            );

            logger.info('✅ Media stored in DB:', mediaId, mimeType, `${Math.round(sizeBytes / 1024)}KB`);
            return res.json({ success: true, url: `/api/v1/media/${mediaId}` });
        } catch (error) {
            logger.error('❌ Upload error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/media/:mediaId', async (req, res) => {
        try {
            const result = await query(
                'SELECT data, mime_type FROM media_files WHERE id = $1',
                [req.params.mediaId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Media not found' });
            }

            const { data, mime_type } = result.rows[0];
            const base64 = data.replace(/^data:[^;]+;base64,/, '');
            const buffer = Buffer.from(base64, 'base64');

            res.setHeader('Content-Type', mime_type || 'application/octet-stream');
            res.setHeader('Content-Length', buffer.length);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.send(buffer);
        } catch (error) {
            logger.error('❌ Media serve error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

module.exports = createMediaRoutes;
