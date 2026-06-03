require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('../services/logger');
const { pool, query, initDatabase, ensureTablesExist } = require('../../database/database');
const security = require('../middleware/security');
const i18n = require('../i18n');
const QRCode = require('qrcode');
const callRoom = require('../services/call-service/callRoom');
const createAuthAccountRoutes = require('./routes/authAccountRoutes');
const createAuthPrimaryRoutes = require('./routes/authPrimaryRoutes');
const createBlockedUserRoutes = require('./routes/blockedUserRoutes');
const createCallRoutes = require('./routes/callRoutes');
const createGifRoutes = require('./routes/gifRoutes');
const createChatReadRoutes = require('./routes/chatReadRoutes');
const createChatWriteRoutes = require('./routes/chatWriteRoutes');
const createEmojiRoutes = require('./routes/emojiRoutes');
const createEncryptionRoutes = require('./routes/encryptionRoutes');
const createHealthRoutes = require('./routes/healthRoutes');
const createMediaRoutes = require('./routes/mediaRoutes');
const createMessageReadRoutes = require('./routes/messageReadRoutes');
const createMessageSocialRoutes = require('./routes/messageSocialRoutes');
const createMessageWriteRoutes = require('./routes/messageWriteRoutes');
const createStickerRoutes = require('./routes/stickerRoutes');
const createSupportRoutes = require('./routes/supportRoutes');
const createUserProfileRoutes = require('./routes/userProfileRoutes');
const createUserSettingsRoutes = require('./routes/userSettingsRoutes');
const createUserDeviceRoutes = require('./routes/userDeviceRoutes');
const createUserPreferenceRoutes = require('./routes/userPreferenceRoutes');
const createUserStorageRoutes = require('./routes/userStorageRoutes');
const createUserPasscodeRoutes = require('./routes/userPasscodeRoutes');
const createUserExportRoutes = require('./routes/userExportRoutes');
const createReportRoutes = require('./routes/reportRoutes');
const createModerationRoutes = require('./routes/moderationRoutes');
const createLoginNotificationService = require('./services/loginNotificationService');
const createGatewayStartupMigrations = require('./services/gatewayStartupMigrations');
const createRealtimeGateway = require('./services/realtimeGateway');
const createCraneAppBotService = require('./services/craneAppBotService');
const createAuthMiddleware = require('./middleware/authMiddleware');
const createTrafficProtectionMiddleware = require('./middleware/trafficProtectionMiddleware');
const createGatewayRateLimiters = require('./middleware/rateLimiterMiddleware');
const { createErrorHandler, notFoundHandler } = require('./middleware/errorHandlers');

const MAX_LOGIN_ATTEMPTS = 5; // синхронизировано с security.js

// Список разработчиков
const DEVELOPERS = new Set(['adm1', 'admin', 'admin1', 'qzlfee']);
function isDeveloper(username) {
    return DEVELOPERS.has((username || '').toLowerCase());
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

global.wss = wss;

// ============================================
// ANTI-DDOS & SECURITY
// ============================================

// Helmet — базовые HTTP-заголовки безопасности
app.use(helmet({
    contentSecurityPolicy: false, // отключаем CSP чтобы не ломать клиент
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'sameorigin' } // разрешаем iframe с того же домена (для встроенного звонка)
}));

const trafficProtection = createTrafficProtectionMiddleware({ i18n, logger });
const {
    bodySizeMiddleware,
    floodDetectionMiddleware,
    ipBlockMiddleware,
    suspiciousUAMiddleware,
    wsConnections,
} = trafficProtection;
const { apiLimiter, authLimiter, globalLimiter, uploadLimiter } = createGatewayRateLimiters({
    i18n,
    logger,
    rateLimit,
    trafficProtection,
});

// Применяем middleware в правильном порядке
app.use(ipBlockMiddleware);
app.use(floodDetectionMiddleware);
app.use(suspiciousUAMiddleware);
app.use(bodySizeMiddleware);
app.use(globalLimiter);
// Security middleware
app.use(security.securityHeadersMiddleware);
app.use(security.suspiciousIPMiddleware);
app.use(security.pathTraversalMiddleware);
app.use(security.paramPollutionMiddleware);
app.use(security.xssMiddleware);
app.use(security.tokenRevocationMiddleware);
app.use(security.validateContentType);

