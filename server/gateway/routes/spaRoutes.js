const express = require('express');
const path = require('path');

function createSpaRoutes({ distDir }) {
    const router = express.Router();
    const desktopHtml = path.join(distDir, 'index.html');
    const mobileHtml = path.join(distDir, 'mobile.html');

    router.get('/', (_req, res) => res.sendFile(desktopHtml));
    router.get(['/login', '/register', '/chats', '/chats/:chatId', '/rate-limit', '/settings', '/contacts', '/create-group'], (_req, res) => {
        res.sendFile(desktopHtml);
    });
    router.get(['/mobile', '/mobile/*'], (_req, res) => {
        res.sendFile(mobileHtml);
    });

    return router;
}

module.exports = createSpaRoutes;