// ============================================
// UPLOAD DIRECTORY
// ============================================
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const mediaDir = path.join(uploadsDir, 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}

const stickersDir = path.join(uploadsDir, 'stickers');
if (!fs.existsSync(stickersDir)) {
    fs.mkdirSync(stickersDir, { recursive: true });
}

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Crane-Language']
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(i18n.middleware({ query, jwt, secret: process.env.JWT_SECRET }));
app.use(security.massAssignmentMiddleware);
app.use(security.sqlInjectionMiddleware);

// Применяем API лимит ко всем /api/ роутам
app.use('/api/', apiLimiter);

// call.html разрешаем встраивать в iframe с того же домена (CSP frame-ancestors имеет приоритет над X-Frame-Options в браузерах)
app.use('/client/mobile/screens/calls/call.html', (req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    next();
});

app.use('/client', express.static(path.join(__dirname, '../../client')));
app.use('/uploads', express.static(uploadsDir, {
    setHeaders: (res, filePath) => {
        if (/\.(webm|ogg|m4a|mp3)$/i.test(filePath)) {
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
}));
app.use(express.static(path.join(__dirname, '../../public')));

// Simple file upload handler
function handleFileUpload(base64Data, type, subDir = 'media') {
    const dir = subDir === 'stickers' ? stickersDir : mediaDir;
    
    let ext = 'jpg';
    if (base64Data.startsWith('data:image/png')) ext = 'png';
    else if (base64Data.startsWith('data:image/gif')) ext = 'gif';
    else if (base64Data.startsWith('data:video/')) ext = 'mp4';
    else if (base64Data.startsWith('data:image/webp')) ext = 'webp';
    else if (base64Data.startsWith('data:audio/webm')) ext = 'webm';
    else if (base64Data.startsWith('data:audio/ogg')) ext = 'ogg';
    else if (base64Data.startsWith('data:audio/mp4')) ext = 'm4a';
    else if (base64Data.startsWith('data:audio/mpeg')) ext = 'mp3';
    else if (base64Data.startsWith('data:audio/')) ext = 'webm';
    
    const filename = uuidv4() + '.' + ext;
    const filepath = path.join(dir, filename);
    
    // Remove data URL prefix
    const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');
    
    fs.writeFileSync(filepath, buffer);
    
    return `/uploads/${subDir}/${filename}`;
}

// ============================================
// ГЛАВНАЯ СТРАНИЦА
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// ============================================
// VIDEO CALLS — REST ENDPOINTS
// ============================================

// Конфиг ICE-серверов: STUN + TURN (Metered или ручные ENV)
let _cachedIceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
];

async function _refreshMeteredTurn() {
    const servers = await fetchTurnCredentials();
    if (Array.isArray(servers) && servers.length > 0) {
        _cachedIceServers = servers;
        logger.info(`📡 TURN credentials refreshed from Metered (${servers.length} servers)`);
    }
}

async function fetchTurnCredentials() {
    const apiKey = process.env.METERED_API_KEY;
    const domain = process.env.METERED_DOMAIN;
    if (!apiKey || !domain) return null;

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000); // таймаут 8 сек

    try {
        const res = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`, { signal: ctrl.signal });
        clearTimeout(tid);
        const body = await res.text();

        if (!res.ok) {
            return { status: res.status, ok: false, body: body.slice(0, 500) };
        }

        try {
            return JSON.parse(body);
        } catch (_) {
            return { status: res.status, ok: true, body: body.slice(0, 500) };
        }
    } catch (error) {
        clearTimeout(tid);
        logger.warn('TURN refresh failed:', error.message);
        return { error: error.message };
    }
}

// Обновляем при старте (с задержкой 3с чтобы не мешать запуску) и каждые 12 часов
setTimeout(_refreshMeteredTurn, 3000);
setInterval(_refreshMeteredTurn, 12 * 60 * 60 * 1000);

function getIceServers() {
    const ice = [..._cachedIceServers];
    // Ручные TURN через ENV (если Metered не используется)
    if (!process.env.METERED_API_KEY && process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
        ice.push({
            urls: process.env.TURN_URL,
            username: process.env.TURN_USERNAME,
            credential: process.env.TURN_CREDENTIAL
        });
    }
    return ice;
}

// Простая JWT-проверка из Authorization (без middleware-цепочки)
async function authFromHeader(req) {
    try {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) return null;
        const token = auth.slice(7);
        if (!process.env.JWT_SECRET) return null;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded;
    } catch (_) { return null; }
}

// Сохранить системное сообщение о завершённом звонке
async function saveCallMessage(r) {
    if (!r || !r.closed || !r.chatId) return;
    try {
        const status = r.answeredAt ? 'answered' : 'missed';
        const duration = r.answeredAt ? Math.floor((Date.now() - r.answeredAt) / 1000) : 0;
        const content = JSON.stringify({ callKind: r.callKind || 'video', status, duration, initiatorId: r.hostId });
        const msgId = uuidv4();
        const result = await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, type, created_at)
             VALUES ($1, $2, $3, $4, 'call', NOW()) RETURNING *`,
            [msgId, r.chatId, r.hostId, content]
        );
        const msg = result.rows[0];
        if (msg) {
            broadcastToChat(r.chatId, {
                type: 'new_message',
                chatId: r.chatId,
                chatType: 'private',
                message: { ...msg, type: 'call' }
            }, null);
        }
    } catch (e) {
        logger.warn('⚠️ saveCallMessage error:', e.message);
    }
}

app.use('/api/v1/calls', createCallRoutes({
    authFromHeader,
    callRoom,
    fetchTurnCredentials,
    getIceServers,
}));

const authMiddleware = createAuthMiddleware({ i18n, jwt, logger, query });

const realtimeGateway = createRealtimeGateway({
    callRoom,
    logger,
    query,
    saveCallMessage,
    WebSocket,
    WS_CONNECTIONS: wsConnections,
    wss,
});
const { broadcastToChat, sendToCallRoom, sendToUser } = realtimeGateway;

const botService = createCraneAppBotService({
    bcrypt,
    broadcastToChat,
    DEVELOPERS,
    i18n,
    isDeveloper,
    logger,
    query,
    security,
    uuidv4,
});
const { createCraneAppBotChat, handleBotCommand } = botService;

// ============================================
// AUTO MIGRATE
// ============================================

const startupMigrations = createGatewayStartupMigrations({
    createCraneAppBotChat,
    logger,
    query,
});

const loginNotifications = createLoginNotificationService({
    i18n,
    logger,
    query,
    uuidv4,
    WebSocket,
    wss,
});

app.use('/api/v1/auth', createAuthPrimaryRoutes({
    authLimiter,
    bcrypt,
    createCraneAppBotChat,
    i18n,
    isDeveloper,
    jwt,
    logger,
    loginNotifications,
    maxLoginAttempts: MAX_LOGIN_ATTEMPTS,
    query,
    security,
    uuidv4,
}));

app.use('/api/v1/auth', createAuthAccountRoutes({
    authMiddleware,
    bcrypt,
    i18n,
    jwt,
    logger,
    QRCode,
    query,
    security,
    uuidv4,
}));

app.use('/api/v1', createMediaRoutes({
    authMiddleware,
    logger,
    query,
    uploadLimiter,
    uuidv4,
}));

app.use('/api/v1/stickers', createStickerRoutes({
    authMiddleware,
    handleFileUpload,
    logger,
    projectRoot: path.join(__dirname, '../..'),
    query,
    uuidv4,
}));

app.use('/api/v1/gifs', createGifRoutes({
    authMiddleware,
    logger,
    query,
    uuidv4,
}));

app.use('/api/v1', createUserProfileRoutes({
    authMiddleware,
    handleFileUpload,
    isDeveloper,
    logger,
    QRCode,
    query,
}));

app.use('/api/v1/users', createUserSettingsRoutes({
    authMiddleware,
    broadcastSettingsUpdated: (userId) => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.userId === userId) {
                client.send(JSON.stringify({ type: 'settings_updated' }));
            }
        });
    },
    i18n,
    logger,
    query,
}));

app.use('/api/v1/users', createUserDeviceRoutes({
    authMiddleware,
    logger,
    query,
    uuidv4,
}));

app.use('/api/v1/users', createBlockedUserRoutes({
    authMiddleware,
    logger,
    query,
    uuidv4,
}));

app.use('/api/v1/users', createUserPreferenceRoutes({
    authMiddleware,
    logger,
    query,
}));

app.use('/api/v1/users', createUserStorageRoutes({
    authMiddleware,
    logger,
    projectRoot: path.join(__dirname, '../..'),
    query,
}));

app.use('/api/v1/users', createUserPasscodeRoutes({
    authMiddleware,
    bcrypt,
    query,
}));

app.use('/api/v1/users', createUserExportRoutes({
    authMiddleware,
    logger,
    query,
}));

app.use('/api/v1/reports', createReportRoutes({
    authMiddleware,
    isDeveloper,
    logger,
    query,
    uuidv4,
}));

app.use('/api/v1/users', createModerationRoutes({
    authMiddleware,
    isDeveloper,
    logger,
    query,
}));

app.use('/api/v1/chats', createChatReadRoutes({
    authMiddleware,
    logger,
    query,
}));

app.use('/api/v1/chats', createChatWriteRoutes({
    authMiddleware,
    broadcastToChat,
    handleFileUpload,
    logger,
    pool,
    query,
    uuidv4,
}));

app.use('/api/v1/messages', createMessageSocialRoutes({
    authMiddleware,
    broadcastToChat,
    logger,
    query,
    uuidv4,
}));

app.use('/api/v1', createMessageReadRoutes({
    authMiddleware,
    logger,
    query,
}));

app.use('/api/v1/messages', createMessageWriteRoutes({
    authMiddleware,
    broadcastToChat,
    handleBotCommand,
    logger,
    query,
    uuidv4,
}));

app.use('/api/v1/encryption', createEncryptionRoutes({
    authMiddleware,
    logger,
    query,
    uuidv4,
}));

app.use('/api/v1/emojis', createEmojiRoutes({
    applemojis: require('applemojis'),
}));

// WEBSOCKET
// ============================================

// ============================================
// HEALTH & ERROR HANDLING
// ============================================

app.use('/api', createHealthRoutes({ wss }));

// ============================================
// SUPPORT REQUESTS API
// ============================================

app.use('/api/v1/support', createSupportRoutes({
    authMiddleware,
    broadcastToChat,
    isDeveloper,
    logger,
    query,
    uuidv4,
}));

app.use(createErrorHandler({ logger }));
app.use(notFoundHandler);

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

async function start() {
    try {
        console.log('[START] Starting server initialization...');
        console.log('[START] PORT:', PORT);
        console.log('[START] NODE_ENV:', process.env.NODE_ENV);
        console.log('[START] DATABASE_URL exists:', !!process.env.DATABASE_URL);

        await initDatabase();
        console.log('[START] Database initialized');
        await ensureTablesExist();
        console.log('[START] Tables ensured');
        await startupMigrations.autoMigrate();
        
        // Очищаем дубликаты при запуске
        await startupMigrations.cleanDuplicatePrivateChats();
        
        server.listen(PORT, () => {
            logger.info('========================================');
            logger.info('🦢 CraneApp server running on port ' + PORT);
            logger.info('🌐 Environment: ' + (process.env.NODE_ENV || 'development'));
            logger.info('🔗 Local: http://localhost:' + PORT);
            logger.info('📁 Uploads: ' + uploadsDir);
            logger.info('========================================');
        });
    } catch (error) {
        logger.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

start();

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', () => { 
    logger.info('🛑 SIGTERM received');
    server.close(() => { 
        pool.end(); 
        logger.info('✅ Server closed');
        process.exit(0); 
    }); 
});

process.on('SIGINT', () => { 
    logger.info('🛑 SIGINT received');
    server.close(() => { 
        pool.end(); 
        logger.info('✅ Server closed');
        process.exit(0); 
    }); 
});

// ============================================
// UNCAUGHT EXCEPTION HANDLER
// ============================================

process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { app, server, wss };
