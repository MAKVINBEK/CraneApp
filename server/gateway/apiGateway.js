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
const {
    registerChannelRoutes,
    publishScheduledMessages,
    canPostToChannel
} = require('./channels');
const chatRoutes = require('../services/chat-service/chatRoutes');

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

// Хранилище для отслеживания IP
const ipRequestCounts = new Map();
const ipBlockList = new Map(); // IP -> время разблокировки
const WS_CONNECTIONS = new Map(); // IP -> количество WS соединений

// Глобальный rate limit — 600 запросов в минуту на IP
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
    handler: (req, res) => {
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
        logger.warn(`🚫 Rate limit exceeded: ${ip}`);
        res.set('Retry-After', '60');
        res.status(429).json({ error: i18n.t(i18n.languageFromHeaders(req), 'tooManyRequests') });
    }
});

// Жёсткий лимит для auth — 10 попыток в 15 минут
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
    handler: (req, res) => {
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
        logger.warn(`🚫 Auth rate limit exceeded: ${ip}`);
        ipBlockList.set(ip, Date.now() + 30 * 60 * 1000);
        res.set('Retry-After', '1800');
        res.status(429).json({ error: i18n.t(i18n.languageFromHeaders(req), 'tooManyFailedAttempts', { minutes: 30 }) });
    }
});

// Лимит для API — 300 запросов в минуту
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
    handler: (req, res) => {
        res.set('Retry-After', '60');
        res.status(429).json({ error: (req.t || ((key) => i18n.t(i18n.languageFromHeaders(req), key)))('tooManyRequests') });
    }
});

// Лимит для загрузки файлов — 20 в минуту
const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
    handler: (req, res) => {
        res.set('Retry-After', '60');
        res.status(429).json({ error: (req.t || ((key) => i18n.t(i18n.languageFromHeaders(req), key)))('tooManyRequests') });
    }
});

// Middleware блокировки IP
function ipBlockMiddleware(req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
    const blockUntil = ipBlockList.get(ip);
    if (blockUntil && Date.now() < blockUntil) {
        const remaining = Math.ceil((blockUntil - Date.now()) / 60000);
        res.set('Retry-After', String(remaining * 60));
        return res.status(403).json({ error: i18n.t(i18n.languageFromHeaders(req), 'tooManyFailedAttempts', { minutes: remaining }) });
    }
    if (blockUntil && Date.now() >= blockUntil) {
        ipBlockList.delete(ip);
    }
    next();
}

// Middleware обнаружения аномального трафика (flood detection)
function floodDetectionMiddleware(req, res, next) {
    // Статику не считаем
    if (!req.path.startsWith('/api/')) return next();

    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
    const now = Date.now();
    const windowMs = 1000;
    const maxPerSecond = 60; // только API запросы, 60/сек достаточно

    if (!ipRequestCounts.has(ip)) {
        ipRequestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    } else {
        const data = ipRequestCounts.get(ip);
        if (now > data.resetAt) {
            data.count = 1;
            data.resetAt = now + windowMs;
        } else {
            data.count++;
            if (data.count > maxPerSecond) {
                ipBlockList.set(ip, now + 2 * 60 * 1000);
                logger.warn(`🚫 Flood detected, blocking IP: ${ip} (${data.count} API req/s)`);
                return res.status(429).json({ error: i18n.t(i18n.languageFromHeaders(req), 'tooManyFailedAttempts', { minutes: 2 }) });
            }
        }
    }
    next();
}

// Middleware валидации размера тела запроса
function bodySizeMiddleware(req, res, next) {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxSize = 105 * 1024 * 1024; // 105MB
    if (contentLength > maxSize) {
        return res.status(413).json({ error: i18n.t(i18n.languageFromHeaders(req), 'tooManyRequests') });
    }
    next();
}

// Middleware защиты от подозрительных User-Agent
function suspiciousUAMiddleware(req, res, next) {
    const ua = req.headers['user-agent'] || '';
    const suspicious = [
        /sqlmap/i, /nikto/i, /nmap/i, /masscan/i,
        /zgrab/i, /python-requests\/[01]\./i, /go-http-client\/1\./i,
        /curl\/[0-6]\./i, /wget\//i
    ];
    // Разрешаем пустой UA только для статики
    if (!ua && req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    for (const pattern of suspicious) {
        if (pattern.test(ua)) {
            const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
            logger.warn(`🚫 Suspicious UA blocked: ${ua} from ${ip}`);
            return res.status(403).json({ error: 'Forbidden' });
        }
    }
    next();
}

// Очистка старых записей каждые 5 минут
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipRequestCounts) {
        if (now > data.resetAt + 60000) ipRequestCounts.delete(ip);
    }
    for (const [ip, blockUntil] of ipBlockList) {
        if (now > blockUntil) ipBlockList.delete(ip);
    }
}, 5 * 60 * 1000);
if (cleanupInterval.unref) cleanupInterval.unref();

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

app.use('/api/chats', chatRoutes);

// call.html разрешаем встраивать в iframe с того же домена (CSP frame-ancestors имеет приоритет над X-Frame-Options в браузерах)
app.use('/client/mobile/screens/calls/call.html', (req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    next();
});

app.get('/join/:code', (req, res) => {
    res.redirect(`/client/mobile/screens/chats/chats.html?join=${req.params.code}`);
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
    const apiKey = process.env.METERED_API_KEY;
    const domain = process.env.METERED_DOMAIN;
    if (!apiKey || !domain) return;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000); // таймаут 8 сек
    try {
        const res = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) return;
        const servers = await res.json();
        if (Array.isArray(servers) && servers.length > 0) {
            _cachedIceServers = servers;
            logger.info(`📡 TURN credentials refreshed from Metered (${servers.length} servers)`);
        }
    } catch (e) {
        clearTimeout(tid);
        logger.warn('TURN refresh failed:', e.message);
    }
}

// Обновляем при старте (с задержкой 3с чтобы не мешать запуску) и каждые 12 часов
const meteredTimeout = setTimeout(_refreshMeteredTurn, 3000);
if (meteredTimeout.unref) meteredTimeout.unref();
const meteredInterval = setInterval(_refreshMeteredTurn, 12 * 60 * 60 * 1000);
if (meteredInterval.unref) meteredInterval.unref();

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

// Создать комнату (1-на-1 или групповую)
app.post('/api/v1/calls/rooms', async (req, res) => {
    const u = await authFromHeader(req);
    if (!u) return res.status(401).json({ error: req.t('unauthorized') });
    const { type = 'group', chatId = null, title = null, callKind = 'video', roomId = null } = req.body || {};
    const stableRoomId = roomId || (type === 'group' && chatId ? 'grp_' + String(chatId).replace(/[^a-zA-Z0-9_-]/g, '_') : null);
    const room = callRoom.createRoom(u.userId, { type, chatId, title, callKind, roomId: stableRoomId || undefined });
    res.json({
        success: true,
        room: { id: room.id, type: room.type, chatId: room.chatId, title: room.title, hostId: room.hostId },
        iceServers: getIceServers(),
        maxParticipants: callRoom.MAX_PARTICIPANTS
    });
});

// Получить инфу о комнате
app.get('/api/v1/calls/rooms/:roomId', async (req, res) => {
    const u = await authFromHeader(req);
    if (!u) return res.status(401).json({ error: req.t('unauthorized') });
    const room = callRoom.getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({
        success: true,
        room: {
            id: room.id, type: room.type, chatId: room.chatId, title: room.title,
            hostId: room.hostId,
            participants: Array.from(room.participants.values())
        },
        iceServers: getIceServers(),
        maxParticipants: callRoom.MAX_PARTICIPANTS
    });
});

// Диагностика ICE-серверов
app.get('/api/v1/calls/ice-servers', async (req, res) => {
    const servers = getIceServers();
    const hasTurn = servers.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => u.startsWith('turn:')));
    const apiKey = process.env.METERED_API_KEY;
    const domain = process.env.METERED_DOMAIN;
    let meteredTest = null;
    if (apiKey && domain) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 8000);
            const url = `https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`;
            const r = await fetch(url, { signal: ctrl.signal });
            clearTimeout(tid);
            const body = await r.text();
            meteredTest = { status: r.status, ok: r.ok, url, body: body.slice(0, 500) };
        } catch (e) {
            meteredTest = { error: e.message };
        }
    }
    res.json({ servers, hasTurn, meteredConfigured: !!(apiKey && domain), meteredTest });
});

// Список активных комнат (для раздела «Встречи»)
app.get('/api/v1/calls/rooms', async (req, res) => {
    const u = await authFromHeader(req);
    if (!u) return res.status(401).json({ error: req.t('unauthorized') });
    res.json({ success: true, rooms: callRoom.listRooms() });
});

// ============================================
// AUTH MIDDLEWARE
// ============================================

async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: req.t ? req.t('noToken') : i18n.t(i18n.languageFromHeaders(req), 'noToken') });
        }

        const token = authHeader.split(' ')[1];
        if (!process.env.JWT_SECRET) {
            logger.error('JWT_SECRET is not configured');
            return res.status(500).json({ error: req.t ? req.t('serverConfigError') : i18n.t(i18n.languageFromHeaders(req), 'serverConfigError') });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const result = await query(
            `SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, u.bio, u.badge, u.badges,
                    u.is_bot, u.is_blocked, u.is_muted, u.muted_until, u.is_premium,
                    u.block_reason, u.mute_reason, u.language, us.settings->>'language' AS settings_language
             FROM users u
             LEFT JOIN user_settings us ON us.user_id = u.id
             WHERE u.id = $1`,
            [decoded.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: req.t('userNotFound') });
        }

        req.user = result.rows[0];
        req.locale = i18n.normalizeLanguage(req.user.settings_language) || i18n.normalizeLanguage(req.user.language) || req.locale;
        req.t = (key, vars) => i18n.t(req.locale, key, vars);

        // Проверяем бан
        if (req.user.is_blocked) {
            const errorMessage = req.user.block_reason
                ? req.t('accountBlockedReason', { reason: req.user.block_reason })
                : req.t('accountBlocked');
            return res.status(403).json({ error: errorMessage });
        }

        // Снимаем мут если истёк
        if (req.user.is_muted && req.user.muted_until && new Date(req.user.muted_until) < new Date()) {
            await query('UPDATE users SET is_muted = FALSE, muted_until = NULL, mute_reason = NULL WHERE id = $1', [req.user.id]);
            req.user.is_muted = false;
        }
        next();
    } catch (error) {
        logger.error('Auth middleware error:', error);
        return res.status(401).json({ error: req.t ? req.t('invalidToken') : i18n.t(i18n.languageFromHeaders(req), 'invalidToken') });
    }
}

// ============================================
// AUTO MIGRATE
// ============================================

async function autoMigrate() {
    try {
        logger.info('🔧 Running database migrations...');

        // Фикс: убираем NOT NULL со всех необязательных колонок users
        const optionalUserCols = ['phone', 'name', 'avatar', 'bio', 'last_name', 'avatar_url', 'first_name'];
        for (const col of optionalUserCols) {
            await query(`ALTER TABLE users ALTER COLUMN ${col} DROP NOT NULL`).catch(() => {});
        }
        await query(`ALTER TABLE users ALTER COLUMN phone SET DEFAULT NULL`).catch(() => {});
        await query(`ALTER TABLE users ALTER COLUMN name SET DEFAULT NULL`).catch(() => {});
        await query(`ALTER TABLE users ALTER COLUMN avatar SET DEFAULT NULL`).catch(() => {});
        await query(`ALTER TABLE users ALTER COLUMN avatar_url SET DEFAULT ''`).catch(() => {});
        await query(`ALTER TABLE users ALTER COLUMN bio SET DEFAULT ''`).catch(() => {});
        // Убираем UNIQUE constraint на phone (пустые строки конфликтуют)
        await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key`).catch(() => {});
        await query(`DROP INDEX IF EXISTS users_phone_key`).catch(() => {});
        // Обнуляем пустые phone чтобы не было дублей
        await query(`UPDATE users SET phone = NULL WHERE phone = ''`).catch(() => {});
        // Фикс таблицы chats — добавляем недостающие колонки
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS title VARCHAR(128)`).catch(() => {});
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS name VARCHAR(128)`).catch(() => {});
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`).catch(() => {});
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`).catch(() => {});
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE`).catch(() => {});
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE`).catch(() => {});
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP`).catch(() => {});
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`).catch(() => {});

        // Per-user закреп и архив чатов
        await query(`
            CREATE TABLE IF NOT EXISTS user_chat_settings (
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
                is_pinned BOOLEAN DEFAULT FALSE,
                pinned_at TIMESTAMP,
                is_archived BOOLEAN DEFAULT FALSE,
                archived_at TIMESTAMP,
                last_read_at TIMESTAMP,
                mention_read_at TIMESTAMP,
                PRIMARY KEY (user_id, chat_id)
            )
        `).catch(() => {});
        await query(`ALTER TABLE user_chat_settings ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP`).catch(() => {});
        await query(`ALTER TABLE user_chat_settings ADD COLUMN IF NOT EXISTS mention_read_at TIMESTAMP`).catch(() => {});
        await query(`
            INSERT INTO user_chat_settings (user_id, chat_id, last_read_at)
            SELECT cm.user_id, cm.chat_id, COALESCE(MAX(m.created_at), NOW())
            FROM chat_members cm
            LEFT JOIN messages m ON m.chat_id = cm.chat_id
            LEFT JOIN user_chat_settings ucs ON ucs.user_id = cm.user_id AND ucs.chat_id = cm.chat_id
            WHERE ucs.user_id IS NULL
            GROUP BY cm.user_id, cm.chat_id
        `).catch(() => {});
        await query(`
            UPDATE user_chat_settings ucs
            SET last_read_at = COALESCE(latest.last_message_at, NOW())
            FROM (
                SELECT cm.user_id, cm.chat_id, MAX(m.created_at) AS last_message_at
                FROM chat_members cm
                LEFT JOIN messages m ON m.chat_id = cm.chat_id
                GROUP BY cm.user_id, cm.chat_id
            ) latest
            WHERE ucs.user_id = latest.user_id
              AND ucs.chat_id = latest.chat_id
              AND ucs.last_read_at IS NULL
        `).catch(() => {});
        await query(`
            UPDATE user_chat_settings
            SET mention_read_at = last_read_at
            WHERE mention_read_at IS NULL
        `).catch(() => {});
        
        // Сообщения
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id UUID`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50)`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_duration INTEGER DEFAULT 0`);
        // Убеждаемся что media_url — TEXT (неограниченный размер для base64)
        await query(`ALTER TABLE messages ALTER COLUMN media_url TYPE TEXT`);
        await query(`
            CREATE TABLE IF NOT EXISTS message_mentions (
                message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
                chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (message_id, user_id)
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_message_mentions_user_chat_created ON message_mentions(user_id, chat_id, created_at)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_message_mentions_message ON message_mentions(message_id)`);
        
        // Пользователи
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(64) NOT NULL DEFAULT ''`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(64) DEFAULT ''`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'ru'`);
        
        // Настройки пользователей
        await query(`
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                settings JSONB DEFAULT '{"theme":"dark","notifications":true,"sounds":true,"language":"ru"}',
                privacy_settings JSONB DEFAULT '{}',
                notification_settings JSONB DEFAULT '{}',
                sound_settings JSONB DEFAULT '{}',
                storage_settings JSONB DEFAULT '{}',
                advanced_settings JSONB DEFAULT '{}',
                folders JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Passcode column
        await query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS passcode_hash TEXT DEFAULT NULL`);
        await query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS passcode_enabled BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS passcode_timeout INTEGER DEFAULT 60`);

        // Сессии пользователей
        await query(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id UUID PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                device_name VARCHAR(100),
                device_type VARCHAR(50),
                ip_address VARCHAR(50),
                location VARCHAR(255),
                user_agent TEXT,
                last_active TIMESTAMP DEFAULT NOW(),
                first_login TIMESTAMP DEFAULT NOW(),
                is_current BOOLEAN DEFAULT FALSE
            )
        `);
        
        // Заблокированные пользователи
        await query(`
            CREATE TABLE IF NOT EXISTS blocked_users (
                id UUID PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                blocked_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                blocked_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, blocked_user_id)
            )
        `);
        
        // Стикерпаки
        await query(`
            CREATE TABLE IF NOT EXISTS sticker_packs (
                id UUID PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                icon_url TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Стикеры
        await query(`
            CREATE TABLE IF NOT EXISTS stickers (
                id UUID PRIMARY KEY,
                pack_id UUID REFERENCES sticker_packs(id) ON DELETE CASCADE,
                image_url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // GIF — общие для всех пользователей
        await query(`
            CREATE TABLE IF NOT EXISTS gifs (
                id UUID PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100),
                url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_gifs_user ON gifs(user_id)`);

        // Избранные GIF — для каждого пользователя
        await query(`
            CREATE TABLE IF NOT EXISTS favorite_gifs (
                id UUID PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                gif_id UUID REFERENCES gifs(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, gif_id)
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_favorite_gifs_user ON favorite_gifs(user_id)`);

        // Медиафайлы — отдельная таблица для хранения в БД
        await query(`
            CREATE TABLE IF NOT EXISTS media_files (
                id UUID PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                data TEXT NOT NULL,
                mime_type VARCHAR(100),
                size_bytes INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_media_files_user ON media_files(user_id)`);
        
        // Индексы
        await query(`CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(chat_id) WHERE is_pinned = TRUE`);
        await query(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_message_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_blocked_user ON blocked_users(user_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_sticker_packs_user ON sticker_packs(user_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_stickers_pack ON stickers(pack_id)`);
        
        // Закрепление и архивирование чатов
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP`);
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`);
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`);
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''`);
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS username VARCHAR(32)`).catch(() => {});
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE`).catch(() => {});
        await query(`ALTER TABLE chats ADD COLUMN IF NOT EXISTS discussion_chat_id UUID REFERENCES chats(id) ON DELETE SET NULL`).catch(() => {});

        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES messages(id) ON DELETE CASCADE`).catch(() => {});
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0`).catch(() => {});
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP`).catch(() => {});
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS published_at TIMESTAMP`).catch(() => {});
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_silent BOOLEAN DEFAULT FALSE`).catch(() => {});
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_signature VARCHAR(128)`).catch(() => {});
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0`).catch(() => {});

        await query(`
            CREATE TABLE IF NOT EXISTS message_views (
                message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                viewed_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (message_id, user_id)
            )
        `).catch(() => {});

        await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_channel_username ON chats (LOWER(username)) WHERE type = 'channel' AND username IS NOT NULL`).catch(() => {});
        await query(`CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON messages(scheduled_at) WHERE scheduled_at IS NOT NULL AND published_at IS NULL`).catch(() => {});
        await query(`CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_message_id)`).catch(() => {});
        await query(`CREATE INDEX IF NOT EXISTS idx_message_views_message ON message_views(message_id)`).catch(() => {});
        
        // Индексы для производительности
        await query(`CREATE INDEX IF NOT EXISTS idx_chats_pinned ON chats(is_pinned) WHERE is_pinned = TRUE`);
        await query(`CREATE INDEX IF NOT EXISTS idx_chats_archived ON chats(is_archived) WHERE is_archived = TRUE`);
        
        // Создаём уникальный индекс для предотвращения дубликатов приватных чатов
        await query(`DROP INDEX IF EXISTS idx_private_chat_unique`);
        
        // Создаём триггерную функцию для проверки дубликатов приватных чатов
        await query(`
            CREATE OR REPLACE FUNCTION prevent_duplicate_private_chats()
            RETURNS TRIGGER AS $$
            DECLARE
                existing_chat_id UUID;
                chat_type TEXT;
            BEGIN
                -- Получаем тип чата
                SELECT type INTO chat_type FROM chats WHERE id = NEW.chat_id;
                
                -- Только для приватных чатов
                IF chat_type = 'private' THEN
                    -- Проверяем, существует ли уже чат с этими двумя пользователями
                    WITH other_members AS (
                        SELECT user_id FROM chat_members 
                        WHERE chat_id = NEW.chat_id AND user_id != NEW.user_id
                        LIMIT 1
                    )
                    SELECT c.id INTO existing_chat_id
                    FROM chats c
                    JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = NEW.user_id
                    JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = (SELECT user_id FROM other_members)
                    WHERE c.type = 'private' AND c.id != NEW.chat_id;
                    
                    IF existing_chat_id IS NOT NULL THEN
                        RAISE EXCEPTION 'Private chat already exists between these users';
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        // Создаём триггер
        await query(`
            DROP TRIGGER IF EXISTS check_duplicate_private_chats ON chat_members;
            CREATE TRIGGER check_duplicate_private_chats
            BEFORE INSERT ON chat_members
            FOR EACH ROW
            EXECUTE FUNCTION prevent_duplicate_private_chats();
        `);
        
        // Реакции на сообщения
        await query(`
            CREATE TABLE IF NOT EXISTS message_reactions (
                id UUID PRIMARY KEY,
                message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                emoji VARCHAR(10) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(message_id, user_id, emoji)
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id)`);

        // 2FA — доп. пароль
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_hash VARCHAR(255)`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_enabled BOOLEAN DEFAULT FALSE`);

        // Статусы пользователей
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_fake BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_scam BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS badge VARCHAR(20) DEFAULT NULL`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}'`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until TIMESTAMP DEFAULT NULL`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_reason TEXT DEFAULT NULL`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS block_reason TEXT DEFAULT NULL`);

        // Поиск по сообщениям - храним незашифрованный текст для поиска
        try {
            await query(`ALTER TABLE messages ADD COLUMN content_plain TEXT`);
            console.log('Added content_plain to messages table');
        } catch (error) {
            if (error.code === '42701') { // 'duplicate_column' error code
                console.log('Column content_plain already exists, skipping migration.');
            } else {
                console.error('Error adding content_plain column:', error);
            }
        }

        // Запросы в поддержку
        await query(`
            CREATE TABLE IF NOT EXISTS support_requests (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'open',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_support_user ON support_requests(user_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_support_status ON support_requests(status)`);

        // Избранные сообщения
        await query(`            CREATE TABLE IF NOT EXISTS favorite_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
                saved_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, message_id)
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorite_messages(user_id)`);

        // E2E Encryption — публичные ключи пользователей
        await query(`
            CREATE TABLE IF NOT EXISTS user_public_keys (
                user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                public_key TEXT NOT NULL,
                key_id VARCHAR(64) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // E2E Encryption — зашифрованные сессионные ключи для каждого чата
        await query(`
            CREATE TABLE IF NOT EXISTS chat_encryption_keys (
                id UUID PRIMARY KEY,
                chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                encrypted_key TEXT NOT NULL,
                sender_key_id VARCHAR(64) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(chat_id, user_id)
            )
        `);

        // Добавляем флаг зашифрованности к сообщениям
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT FALSE`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS encryption_iv TEXT`);

        // Расширяем CHECK-ограничение типов сообщений — добавляем 'call', 'poll'
        await query(`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check`).catch(() => {});
        await query(`ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (type IN ('text','image','video','audio','voice','file','sticker','gif','contact','location','call','poll'))`).catch(() => {});

        // Опросы в групповых чатах
        await query(`
            CREATE TABLE IF NOT EXISTS polls (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                message_id UUID REFERENCES messages(id) ON DELETE CASCADE UNIQUE,
                question TEXT NOT NULL,
                is_anonymous BOOLEAN DEFAULT FALSE,
                allow_multiple BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_polls_message ON polls(message_id)`);

        await query(`
            CREATE TABLE IF NOT EXISTS poll_options (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id)`);

        await query(`
            CREATE TABLE IF NOT EXISTS poll_votes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
                option_id UUID REFERENCES poll_options(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(poll_id, option_id, user_id)
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON poll_votes(option_id)`);

        // Group moderation migrations: permissions column and chat_bans table
        await query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'chat_members' AND column_name = 'permissions'
                ) THEN
                    ALTER TABLE chat_members ADD COLUMN permissions JSONB DEFAULT '{}';
                END IF;
            END $$;
        `).catch(() => {});

        await query(`
            CREATE TABLE IF NOT EXISTS chat_bans (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
                reason TEXT,
                banned_until TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(chat_id, user_id)
            )
        `).catch(() => {});
        await query(`CREATE INDEX IF NOT EXISTS idx_chat_bans_chat ON chat_bans(chat_id)`).catch(() => {});

        logger.info('✅ Database migrations completed!');
        
    } catch (error) {
        logger.warn('⚠️ Migration warning:', error.message);
    }
}

// ============================================
// CLEAN DUPLICATE PRIVATE CHATS
// ============================================

async function cleanDuplicatePrivateChats() {
    try {
        logger.info('🧹 Cleaning duplicate private chats...');
        
        // Находим все приватные чаты и группируем по парам пользователей
        const result = await query(`
            WITH user_pairs AS (
                SELECT 
                    c.id as chat_id,
                    c.created_at,
                    ARRAY_AGG(cm.user_id ORDER BY cm.user_id) as user_ids
                FROM chats c
                JOIN chat_members cm ON c.id = cm.chat_id
                WHERE c.type = 'private'
                GROUP BY c.id, c.created_at
                HAVING COUNT(cm.user_id) = 2
            ),
            duplicate_groups AS (
                SELECT 
                    user_ids,
                    ARRAY_AGG(chat_id ORDER BY created_at ASC) as chat_ids,
                    MIN(created_at) as first_created
                FROM user_pairs
                GROUP BY user_ids
                HAVING COUNT(*) > 1
            )
            SELECT * FROM duplicate_groups
        `);
        
        if (result.rows.length === 0) {
            logger.info('✅ No duplicate private chats found');
            return;
        }

        logger.info(`📊 Found ${result.rows.length} groups of duplicate chats`);
        
        for (const group of result.rows) {
            const chatIds = group.chat_ids;
            // Оставляем самый старый чат, удаляем остальные
            const keepChatId = chatIds[0];
            const deleteChatIds = chatIds.slice(1);
            
            logger.info(`Keeping chat ${keepChatId}, deleting: ${deleteChatIds.join(', ')}`);
            
            for (const deleteChatId of deleteChatIds) {
                // Переносим сообщения из удаляемого чата в сохраняемый
                await query(
                    `UPDATE messages SET chat_id = $1 WHERE chat_id = $2 AND is_deleted = FALSE`,
                    [keepChatId, deleteChatId]
                );
                
                // Удаляем участников
                await query(`DELETE FROM chat_members WHERE chat_id = $1`, [deleteChatId]);
                
                // Удаляем сам чат
                await query(`DELETE FROM chats WHERE id = $1`, [deleteChatId]);
                
                logger.info(`✅ Deleted duplicate chat: ${deleteChatId}`);
            }
        }
        
        logger.info('✅ Duplicate private chats cleaned successfully');

        // Создаём CraneApp бот чат для всех пользователей у кого его нет
        try {
            const allUsers = await query('SELECT id FROM users WHERE is_bot = FALSE OR is_bot IS NULL');
            for (const u of allUsers.rows) {
                await createCraneAppBotChat(u.id);
            }
            logger.info('✅ CraneApp bot chats ensured for all users');
        } catch (e) {
            logger.warn('⚠️ CraneApp bot setup failed:', e.message);
        }

        // Очищаем дублирующиеся сессии — оставляем только последнюю для каждого userAgent
        try {
            await query(`
                DELETE FROM user_sessions
                WHERE id NOT IN (
                    SELECT DISTINCT ON (user_id, user_agent) id
                    FROM user_sessions
                    ORDER BY user_id, user_agent, last_active DESC
                )
            `);
            logger.info('✅ Duplicate sessions cleaned');
        } catch (e) {
            logger.warn('⚠️ Session cleanup failed:', e.message);
        }
        
    } catch (error) {
        logger.error('❌ Error cleaning duplicate chats:', error);
    }
}

// ============================================
// AUTH ROUTES
// ============================================

app.post('/api/v1/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, password, firstName, lastName } = req.body;
        const lang = i18n.normalizeLanguage(req.body.language) || req.locale || 'ru';

        if (!username || username.length < 5 || username.length > 32) {
            return res.status(400).json({ error: req.t('usernameLength') });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({ error: req.t('usernameFormat') });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ error: req.t('passwordMin') });
        }

        if (!firstName) {
            return res.status(400).json({ error: req.t('firstNameRequired') });
        }

        const existing = await query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: req.t('usernameTaken') });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();

        const result = await query(
            `INSERT INTO users (id, username, password_hash, first_name, last_name, phone, bio, avatar_url, language, created_at, last_seen)
             VALUES ($1, $2, $3, $4, $5, NULL, '', '', $6, NOW(), NOW())
             RETURNING id, username, first_name, last_name, bio, avatar_url`,
            [userId, username.toLowerCase(), hashedPassword, firstName, lastName || '', lang]
        );

        const user = result.rows[0];
        if (!process.env.JWT_SECRET) {
            logger.error('JWT_SECRET is not configured');
            return res.status(500).json({ error: req.t('serverConfigError') });
        }
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        await query(
            `INSERT INTO user_settings (user_id, settings, privacy_settings, notification_settings, sound_settings, storage_settings, advanced_settings, folders)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [user.id, 
             JSON.stringify({ theme: 'dark', notifications: true, sounds: true, language: lang }),
             JSON.stringify({ lastSeen: 'all', phoneVisibility: 'contacts', photoVisibility: 'all', messagesFromStrangers: true, groupsAdd: 'all', twoFactorAuth: false, autoDeleteAccount: true }),
             JSON.stringify({ privateChats: true, groups: true, channels: true, calls: true, videoCalls: true, inAppNotifications: true, messagePreview: true, readReceipts: false, reactions: true, newContacts: true }),
             JSON.stringify({ notificationsVolume: 80, mediaVolume: 100, notificationsSound: true, messagesSound: true, sendSound: true, callsSound: true, vibrateOnCall: true, notificationSound: 'default', messageSound: 'default', ringtone: 'default' }),
             JSON.stringify({ autoDownloadMobile: true, autoDownloadWifi: true, autoDownloadRoaming: false, deleteMediaAfter: 'never' }),
             JSON.stringify({ autoReconnect: true, fastConnection: true, connectionType: 'auto', dataCompression: true, saveDrafts: true, analytics: false, developerMode: false, debugLog: false, hardwareAcceleration: true, autoplayGifs: true }),
             JSON.stringify([])
            ]
        );

        await createCraneAppBotChat(userId);

        logger.info('✅ New user registered: ' + user.username);
        res.status(201).json({ 
            user: { 
                id: user.id, 
                username: user.username, 
                firstName: user.first_name, 
                lastName: user.last_name,
                bio: user.bio || '',
                avatarUrl: user.avatar_url || ''
            }, 
            token 
        });
    } catch (error) {
        logger.error('❌ Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Отправка уведомления о входе через CraneApp бот
async function sendLoginNotification(userId, ip, deviceName, location, lang = 'ru') {
    try {
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        if (!botResult.rows.length) return;
        const botId = botResult.rows[0].id;

        const chatResult = await query(
            `SELECT c.id FROM chats c
             JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
             JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
             WHERE c.type = 'private'`,
            [userId, botId]
        );
        if (!chatResult.rows.length) return;
        const chatId = chatResult.rows[0].id;

        const localeMap = { ru: 'ru-RU', en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', pl: 'pl-PL', uk: 'uk-UA', tr: 'tr-TR' };
        const time = new Date().toLocaleString(localeMap[lang] || 'ru-RU', { timeZone: 'Europe/Moscow' });
        const msg = i18n.t(lang, 'loginNotification', {
            device: deviceName || i18n.t(lang, 'unknown'),
            location: location || i18n.t(lang, 'unknown'),
            ip: ip || i18n.t(lang, 'unknown'),
            time
        });

        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [uuidv4(), chatId, botId, msg]
        );

        // Уведомляем через WebSocket если пользователь онлайн
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.userId === userId) {
                client.send(JSON.stringify({ type: 'new_message', chatId, message: { content: msg, senderId: botId } }));
            }
        });
    } catch (e) {
        logger.warn('⚠️ Login notification failed:', e.message);
    }
}

app.post('/api/v1/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password, clientIP: bodyClientIP } = req.body;
        const ip = security.getIP(req);

        if (!username || !password) {
            return res.status(400).json({ error: req.t('usernamePasswordRequired') });
        }

        // Проверка brute-force
        const bruteCheck = security.checkBruteForce(ip, username);
        if (bruteCheck.blocked) {
            logger.warn(`🔒 Login blocked for ${username} from ${ip}`);
            return res.status(429).json({
                error: req.t('tooManyFailedAttempts', { minutes: bruteCheck.remaining })
            });
        }

        // Задержка для защиты от timing attacks
        await security.timingAttackDelay(200);

        const result = await query('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);

        // Одинаковый ответ для "не найден" и "неверный пароль" — защита от enumeration
        if (result.rows.length === 0) {
            security.recordFailedLogin(ip, username);
            security.addSuspiciousScore(ip, 3);
            return res.status(401).json({ error: req.t('invalidUsernamePassword') });
        }

        const user = result.rows[0];

        // Проверяем бан ДО проверки пароля
        if (user.is_blocked) {
            return res.status(403).json({ error: req.t('accountBlockedSupport') });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            const attempts = security.recordFailedLogin(ip, username);
            security.addSuspiciousScore(ip, 3);
            const remaining = MAX_LOGIN_ATTEMPTS - attempts;
            return res.status(401).json({
                error: req.t('invalidUsernamePassword'),
                attemptsLeft: remaining > 0 ? remaining : 0
            });
        }

        // Успешный вход — сбрасываем счётчик
        security.recordSuccessfulLogin(ip, username);

        await query('UPDATE users SET last_seen = NOW() WHERE id = $1', [user.id]);

        // Автоматически выдаём badge разработчика
        if (isDeveloper(user.username)) {
            await query(`UPDATE users SET badges = array_append(COALESCE(badges,'{}'), 'developer') WHERE id = $1 AND NOT ('developer' = ANY(COALESCE(badges,'{}')))`, [user.id]);
        }

        // Проверяем 2FA
        if (user.two_fa_enabled) {
            const { twoFAPassword } = req.body;
            if (!twoFAPassword) {
                return res.status(200).json({ twoFARequired: true, userId: user.id });
            }
            const twoFAMatch = await bcrypt.compare(twoFAPassword, user.two_fa_hash);
            if (!twoFAMatch) {
                return res.status(401).json({ error: req.t('invalid2FA') });
            }
        }

        if (!process.env.JWT_SECRET) {
            logger.error('JWT_SECRET is not configured');
            return res.status(500).json({ error: req.t('serverConfigError') });
        }
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        // Регистрируем сессию для возможности отзыва
        security.registerSession(user.id, token);

        // Уведомление о входе через CraneApp бот (асинхронно)
        const serverIP = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
        const loginIp = bodyClientIP || serverIP;
        const ua = req.headers['user-agent'] || '';
        const lang = await i18n.languageForUser(user.id, query) || req.locale || 'ru';
        let deviceName = i18n.t(lang, 'browser');
        if (/iPhone/.test(ua)) deviceName = 'iPhone';
        else if (/iPad/.test(ua)) deviceName = 'iPad';
        else if (/Android/.test(ua)) deviceName = 'Android';
        else if (/Windows/.test(ua)) deviceName = 'Windows PC';
        else if (/Mac/.test(ua)) deviceName = 'Mac';

        // Геолокация и уведомление (не блокируем ответ)
        (async () => {
            let location = i18n.t(lang, 'localNetwork');
            const isLocal = !loginIp || loginIp === '::1' || loginIp === '127.0.0.1' || loginIp.startsWith('192.168.') || loginIp.startsWith('10.');
            if (!isLocal) {
                try {
                    const http = require('http');
                    const geo = await new Promise((resolve) => {
                        http.get(`http://ip-api.com/json/${loginIp}?fields=city,country&lang=${lang}`, r => {
                            let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
                        }).on('error', () => resolve({}));
                    });
                    if (geo.city) location = `${geo.city}, ${geo.country}`;
                    else if (geo.country) location = geo.country;
                } catch (_) {}
            }
            await sendLoginNotification(user.id, loginIp, deviceName, location, lang);
        })();

        logger.info('✅ User logged in: ' + user.username);
        res.status(200).json({ 
            user: { 
                id: user.id, 
                username: user.username, 
                firstName: user.first_name, 
                lastName: user.last_name,
                avatarUrl: user.avatar_url || '',
                bio: user.bio || ''
            }, 
            token 
        });
    } catch (error) {
        logger.error('❌ Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Logout — отзываем токен
app.post('/api/v1/auth/logout', authMiddleware, async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        security.revokeToken(token);
        logger.info('✅ User logged out:', req.user.username);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Logout all devices — отзываем все токены пользователя
app.post('/api/v1/auth/logout-all', authMiddleware, async (req, res) => {
    try {
        security.revokeAllUserSessions(req.user.id);
        logger.info('✅ All sessions revoked for:', req.user.username);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// QR LOGIN
// ============================================

// In-memory хранилище QR токенов: token -> { userId, expiresAt, confirmed, authToken }
const qrTokens = new Map();

// Очистка истёкших токенов каждые 2 минуты
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of qrTokens.entries()) {
        if (data.expiresAt < now) qrTokens.delete(token);
    }
}, 2 * 60 * 1000);

// Генерация QR токена (вызывает авторизованный пользователь на устройстве-источнике)
app.post('/api/v1/auth/qr-token', authMiddleware, async (req, res) => {
    try {
        const qrToken = uuidv4();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 минут

        qrTokens.set(qrToken, {
            userId: req.user.id,
            expiresAt,
            confirmed: false,
            authToken: null
        });

        // Формируем URL который будет закодирован в QR
        const host = req.get('host');
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const qrUrl = `${protocol}://${host}/api/v1/auth/qr-confirm?token=${qrToken}`;

        // Генерируем base64 PNG через qrcode
        const qrImageBase64 = await QRCode.toDataURL(qrUrl, {
            width: 256,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        });

        res.json({ qrToken, qrImage: qrImageBase64, expiresAt });
    } catch (error) {
        logger.error('QR token generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Polling — новое устройство проверяет подтверждён ли QR
app.get('/api/v1/auth/qr-status/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const data = qrTokens.get(token);

        if (!data) return res.json({ status: 'expired' });
        if (data.expiresAt < Date.now()) {
            qrTokens.delete(token);
            return res.json({ status: 'expired' });
        }
        if (data.confirmed) {
            // Возвращаем JWT и удаляем токен
            const authToken = data.authToken;
            qrTokens.delete(token);
            return res.json({ status: 'confirmed', authToken });
        }

        res.json({ status: 'pending', expiresAt: data.expiresAt });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Подтверждение QR — вызывается когда новое устройство открывает ссылку из QR
app.get('/api/v1/auth/qr-confirm', async (req, res) => {
    try {
        const { token } = req.query;
        const data = qrTokens.get(token);
        const lang = req.locale || i18n.languageFromHeaders(req);
        const tt = (key, vars) => i18n.t(lang, key, vars);

        if (!data || data.expiresAt < Date.now()) {
            return res.status(400).send(`
                <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#000;color:#fff;">
                    <h2 style="color:#FF4B4B;">${tt('qrExpiredTitle')}</h2>
                    <p>${tt('qrExpiredDesc')}</p>
                </body></html>
            `);
        }

        // Получаем данные пользователя
        const userResult = await query(
            'SELECT id, username, first_name, last_name, avatar_url FROM users WHERE id = $1',
            [data.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).send(tt('userNotFound'));
        }

        const user = userResult.rows[0];

        // Генерируем новый JWT для нового устройства
        const newAuthToken = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        // Помечаем QR как подтверждённый
        data.confirmed = true;
        data.authToken = newAuthToken;

        // Отдаём страницу подтверждения с авто-логином
        res.send(`
            <!DOCTYPE html>
            <html lang="${lang}">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${tt('qrLoginTitle')}</title>
                <style>
                    body { font-family: system-ui, sans-serif; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
                    .card { background: #121212; border-radius: 16px; padding: 32px; text-align: center; max-width: 320px; width: 90%; }
                    .avatar { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #FF007F, #9D00FF); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; margin: 0 auto 16px; }
                    h2 { margin: 0 0 8px; font-size: 20px; }
                    p { color: #B0B0B0; font-size: 14px; margin: 0 0 24px; }
                    .btn { width: 100%; padding: 14px; border-radius: 12px; border: none; background: linear-gradient(135deg, #FF007F, #9D00FF); color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
                    .btn:active { opacity: 0.85; }
                    .success { color: #00FF88; font-size: 13px; margin-top: 12px; display: none; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="avatar">${(user.first_name || user.username || '?')[0].toUpperCase()}</div>
                    <h2>${user.first_name || user.username}</h2>
                    <p>@${user.username}<br>${tt('qrLoginPrompt')}</p>
                    <button class="btn" onclick="doLogin()">${tt('qrLoginButton')}</button>
                    <div class="success" id="successMsg">${tt('qrLoginSuccess')}</div>
                </div>
                <script>
                    function doLogin() {
                        localStorage.setItem('craneapp_auth_token', '${newAuthToken}');
                        localStorage.setItem('craneapp_user_data', JSON.stringify({
                            id: '${user.id}',
                            username: '${user.username}',
                            firstName: '${user.first_name}',
                            lastName: '${user.last_name || ''}',
                            avatarUrl: '${user.avatar_url || ''}'
                        }));
                        document.getElementById('successMsg').style.display = 'block';
                        setTimeout(() => {
                            window.location.href = '/client/mobile/screens/chats/chats.html';
                        }, 800);
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        logger.error('QR confirm error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/v1/auth/me', async (req, res) => {
 try {
 const authHeader = req.headers.authorization;
 if (!authHeader || !authHeader.startsWith('Bearer ')) {
 return res.status(401).json({ error: req.t('noToken') });
 }

 const token = authHeader.split(' ')[1];
 if (!process.env.JWT_SECRET) {
     logger.error('JWT_SECRET is not configured');
     return res.status(500).json({ error: req.t('serverConfigError') });
 }
 const decoded = jwt.verify(token, process.env.JWT_SECRET);

 const result = await query(
 'SELECT id, username, first_name, last_name, avatar_url, bio, badge, is_bot FROM users WHERE id = $1',
 [decoded.userId]
 );

 if (result.rows.length ===0) {
 return res.status(401).json({ error: req.t('userNotFound') });
 }

 res.status(200).json({ 
 user: { 
 id: result.rows[0].id,
 username: result.rows[0].username,
 firstName: result.rows[0].first_name,
 lastName: result.rows[0].last_name,
 avatarUrl: result.rows[0].avatar_url || '',
 bio: result.rows[0].bio || '',
 badge: result.rows[0].badge || null,
 isBot: result.rows[0].is_bot || false
 } 
 });
 } catch (error) {
 res.status(401).json({ error: req.t('invalidToken') });
 }
});

// ============================================
// AUTH SESSIONS ROUTE (for CraneApp security notifications)
// ============================================

app.get('/api/v1/auth/sessions', authMiddleware, async (req, res) => {
 try {
 const result = await query(
 `SELECT id, device_name, device_type, ip_address, location, 
 last_active, first_login, is_current
 FROM user_sessions 
 WHERE user_id = $1 
 ORDER BY last_active DESC`,
 [req.user.id]
 );
        
 const sessions = result.rows.map(s => ({
 id: s.id,
 deviceName: s.device_name,
 deviceType: s.device_type,
 ipAddress: s.ip_address,
 location: s.location,
 lastActive: s.last_active,
 firstLogin: s.first_login,
 is_current: s.is_current
 }));
        
 res.json({ sessions });
 } catch (error) {
 logger.error('❌ Get sessions error:', error);
 res.status(500).json({ error: error.message });
 }
});

// ============================================
// UPLOAD ROUTES
// ============================================

app.post('/api/v1/upload', uploadLimiter, authMiddleware, async (req, res) => {
    try {
        const { file, type } = req.body;
        
        if (!file) {
            return res.status(400).json({ error: 'File required' });
        }

        // Всегда сохраняем в БД — Railway имеет эфемерную файловую систему
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

        const url = `/api/v1/media/${mediaId}`;
        logger.info('✅ Media stored in DB:', mediaId, mimeType, Math.round(sizeBytes / 1024) + 'KB');
        return res.json({ success: true, url });

    } catch (error) {
        logger.error('❌ Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Отдача медиафайлов из БД
app.get('/api/v1/media/:mediaId', async (req, res) => {
    try {
        const { mediaId } = req.params;
        const result = await query(
            'SELECT data, mime_type FROM media_files WHERE id = $1',
            [mediaId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Media not found' });
        }
        const { data, mime_type } = result.rows[0];
        // Отдаём base64 как бинарный файл
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

// ============================================
// STICKER PACKS ROUTES
// ============================================

app.get('/api/v1/stickers/packs', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT sp.*, 
                    (SELECT COUNT(*) FROM stickers WHERE pack_id = sp.id) as sticker_count
             FROM sticker_packs sp
             WHERE sp.user_id = $1
             ORDER BY sp.created_at DESC`,
            [req.user.id]
        );
        
        const packs = result.rows.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            iconUrl: p.icon_url,
            stickerCount: parseInt(p.sticker_count),
            createdAt: p.created_at
        }));
        
        res.json({ packs });
    } catch (error) {
        logger.error('❌ Get sticker packs error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/stickers/packs', authMiddleware, async (req, res) => {
    try {
        const { name, description, icon } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name required' });
        }
        
        const packId = uuidv4();
        let iconUrl = null;
        
        if (icon) {
            iconUrl = handleFileUpload(icon, 'sticker', 'stickers');
        }
        
        await query(
            `INSERT INTO sticker_packs (id, user_id, name, description, icon_url, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [packId, req.user.id, name.trim(), description || '', iconUrl]
        );
        
        logger.info('✅ Sticker pack created:', packId);
        res.status(201).json({ 
            success: true,
            pack: {
                id: packId,
                name: name.trim(),
                description: description || '',
                iconUrl: iconUrl,
                stickerCount: 0,
                createdAt: new Date()
            }
        });
    } catch (error) {
        logger.error('❌ Create sticker pack error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/stickers/packs/:packId', authMiddleware, async (req, res) => {
    try {
        const { packId } = req.params;
        const { name, description, icon } = req.body;
        
        const packCheck = await query(
            'SELECT id FROM sticker_packs WHERE id = $1 AND user_id = $2',
            [packId, req.user.id]
        );
        
        if (packCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Pack not found' });
        }
        
        let iconUrl = undefined;
        if (icon) {
            iconUrl = handleFileUpload(icon, 'sticker', 'stickers');
        }
        
        const updates = [];
        const values = [];
        let idx = 1;
        
        if (name) {
            updates.push(`name = $${idx++}`);
            values.push(name);
        }
        if (description !== undefined) {
            updates.push(`description = $${idx++}`);
            values.push(description);
        }
        if (iconUrl) {
            updates.push(`icon_url = $${idx++}`);
            values.push(iconUrl);
        }
        
        if (updates.length > 0) {
            updates.push('updated_at = NOW()');
            values.push(packId);
            
            await query(
                `UPDATE sticker_packs SET ${updates.join(', ')} WHERE id = $${idx}`,
                values
            );
        }

        logger.info('✅ Sticker pack updated:', packId);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Update sticker pack error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/stickers/packs/:packId', authMiddleware, async (req, res) => {
    try {
        const { packId } = req.params;
        
        const packCheck = await query(
            'SELECT icon_url FROM sticker_packs WHERE id = $1 AND user_id = $2',
            [packId, req.user.id]
        );
        
        if (packCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Pack not found' });
        }
        
        // Delete stickers first
        const stickers = await query('SELECT image_url FROM stickers WHERE pack_id = $1', [packId]);
        
        // Delete physical files
        for (const sticker of stickers.rows) {
            if (sticker.image_url) {
                const filepath = path.join(__dirname, '../../', sticker.image_url);
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
            }
        }
        
        // Delete pack icon if exists
        if (packCheck.rows[0].icon_url) {
            const iconPath = path.join(__dirname, '../../', packCheck.rows[0].icon_url);
            if (fs.existsSync(iconPath)) {
                fs.unlinkSync(iconPath);
            }
        }
        
        await query('DELETE FROM stickers WHERE pack_id = $1', [packId]);
        await query('DELETE FROM sticker_packs WHERE id = $1', [packId]);
        
        logger.info('✅ Sticker pack deleted:', packId);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Delete sticker pack error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// STICKERS ROUTES
// ============================================

app.get('/api/v1/stickers/packs/:packId', authMiddleware, async (req, res) => {
    try {
        const { packId } = req.params;
        
        const packCheck = await query(
            'SELECT id FROM sticker_packs WHERE id = $1 AND user_id = $2',
            [packId, req.user.id]
        );
        
        if (packCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Pack not found' });
        }
        
        const result = await query(
            'SELECT * FROM stickers WHERE pack_id = $1 ORDER BY created_at DESC',
            [packId]
        );
        
        const stickers = result.rows.map(s => ({
            id: s.id,
            imageUrl: s.image_url,
            createdAt: s.created_at
        }));
        
        res.json({ stickers });
    } catch (error) {
        logger.error('❌ Get stickers error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/stickers/packs/:packId', authMiddleware, async (req, res) => {
    try {
        const { packId } = req.params;
        const { image } = req.body;
        
        const packCheck = await query(
            'SELECT id FROM sticker_packs WHERE id = $1 AND user_id = $2',
            [packId, req.user.id]
        );
        
        if (packCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Pack not found' });
        }
        
        if (!image) {
            return res.status(400).json({ error: 'Image required' });
        }
        
        const imageUrl = handleFileUpload(image, 'sticker', 'stickers');
        const stickerId = uuidv4();
        
        await query(
            `INSERT INTO stickers (id, pack_id, image_url, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [stickerId, packId, imageUrl]
        );
        
        logger.info('✅ Sticker added:', stickerId);
        res.status(201).json({ 
            success: true, 
            sticker: {
                id: stickerId,
                imageUrl: imageUrl,
                createdAt: new Date()
            }
        });
    } catch (error) {
        logger.error('❌ Add sticker error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/stickers/:stickerId', authMiddleware, async (req, res) => {
    try {
        const { stickerId } = req.params;

        const stickerCheck = await query(
            `SELECT s.id, s.image_url, sp.user_id
             FROM stickers s
             JOIN sticker_packs sp ON s.pack_id = sp.id
             WHERE s.id = $1`,
            [stickerId]
        );

        if (stickerCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Sticker not found' });
        }

        if (stickerCheck.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        // Delete physical file
        if (stickerCheck.rows[0].image_url) {
            const filepath = path.join(__dirname, '../../', stickerCheck.rows[0].image_url);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
        }

        await query('DELETE FROM stickers WHERE id = $1', [stickerId]);

        logger.info('✅ Sticker deleted:', stickerId);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Delete sticker error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GIF API - общие для всех пользователей
app.get('/api/v1/gifs', authMiddleware, async (req, res) => {
    try {
        console.log('[GIF API] GET /api/v1/gifs called');
        const result = await query(
            `SELECT g.*, u.first_name as user_name
             FROM gifs g
             LEFT JOIN users u ON g.user_id = u.id
             ORDER BY g.created_at DESC
             LIMIT 100`
        );

        console.log('[GIF API] Found', result.rows.length, 'GIFs in database');
        const gifs = result.rows.map(g => ({
            id: g.id,
            name: g.name,
            url: g.url,
            userName: g.user_name,
            createdAt: g.created_at
        }));

        console.log('[GIF API] Returning GIFs:', gifs);
        res.json({ gifs });
    } catch (error) {
        logger.error('❌ Get GIFs error:', error);
        console.error('[GIF API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/gifs', authMiddleware, async (req, res) => {
    try {
        console.log('[GIF API] POST /api/v1/gifs called');
        console.log('[GIF API] Request body:', req.body);
        console.log('[GIF API] User ID:', req.user.id);

        const { name, url } = req.body;

        if (!url) {
            console.log('[GIF API] Error: URL required');
            return res.status(400).json({ error: 'URL required' });
        }

        const gifId = uuidv4();
        console.log('[GIF API] Creating GIF with ID:', gifId);

        await query(
            `INSERT INTO gifs (id, user_id, name, url, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [gifId, req.user.id, name || '', url]
        );

        logger.info('✅ GIF created:', gifId);
        console.log('[GIF API] GIF successfully created');
        res.status(201).json({
            success: true,
            gif: {
                id: gifId,
                name: name || '',
                url: url,
                createdAt: new Date()
            }
        });
    } catch (error) {
        logger.error('❌ Create GIF error:', error);
        console.error('[GIF API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Favorite GIFs API
app.get('/api/v1/gifs/favorites', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT g.*, u.first_name as user_name
             FROM favorite_gifs fg
             JOIN gifs g ON fg.gif_id = g.id
             LEFT JOIN users u ON g.user_id = u.id
             WHERE fg.user_id = $1
             ORDER BY fg.created_at DESC
             LIMIT 100`,
            [req.user.id]
        );

        const gifs = result.rows.map(g => ({
            id: g.id,
            name: g.name,
            url: g.url,
            userName: g.user_name,
            createdAt: g.created_at
        }));

        res.json({ gifs });
    } catch (error) {
        logger.error('❌ Get favorite GIFs error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/gifs/:gifId/favorite', authMiddleware, async (req, res) => {
    try {
        const { gifId } = req.params;

        // Check if GIF exists
        const gifCheck = await query('SELECT id FROM gifs WHERE id = $1', [gifId]);
        if (gifCheck.rows.length === 0) {
            return res.status(404).json({ error: 'GIF not found' });
        }

        const favId = uuidv4();

        try {
            await query(
                `INSERT INTO favorite_gifs (id, user_id, gif_id, created_at)
                 VALUES ($1, $2, $3, NOW())`,
                [favId, req.user.id, gifId]
            );

            logger.info('✅ GIF added to favorites:', gifId);
            res.status(201).json({ success: true });
        } catch (error) {
            // Unique constraint violation - already in favorites
            if (error.code === '23505') {
                return res.json({ success: true, already: true });
            }
            throw error;
        }
    } catch (error) {
        logger.error('❌ Add to favorites error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/gifs/:gifId/favorite', authMiddleware, async (req, res) => {
    try {
        const { gifId } = req.params;

        await query(
            `DELETE FROM favorite_gifs WHERE user_id = $1 AND gif_id = $2`,
            [req.user.id, gifId]
        );

        logger.info('✅ GIF removed from favorites:', gifId);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Remove from favorites error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// USER ROUTES
// ============================================

app.get('/api/v1/users/me', authMiddleware, async (req, res) => {
    try {
        // Автоматически выдаём badge разработчика
        if (isDeveloper(req.user.username)) {
            await query(`UPDATE users SET badges = array_append(COALESCE(badges,'{}'), 'developer') WHERE id = $1 AND NOT ('developer' = ANY(COALESCE(badges,'{}')))`, [req.user.id]);
            if (!req.user.badges) req.user.badges = [];
            if (!req.user.badges.includes('developer')) req.user.badges.push('developer');
        }
        // Premium badge
        if (req.user.is_premium) {
            await query(`UPDATE users SET badges = array_append(COALESCE(badges,'{}'), 'premium') WHERE id = $1 AND NOT ('premium' = ANY(COALESCE(badges,'{}')))`, [req.user.id]);
        }

        res.json({
            user: {
                id: req.user.id,
                username: req.user.username,
                firstName: req.user.first_name,
                lastName: req.user.last_name,
                bio: req.user.bio || '',
                avatarUrl: req.user.avatar_url || '',
                badge: req.user.badge || null,
                badges: req.user.badges || [],
                isBot: req.user.is_bot || false,
                isPremium: req.user.is_premium || false
            }
        });
    } catch (error) {
        logger.error('❌ Get user me error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// USER SETTINGS ROUTES
// ============================================

// Проверка доступности юзернейма
app.get('/api/v1/users/check-username', authMiddleware, async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.status(400).json({ error: 'username required' });
        const result = await query(
            'SELECT id FROM users WHERE username = $1 AND id != $2',
            [username.toLowerCase(), req.user.id]
        );
        res.json({ available: result.rows.length === 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Смена пароля
app.post('/api/v1/auth/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: req.t('bothPasswordsRequired') });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: req.t('passwordMin') });
        }
        const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (!result.rows[0]) return res.status(404).json({ error: req.t('userNotFound') });

        const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
        if (!valid) return res.status(401).json({ error: req.t('currentPasswordInvalid') });

        const newHash = await bcrypt.hash(newPassword, 10);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// 2FA — ДОПОЛНИТЕЛЬНЫЙ ПАРОЛЬ
// ============================================

app.get('/api/v1/auth/2fa/status', authMiddleware, async (req, res) => {
    try {
        const result = await query('SELECT two_fa_enabled FROM users WHERE id = $1', [req.user.id]);
        res.json({ enabled: result.rows[0]?.two_fa_enabled || false });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/v1/auth/2fa/enable', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ error: req.t('passwordMin') });
        }
        const hash = await bcrypt.hash(password, 10);
        await query('UPDATE users SET two_fa_hash = $1, two_fa_enabled = TRUE WHERE id = $2', [hash, req.user.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/v1/auth/2fa/disable', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;
        const result = await query('SELECT two_fa_hash FROM users WHERE id = $1', [req.user.id]);
        const hash = result.rows[0]?.two_fa_hash;
        if (!hash) return res.status(400).json({ error: req.t('twoFANotSet') });
        const match = await bcrypt.compare(password, hash);
        if (!match) return res.status(401).json({ error: req.t('invalidPassword') });
        await query('UPDATE users SET two_fa_hash = NULL, two_fa_enabled = FALSE WHERE id = $1', [req.user.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/v1/auth/2fa/verify', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;
        const result = await query('SELECT two_fa_hash, two_fa_enabled FROM users WHERE id = $1', [req.user.id]);
        const row = result.rows[0];
        if (!row?.two_fa_enabled) return res.json({ success: true, required: false });
        const match = await bcrypt.compare(password, row.two_fa_hash);
        if (!match) return res.status(401).json({ error: req.t('invalidAdditionalPassword') });
        res.json({ success: true, required: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// ALL SETTINGS (единый endpoint для синхронизации)
// ============================================

app.get('/api/v1/users/all-settings', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT settings, privacy_settings, notification_settings, sound_settings,
                    storage_settings, advanced_settings, folders,
                    passcode_enabled, passcode_timeout
             FROM user_settings WHERE user_id = $1`,
            [req.user.id]
        );
        const row = result.rows[0] || {};
        res.json({
            settings:             row.settings             || {},
            privacySettings:      row.privacy_settings     || {},
            notificationSettings: row.notification_settings|| {},
            soundSettings:        row.sound_settings       || {},
            storageSettings:      row.storage_settings     || {},
            advancedSettings:     row.advanced_settings    || {},
            folders:              row.folders              || [],
            passcodeEnabled:      row.passcode_enabled     || false,
            passcodeTimeout:      row.passcode_timeout     || 60
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/all-settings', authMiddleware, async (req, res) => {
    try {
        const {
            settings, privacySettings, notificationSettings,
            soundSettings, storageSettings, advancedSettings, folders
        } = req.body;

        const current = await query(
            `SELECT settings, privacy_settings, notification_settings, sound_settings,
                    storage_settings, advanced_settings, folders
             FROM user_settings WHERE user_id = $1`,
            [req.user.id]
        );
        const c = current.rows[0] || {};

        await query(
            `INSERT INTO user_settings
                (user_id, settings, privacy_settings, notification_settings,
                 sound_settings, storage_settings, advanced_settings, folders, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                settings             = COALESCE($2, user_settings.settings),
                privacy_settings     = COALESCE($3, user_settings.privacy_settings),
                notification_settings= COALESCE($4, user_settings.notification_settings),
                sound_settings       = COALESCE($5, user_settings.sound_settings),
                storage_settings     = COALESCE($6, user_settings.storage_settings),
                advanced_settings    = COALESCE($7, user_settings.advanced_settings),
                folders              = COALESCE($8, user_settings.folders),
                updated_at           = NOW()`,
            [
                req.user.id,
                settings             ? JSON.stringify({ ...(c.settings||{}),              ...settings })             : null,
                privacySettings      ? JSON.stringify({ ...(c.privacy_settings||{}),      ...privacySettings })      : null,
                notificationSettings ? JSON.stringify({ ...(c.notification_settings||{}), ...notificationSettings }) : null,
                soundSettings        ? JSON.stringify({ ...(c.sound_settings||{}),        ...soundSettings })        : null,
                storageSettings      ? JSON.stringify({ ...(c.storage_settings||{}),      ...storageSettings })      : null,
                advancedSettings     ? JSON.stringify({ ...(c.advanced_settings||{}),     ...advancedSettings })     : null,
                folders              ? JSON.stringify(folders)                                                        : null
            ]
        );

        if (settings?.language) {
            const lang = i18n.normalizeLanguage(settings.language);
            if (lang) {
                await query('UPDATE users SET language = $1 WHERE id = $2', [lang, req.user.id]);
                req.locale = lang;
            }
        }

        // Уведомляем другие устройства пользователя через WebSocket
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.userId === req.user.id) {
                client.send(JSON.stringify({ type: 'settings_updated' }));
            }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/v1/users/settings', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                settings: {
                    theme: 'dark',
                    notifications: true,
                    sounds: true,
                    language: 'ru'
                }
            });
        }
        
        res.json({ settings: result.rows[0].settings });
    } catch (error) {
        logger.error('❌ Get settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/settings', authMiddleware, async (req, res) => {
    try {
        const { theme, notifications, sounds, language, accentColor, fontSize } = req.body;
        
        const currentResult = await query(
            'SELECT settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        const currentSettings = currentResult.rows.length > 0 ? currentResult.rows[0].settings : {};
        
        const settings = {
            ...currentSettings,
            theme: theme !== undefined ? theme : currentSettings.theme || 'dark',
            notifications: notifications !== undefined ? notifications : currentSettings.notifications,
            sounds: sounds !== undefined ? sounds : currentSettings.sounds,
            language: language !== undefined ? language : currentSettings.language || 'ru',
            accentColor: accentColor !== undefined ? accentColor : currentSettings.accentColor || '#FF007F',
            fontSize: fontSize !== undefined ? fontSize : currentSettings.fontSize || 'medium'
        };
        
        await query(
            `INSERT INTO user_settings (user_id, settings, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) 
             DO UPDATE SET settings = $2, updated_at = NOW()`,
            [req.user.id, JSON.stringify(settings)]
        );

        if (language !== undefined) {
            const lang = i18n.normalizeLanguage(language);
            if (lang) await query('UPDATE users SET language = $1 WHERE id = $2', [lang, req.user.id]);
        }
        
        logger.info('✅ Settings updated for:', req.user.id);
        res.json({ success: true, settings });
    } catch (error) {
        logger.error('❌ Update settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PRIVACY SETTINGS ROUTES
// ============================================

app.get('/api/v1/users/privacy', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT privacy_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                privacy: {
                    lastSeen: 'all',
                    phoneVisibility: 'contacts',
                    photoVisibility: 'all',
                    messagesFromStrangers: true,
                    groupsAdd: 'all',
                    twoFactorAuth: false,
                    autoDeleteAccount: true
                }
            });
        }
        
        res.json({ privacy: result.rows[0].privacy_settings || {} });
    } catch (error) {
        logger.error('❌ Get privacy error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/privacy', authMiddleware, async (req, res) => {
    try {
        const currentResult = await query(
            'SELECT privacy_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        const currentPrivacy = currentResult.rows.length > 0 ? (currentResult.rows[0].privacy_settings || {}) : {};
        const updatedPrivacy = { ...currentPrivacy, ...req.body };
        
        await query(
            `INSERT INTO user_settings (user_id, privacy_settings, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) 
             DO UPDATE SET privacy_settings = $2, updated_at = NOW()`,
            [req.user.id, JSON.stringify(updatedPrivacy)]
        );
        
        logger.info('✅ Privacy settings updated for:', req.user.id);
        res.json({ success: true, privacy: updatedPrivacy });
    } catch (error) {
        logger.error('❌ Update privacy error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// BLOCKED USERS ROUTES
// ============================================

app.get('/api/v1/users/blocked', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, b.blocked_at
             FROM blocked_users b
             JOIN users u ON b.blocked_user_id = u.id
             WHERE b.user_id = $1
             ORDER BY b.blocked_at DESC`,
            [req.user.id]
        );
        
        const blocked = result.rows.map(u => ({
            id: u.id,
            username: u.username,
            firstName: u.first_name,
            lastName: u.last_name,
            avatarUrl: u.avatar_url,
            blockedAt: u.blocked_at
        }));
        
        res.json({ blocked });
    } catch (error) {
        logger.error('❌ Get blocked users error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/users/blocked', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Cannot block yourself' });
        }
        
        const userCheck = await query('SELECT id FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: req.t('userNotFound') });
        }
        
        const alreadyBlocked = await query(
            'SELECT id FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2',
            [req.user.id, userId]
        );
        
        if (alreadyBlocked.rows.length > 0) {
            return res.status(400).json({ error: 'User already blocked' });
        }
        
        await query(
            'INSERT INTO blocked_users (id, user_id, blocked_user_id, blocked_at) VALUES ($1, $2, $3, NOW())',
            [uuidv4(), req.user.id, userId]
        );
        
        logger.info('✅ User blocked:', userId);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Block user error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/users/blocked/:blockedUserId', authMiddleware, async (req, res) => {
    try {
        const { blockedUserId } = req.params;
        
        await query(
            'DELETE FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2',
            [req.user.id, blockedUserId]
        );
        
        logger.info('✅ User unblocked:', blockedUserId);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Unblock user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// DEVICES/SESSIONS ROUTES
// ============================================

app.post('/api/v1/users/devices/register', authMiddleware, async (req, res) => {
    try {
        const { deviceName, deviceType, userAgent, clientIP } = req.body;

        // Проверяем есть ли уже сессия для этого userAgent у этого пользователя
        const existing = await query(
            `SELECT id FROM user_sessions WHERE user_id = $1 AND user_agent = $2 LIMIT 1`,
            [req.user.id, userAgent]
        );

        if (existing.rows.length > 0) {
            const sessionId = existing.rows[0].id;
            await query(
                `UPDATE user_sessions SET last_active = NOW(), is_current = TRUE WHERE id = $1`,
                [sessionId]
            );
            await query(
                `UPDATE user_sessions SET is_current = FALSE WHERE user_id = $1 AND id != $2`,
                [req.user.id, sessionId]
            );
            return res.json({ success: true, sessionId });
        }

        const sessionId = uuidv4();

        // IP: приоритет clientIP (публичный), затем серверный
        const serverIP = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
        const ip = clientIP || serverIP;

        // Геолокация по IP
        let location = req.t('unknown');
        try {
            const isLocal = !ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.');
            if (!isLocal) {
                const http = require('http');
                const geoData = await new Promise((resolve, reject) => {
                    http.get(`http://ip-api.com/json/${ip}?fields=city,country&lang=${encodeURIComponent(req.locale || 'ru')}`, (r) => {
                        let data = '';
                        r.on('data', chunk => data += chunk);
                        r.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
                    }).on('error', reject);
                });
                if (geoData.city) location = `${geoData.city}, ${geoData.country}`;
                else if (geoData.country) location = geoData.country;
            } else {
                location = req.t('localNetwork');
            }
        } catch (e) {
            logger.warn('⚠️ Geo lookup failed:', e.message);
        }
        
        await query(
            `INSERT INTO user_sessions (id, user_id, device_name, device_type, ip_address, location, user_agent, last_active, first_login, is_current)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), TRUE)`,
            [sessionId, req.user.id, deviceName, deviceType, ip, location, userAgent]
        );

        await query(
            `UPDATE user_sessions SET is_current = FALSE WHERE user_id = $1 AND id != $2`,
            [req.user.id, sessionId]
        );
        
        logger.info('✅ Session registered:', sessionId);
        res.json({ success: true, sessionId });
    } catch (error) {
        logger.error('❌ Register session error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/v1/users/devices', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT id, device_name, device_type, ip_address, location, 
                    last_active, first_login, is_current
             FROM user_sessions 
             WHERE user_id = $1 
             ORDER BY last_active DESC`,
            [req.user.id]
        );
        
        res.json({ devices: result.rows });
    } catch (error) {
        logger.error('❌ Get devices error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/users/devices/:sessionId', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const sessionCheck = await query(
            'SELECT id, is_current FROM user_sessions WHERE id = $1 AND user_id = $2',
            [sessionId, req.user.id]
        );
        
        if (sessionCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        if (sessionCheck.rows[0].is_current) {
            return res.status(400).json({ error: 'Cannot terminate current session' });
        }
        
        await query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
        
        logger.info('✅ Session terminated:', sessionId);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Delete device error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/users/devices/terminate-all', authMiddleware, async (req, res) => {
    try {
        const currentSession = await query(
            'SELECT id FROM user_sessions WHERE user_id = $1 AND is_current = TRUE LIMIT 1',
            [req.user.id]
        );
        
        const currentSessionId = currentSession.rows.length > 0 ? currentSession.rows[0].id : null;
        
        if (currentSessionId) {
            await query(
                `DELETE FROM user_sessions WHERE user_id = $1 AND id != $2`,
                [req.user.id, currentSessionId]
            );
        } else {
            await query(`DELETE FROM user_sessions WHERE user_id = $1`, [req.user.id]);
        }
        
        logger.info('✅ All other sessions terminated for:', req.user.id);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Terminate all devices error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// NOTIFICATION SETTINGS ROUTES
// ============================================

app.get('/api/v1/users/notifications', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT notification_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                settings: {
                    privateChats: true,
                    groups: true,
                    channels: true,
                    calls: true,
                    videoCalls: true,
                    inAppNotifications: true,
                    messagePreview: true,
                    readReceipts: false,
                    reactions: true,
                    newContacts: true
                }
            });
        }
        
        res.json({ settings: result.rows[0].notification_settings || {} });
    } catch (error) {
        logger.error('❌ Get notification settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/notifications', authMiddleware, async (req, res) => {
    try {
        const currentResult = await query(
            'SELECT notification_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        const currentSettings = currentResult.rows.length > 0 ? (currentResult.rows[0].notification_settings || {}) : {};
        const updatedSettings = { ...currentSettings, ...req.body };
        
        await query(
            `INSERT INTO user_settings (user_id, notification_settings, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) 
             DO UPDATE SET notification_settings = $2, updated_at = NOW()`,
            [req.user.id, JSON.stringify(updatedSettings)]
        );
        
        res.json({ success: true, settings: updatedSettings });
    } catch (error) {
        logger.error('❌ Update notification settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// SOUND SETTINGS ROUTES
// ============================================

app.get('/api/v1/users/sounds', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT sound_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                settings: {
                    notificationsVolume: 80,
                    mediaVolume: 100,
                    notificationsSound: true,
                    messagesSound: true,
                    sendSound: true,
                    callsSound: true,
                    vibrateOnCall: true,
                    notificationSound: 'default',
                    messageSound: 'default',
                    ringtone: 'default'
                }
            });
        }
        
        res.json({ settings: result.rows[0].sound_settings || {} });
    } catch (error) {
        logger.error('❌ Get sound settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/sounds', authMiddleware, async (req, res) => {
    try {
        const currentResult = await query(
            'SELECT sound_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        const currentSettings = currentResult.rows.length > 0 ? (currentResult.rows[0].sound_settings || {}) : {};
        const updatedSettings = { ...currentSettings, ...req.body };
        
        await query(
            `INSERT INTO user_settings (user_id, sound_settings, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) 
             DO UPDATE SET sound_settings = $2, updated_at = NOW()`,
            [req.user.id, JSON.stringify(updatedSettings)]
        );
        
        res.json({ success: true, settings: updatedSettings });
    } catch (error) {
        logger.error('❌ Update sound settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// STORAGE ROUTES
// ============================================

app.get('/api/v1/users/storage', authMiddleware, async (req, res) => {
    try {
        // Размер текстовых сообщений
        const msgResult = await query(
            `SELECT COALESCE(SUM(LENGTH(content)), 0) as size FROM messages WHERE sender_id = $1 AND is_deleted = FALSE`,
            [req.user.id]
        );

        // Размер медиафайлов (фото/видео) — считаем по файлам на диске
        const mediaResult = await query(
            `SELECT media_url FROM messages WHERE sender_id = $1 AND media_url IS NOT NULL AND is_deleted = FALSE`,
            [req.user.id]
        );

        let mediaSize = 0;
        let filesSize = 0;
        const path = require('path');
        const fs = require('fs');
        for (const row of mediaResult.rows) {
            try {
                const filePath = path.join(__dirname, '../../', row.media_url);
                if (fs.existsSync(filePath)) {
                    const stat = fs.statSync(filePath);
                    const isMedia = /\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i.test(row.media_url);
                    if (isMedia) mediaSize += stat.size;
                    else filesSize += stat.size;
                }
            } catch (_) {}
        }

        // Кэш — размер localStorage приблизительно (серверная сторона не знает, даём 0)
        const storage = {
            messages: parseInt(msgResult.rows[0]?.size || 0),
            media: mediaSize,
            files: filesSize,
            cache: 0
        };

        const settingsResult = await query(
            'SELECT storage_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );

        res.json({
            storage,
            settings: settingsResult.rows[0]?.storage_settings || {}
        });
    } catch (error) {
        logger.error('❌ Get storage error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/storage/settings', authMiddleware, async (req, res) => {
    try {
        const currentResult = await query(
            'SELECT storage_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        const currentSettings = currentResult.rows.length > 0 ? (currentResult.rows[0].storage_settings || {}) : {};
        const updatedSettings = { ...currentSettings, ...req.body };
        
        await query(
            `INSERT INTO user_settings (user_id, storage_settings, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) 
             DO UPDATE SET storage_settings = $2, updated_at = NOW()`,
            [req.user.id, JSON.stringify(updatedSettings)]
        );
        
        res.json({ success: true, settings: updatedSettings });
    } catch (error) {
        logger.error('❌ Update storage settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/users/storage/cache', authMiddleware, async (req, res) => {
    try {
        logger.info('✅ Cache cleared for:', req.user.id);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Clear cache error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/users/storage/all', authMiddleware, async (req, res) => {
    try {
        await query('DELETE FROM messages WHERE sender_id = $1', [req.user.id]);
        await query('DELETE FROM chat_members WHERE user_id = $1', [req.user.id]);
        await query('DELETE FROM user_settings WHERE user_id = $1', [req.user.id]);
        await query('DELETE FROM user_sessions WHERE user_id = $1', [req.user.id]);
        await query('DELETE FROM blocked_users WHERE user_id = $1', [req.user.id]);
        
        logger.info('✅ All data deleted for:', req.user.id);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Delete all data error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// FOLDERS ROUTES
// ============================================

app.get('/api/v1/users/folders', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT folders FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        res.json({ folders: result.rows[0]?.folders || [] });
    } catch (error) {
        logger.error('❌ Get folders error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/folders', authMiddleware, async (req, res) => {
    try {
        const { folders } = req.body;
        
        await query(
            `INSERT INTO user_settings (user_id, folders, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) 
             DO UPDATE SET folders = $2, updated_at = NOW()`,
            [req.user.id, JSON.stringify(folders)]
        );
        
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Update folders error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PASSCODE ROUTES
// ============================================

app.get('/api/v1/users/passcode', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT passcode_enabled, passcode_timeout FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        const row = result.rows[0] || {};
        res.json({ enabled: row.passcode_enabled || false, timeout: row.passcode_timeout || 60 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/users/passcode/set', authMiddleware, async (req, res) => {
    try {
        const { passcode } = req.body;
        if (!passcode || passcode.length < 4) return res.status(400).json({ error: 'Passcode must be at least 4 digits' });
        const hash = await bcrypt.hash(passcode, 10);
        await query(
            `INSERT INTO user_settings (user_id, passcode_hash, passcode_enabled, updated_at)
             VALUES ($1, $2, TRUE, NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET passcode_hash = $2, passcode_enabled = TRUE, updated_at = NOW()`,
            [req.user.id, hash]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/users/passcode/verify', authMiddleware, async (req, res) => {
    try {
        const { passcode } = req.body;
        const result = await query(
            'SELECT passcode_hash FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        if (!result.rows[0]?.passcode_hash) return res.status(400).json({ error: req.t('noPasscodeSet') });
        const match = await bcrypt.compare(passcode, result.rows[0].passcode_hash);
        if (match) res.json({ success: true });
        else res.status(401).json({ error: 'Wrong passcode' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/users/passcode/disable', authMiddleware, async (req, res) => {
    try {
        const { passcode } = req.body;
        const result = await query(
            'SELECT passcode_hash FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        if (!result.rows[0]?.passcode_hash) return res.status(400).json({ error: req.t('noPasscodeSet') });
        const match = await bcrypt.compare(passcode, result.rows[0].passcode_hash);
        if (!match) return res.status(401).json({ error: 'Wrong passcode' });
        await query(
            `UPDATE user_settings SET passcode_hash = NULL, passcode_enabled = FALSE, updated_at = NOW() WHERE user_id = $1`,
            [req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/passcode/timeout', authMiddleware, async (req, res) => {
    try {
        const { timeout } = req.body;
        await query(
            `INSERT INTO user_settings (user_id, passcode_timeout, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET passcode_timeout = $2, updated_at = NOW()`,
            [req.user.id, timeout]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ADVANCED SETTINGS ROUTES
// ============================================

app.get('/api/v1/users/advanced-settings', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT advanced_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                settings: {
                    autoReconnect: true,
                    fastConnection: true,
                    connectionType: 'auto',
                    dataCompression: true,
                    saveDrafts: true,
                    analytics: false,
                    developerMode: false,
                    debugLog: false,
                    hardwareAcceleration: true,
                    autoplayGifs: true
                }
            });
        }
        
        res.json({ settings: result.rows[0].advanced_settings || {} });
    } catch (error) {
        logger.error('❌ Get advanced settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/advanced-settings', authMiddleware, async (req, res) => {
    try {
        const currentResult = await query(
            'SELECT advanced_settings FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        const currentSettings = currentResult.rows.length > 0 ? (currentResult.rows[0].advanced_settings || {}) : {};
        const updatedSettings = { ...currentSettings, ...req.body };
        
        await query(
            `INSERT INTO user_settings (user_id, advanced_settings, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id) 
             DO UPDATE SET advanced_settings = $2, updated_at = NOW()`,
            [req.user.id, JSON.stringify(updatedSettings)]
        );
        
        res.json({ success: true, settings: updatedSettings });
    } catch (error) {
        logger.error('❌ Update advanced settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// EXPORT DATA ROUTE
// ============================================

app.get('/api/v1/users/export', authMiddleware, async (req, res) => {
    try {
        const userResult = await query(
            'SELECT id, username, first_name, last_name, bio, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        
        const chatsResult = await query(
            `SELECT c.id, c.title, c.type, c.created_at 
             FROM chats c 
             JOIN chat_members cm ON c.id = cm.chat_id 
             WHERE cm.user_id = $1`,
            [req.user.id]
        );
        
        const settingsResult = await query(
            'SELECT * FROM user_settings WHERE user_id = $1',
            [req.user.id]
        );
        
        const exportData = {
            user: userResult.rows[0],
            chats: chatsResult.rows,
            settings: settingsResult.rows[0],
            exportedAt: new Date().toISOString()
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="craneapp_data.json"');
        res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
        logger.error('❌ Export data error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PREMIUM ROUTES
// ============================================

app.post('/api/v1/premium/subscribe', authMiddleware, async (req, res) => {
    try {
        const { plan } = req.body;
        logger.info('✅ Premium subscription initiated for:', req.user.id, 'plan:', plan);
        res.json({ success: true, message: 'Premium subscription initiated', plan: plan });
    } catch (error) {
        logger.error('❌ Premium subscribe error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// USER SEARCH & PROFILE ROUTES
// ============================================

app.get('/api/v1/users/search', authMiddleware, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 1) {
            return res.status(400).json({ error: 'Minimum 1 character' });
        }

        const result = await query(
            `SELECT id, username, first_name, last_name, avatar_url
             FROM users
             WHERE (username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1 OR CONCAT(first_name, ' ', last_name) ILIKE $1)
             AND id != $2
             LIMIT 50`,
            [`%${q}%`, req.user.id]
        );

        res.status(200).json({
            users: result.rows.map(u => ({
                id: u.id,
                username: u.username,
                firstName: u.first_name,
                lastName: u.last_name,
                avatarUrl: u.avatar_url
            }))
        });
    } catch (error) {
        logger.error('❌ Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/v1/messages/search', authMiddleware, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 1) {
            return res.status(400).json({ error: 'Minimum 1 character' });
        }

        const result = await query(
            `SELECT m.id, m.chat_id, m.sender_id, m.content, m.content_plain, m.created_at, m.media_type, m.media_url,
                    c.type as chat_type, c.name as chat_name,
                    u.username, u.first_name, u.last_name, u.avatar_url
             FROM messages m
             JOIN chats c ON m.chat_id = c.id
             JOIN users u ON m.sender_id = u.id
             JOIN chat_members cp ON c.id = cp.chat_id
             WHERE cp.user_id = $1
             AND (m.content_plain ILIKE $2 OR (m.content_plain IS NULL AND m.content ILIKE $2))
             ORDER BY m.created_at DESC
             LIMIT 50`,
            [req.user.id, `%${q}%`]
        );

        res.status(200).json({
            messages: result.rows.map(m => ({
                id: m.id,
                chatId: m.chat_id,
                senderId: m.sender_id,
                content: m.content_plain || m.content,
                createdAt: m.created_at,
                mediaType: m.media_type,
                mediaUrl: m.media_url,
                chatType: m.chat_type,
                chatName: m.chat_name,
                senderUsername: m.username,
                senderFirstName: m.first_name,
                senderLastName: m.last_name,
                senderAvatarUrl: m.avatar_url
            }))
        });
    } catch (error) {
        logger.error('❌ Message search error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/profile', authMiddleware, async (req, res) => {
    try {
        const { firstName, lastName, bio, avatar } = req.body;
        const userId = req.user.id;
        
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (firstName !== undefined) {
            updates.push(`first_name = $${paramIndex++}`);
            values.push(firstName);
        }
        
        if (lastName !== undefined) {
            updates.push(`last_name = $${paramIndex++}`);
            values.push(lastName);
        }
        
        if (bio !== undefined) {
            updates.push(`bio = $${paramIndex++}`);
            values.push(bio);
        }
        
        if (avatar !== undefined) {
            const avatarUrl = handleFileUpload(avatar, 'avatar');
            updates.push(`avatar_url = $${paramIndex++}`);
            values.push(avatarUrl);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        values.push(userId);
        
        const result = await query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, first_name, last_name, bio, avatar_url`,
            values
        );
        
        const user = result.rows[0];
        
        logger.info('✅ Profile updated for:', userId);
        res.json({ 
            success: true,
            user: {
                id: user.id,
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
                bio: user.bio || '',
                avatarUrl: user.avatar_url || ''
            }
        });
    } catch (error) {
        logger.error('❌ Update profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/users/avatar', authMiddleware, async (req, res) => {
    try {
        const { avatar } = req.body;
        
        if (!avatar) {
            return res.status(400).json({ error: 'Avatar required' });
        }
        
        const avatarUrl = handleFileUpload(avatar, 'avatar');
        await query(`UPDATE users SET avatar_url = $1 WHERE id = $2`, [avatarUrl, req.user.id]);
        
        logger.info('✅ Avatar updated for:', req.user.id);
        res.json({ success: true, avatarUrl });
    } catch (error) {
        logger.error('❌ Update avatar error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/v1/users/:userId/profile', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await query(
            `SELECT id, username, first_name, last_name, bio, avatar_url, is_blocked, is_muted, muted_until FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: req.t('userNotFound') });
        }

        const user = result.rows[0];
        res.json({
            user: {
                id: user.id,
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
                bio: user.bio,
                avatarUrl: user.avatar_url,
                isBlocked: user.is_blocked,
                isMuted: user.is_muted,
                mutedUntil: user.muted_until
            }
        });
    } catch (error) {
        logger.error('❌ Get user profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// CHAT ROUTES
// ============================================

app.get('/api/v1/users/:userId/status', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await query(
            `SELECT u.id, u.last_seen, u.is_online,
                    us.privacy_settings
             FROM users u
             LEFT JOIN user_settings us ON us.user_id = u.id
             WHERE u.id = $1`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: req.t('userNotFound') });
        }
        
        const user = result.rows[0];
        const privacy = user.privacy_settings || {};
        const lastSeenSetting = privacy.lastSeen || 'all';

        // Проверяем настройку lastSeen
        let isOnline = user.is_online;
        let lastSeen = user.last_seen;

        if (lastSeenSetting === 'none') {
            // Скрыть полностью — не показываем ни онлайн, ни время
            isOnline = false;
            lastSeen = null;
        } else if (lastSeenSetting === 'contacts') {
            // Показывать только контактам — проверяем есть ли приватный чат
            const contactCheck = await query(
                `SELECT 1 FROM chats c
                 JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
                 JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
                 WHERE c.type = 'private' LIMIT 1`,
                [userId, req.user.id]
            );
            if (contactCheck.rows.length === 0) {
                isOnline = false;
                lastSeen = null;
            }
        }
        // lastSeenSetting === 'all' — показываем всем, ничего не меняем

        res.json({ 
            userId: user.id,
            isOnline,
            lastSeen
        });
    } catch (error) {
        logger.error('❌ Get user status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Генерация QR-кода для пользователя
app.get('/api/v1/users/qr-code', authMiddleware, async (req, res) => {
    try {
        const { username } = req.query;
        
        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }
        
        // Проверяем что пользователь существует
        const userResult = await query(
            'SELECT id, username FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: req.t('userNotFound') });
        }
        
        // Формируем URL для QR-кода (deep link для приложения)
        const host = req.get('host');
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const qrUrl = `${protocol}://${host}/user/@${username}`;
        
        // Генерируем base64 PNG через qrcode
        const qrImageBase64 = await QRCode.toDataURL(qrUrl, {
            width: 256,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        });
        
        res.json({ qrCode: qrImageBase64, username });
    } catch (error) {
        logger.error('QR code generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Создание жалобы
app.post('/api/v1/reports', authMiddleware, async (req, res) => {
    try {
        const { reportedUserId, reason, description } = req.body;
        
        if (!reportedUserId || !reason) {
            return res.status(400).json({ error: 'reportedUserId and reason are required' });
        }
        
        // Проверяем что пользователь существует
        const userResult = await query(
            'SELECT id, username FROM users WHERE id = $1',
            [reportedUserId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: req.t('userNotFound') });
        }
        
        // Создаём жалобу
        const reportId = uuidv4();
        await query(
            `INSERT INTO reports (id, reporter_id, reported_user_id, reason, description, status, created_at)
             VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
            [reportId, req.user.id, reportedUserId, reason, description || null]
        );
        
        res.json({ success: true, reportId });
    } catch (error) {
        logger.error('Report creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получение списка жалоб (только для разработчиков)
app.get('/api/v1/reports', authMiddleware, async (req, res) => {
    try {
        // Проверяем что пользователь разработчик
        const devUsers = ['adm1', 'admin', 'admin1', 'qzlfee'];
        if (!devUsers.includes((req.user.username || '').toLowerCase())) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        
        const result = await query(
            `SELECT r.*, 
                    u.username as reported_username,
                    u.first_name as reported_first_name,
                    u.avatar_url as reported_avatar_url,
                    ru.username as reporter_username
             FROM reports r
             LEFT JOIN users u ON r.reported_user_id = u.id
             LEFT JOIN users ru ON r.reporter_id = ru.id
             ORDER BY r.created_at DESC`
        );
        
        res.json({ reports: result.rows });
    } catch (error) {
        logger.error('Get reports error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получение деталей жалобы
app.get('/api/v1/reports/:reportId', authMiddleware, async (req, res) => {
    try {
        const { reportId } = req.params;
        
        // Проверяем что пользователь разработчик
        const devUsers = ['adm1', 'admin', 'admin1', 'qzlfee'];
        if (!devUsers.includes((req.user.username || '').toLowerCase())) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        
        const result = await query(
            `SELECT r.*, 
                    u.username as reported_username,
                    u.first_name as reported_first_name,
                    u.avatar_url as reported_avatar_url,
                    ru.username as reporter_username
             FROM reports r
             LEFT JOIN users u ON r.reported_user_id = u.id
             LEFT JOIN users ru ON r.reporter_id = ru.id
             WHERE r.id = $1`,
            [reportId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        res.json({ report: result.rows[0] });
    } catch (error) {
        logger.error('Get report details error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Простить пользователя (снять все жалобы)
app.post('/api/v1/users/:userId/forgive', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Проверяем что пользователь разработчик
        const devUsers = ['adm1', 'admin', 'admin1', 'qzlfee'];
        if (!devUsers.includes((req.user.username || '').toLowerCase())) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Снимаем блокировку с пользователя
        await query(
            `UPDATE users SET is_blocked = FALSE WHERE id = $1`,
            [userId]
        );

        // Обновляем статус всех жалоб на пользователя
        await query(
            `UPDATE reports SET status = 'resolved' WHERE reported_user_id = $1 AND status = 'pending'`,
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        logger.error('Forgive user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Замутить пользователя
app.post('/api/v1/users/:userId/mute', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { duration, reason } = req.body;

        // Проверяем что пользователь разработчик
        const devUsers = ['adm1', 'admin', 'admin1', 'qzlfee'];
        if (!devUsers.includes((req.user.username || '').toLowerCase())) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        let mutedUntil = null;
        if (duration !== 'forever') {
            const now = new Date();
            switch (duration) {
                case '1h':
                    mutedUntil = new Date(now.getTime() + 60 * 60 * 1000);
                    break;
                case '6h':
                    mutedUntil = new Date(now.getTime() + 6 * 60 * 60 * 1000);
                    break;
                case '1d':
                    mutedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    break;
                case '1w':
                    mutedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    break;
                case '1m':
                    mutedUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                    break;
            }
        }

        await query(
            `UPDATE users SET is_muted = TRUE, muted_until = $1, mute_reason = $2 WHERE id = $3`,
            [mutedUntil, reason || null, userId]
        );

        // Обновляем статус всех активных жалоб на этого пользователя на resolved
        await query(
            `UPDATE reports SET status = 'resolved' WHERE reported_user_id = $1 AND status = 'pending'`,
            [userId]
        );

        res.json({ success: true, mutedUntil });
    } catch (error) {
        logger.error('Mute user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Заблокировать пользователя
app.post('/api/v1/users/:userId/block', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { duration, reason } = req.body;

        // Проверяем что пользователь разработчик
        const devUsers = ['adm1', 'admin', 'admin1', 'qzlfee'];
        if (!devUsers.includes((req.user.username || '').toLowerCase())) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Блокируем пользователя (перманентно или временно)
        // Для бана всегда перманентно, параметр duration игнорируется
        await query(
            `UPDATE users SET is_blocked = TRUE, block_reason = $1 WHERE id = $2`,
            [reason || null, userId]
        );

        // Обновляем статус всех жалоб
        await query(
            `UPDATE reports SET status = 'resolved' WHERE reported_user_id = $1 AND status = 'pending'`,
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        logger.error('Block user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Размутить пользователя
app.post('/api/v1/users/:userId/unmute', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Проверяем что пользователь разработчик
        const devUsers = ['adm1', 'admin', 'admin1', 'qzlfee'];
        if (!devUsers.includes((req.user.username || '').toLowerCase())) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await query(
            `UPDATE users SET is_muted = FALSE, muted_until = NULL, mute_reason = NULL WHERE id = $1`,
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        logger.error('Unmute user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Разбанить пользователя
app.post('/api/v1/users/:userId/unblock', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Проверяем что пользователь разработчик
        const devUsers = ['adm1', 'admin', 'admin1', 'qzlfee'];
        if (!devUsers.includes((req.user.username || '').toLowerCase())) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await query(
            `UPDATE users SET is_blocked = FALSE, block_reason = NULL WHERE id = $1`,
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        logger.error('Unblock user error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/v1/chats', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT c.*,
                    cm.role,
                    cm.muted_until AS user_muted_until,
                    COALESCE(ucs.is_pinned, FALSE)   AS user_is_pinned,
                    ucs.pinned_at                     AS user_pinned_at,
                    COALESCE(ucs.is_archived, FALSE)  AS user_is_archived,
                    COALESCE(unread.unread_count, 0)   AS unread_count,
                    lm.content      AS last_message_content,
                    lm.type         AS last_message_type,
                    lm.sender_id    AS last_message_sender_id,
                    lm.is_encrypted AS last_message_encrypted,
                    lm.encryption_iv AS last_message_iv,
                    lm.created_at   AS last_message_at,
                    ucs.mention_read_at AS mention_read_at,
                    COALESCE(mentions.mention_count, 0) AS mention_count,
                    mentions.latest_mention_at AS latest_mention_at,
                    mentions.oldest_mention_message_id AS oldest_mention_message_id
             FROM chats c
             JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
             LEFT JOIN user_chat_settings ucs ON ucs.chat_id = c.id AND ucs.user_id = $1
             LEFT JOIN LATERAL (
                 SELECT content, type, sender_id, is_encrypted, encryption_iv, created_at
                 FROM messages
                 WHERE chat_id = c.id AND is_deleted = FALSE
                   AND parent_message_id IS NULL
                   AND (scheduled_at IS NULL OR published_at IS NOT NULL)
                 ORDER BY created_at DESC
                 LIMIT 1
             ) lm ON TRUE
             LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS unread_count
                 FROM messages m
                 WHERE m.chat_id = c.id
                   AND m.is_deleted = FALSE
                   AND m.sender_id <> $1
                   AND (ucs.last_read_at IS NULL OR m.created_at > ucs.last_read_at)
             ) unread ON TRUE
             LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS mention_count,
                        MAX(mm.created_at) AS latest_mention_at,
                        (ARRAY_AGG(mm.message_id ORDER BY mm.created_at ASC))[1] AS oldest_mention_message_id
                 FROM message_mentions mm
                 JOIN messages m ON m.id = mm.message_id AND m.is_deleted = FALSE
                 WHERE mm.chat_id = c.id
                   AND mm.user_id = $1
                   AND c.type = 'group'
                   AND (ucs.mention_read_at IS NULL OR mm.created_at > ucs.mention_read_at)
             ) mentions ON TRUE
             WHERE COALESCE(ucs.is_archived, FALSE) = FALSE
             ORDER BY user_is_pinned DESC, user_pinned_at DESC NULLS LAST, lm.created_at DESC NULLS LAST`,
            [req.user.id]
        );
        
        const chats = result.rows.map(c => ({
            id: c.id,
            type: c.type,
            title: c.title,
            ownerId: c.owner_id,
            avatarUrl: c.avatar_url,
            username: c.username || null,
            isPublic: c.is_public || false,
            discussionChatId: c.discussion_chat_id || null,
            role: c.role,
            isSupergroup: c.is_supergroup || false,
            mutedUntil: c.user_muted_until || null,
            isPinned: c.user_is_pinned || false,
            isArchived: c.user_is_archived || false,
            pinnedAt: c.user_pinned_at,
            lastMessageAt: c.last_message_at,
            lastMessage: c.last_message_content || '',
            lastMessageEncrypted: c.last_message_encrypted || false,
            lastMessageIv: c.last_message_iv || null,
            lastMessageType: c.last_message_type || 'text',
            lastMessageSenderId: c.last_message_sender_id,
            unreadCount: c.unread_count || 0,
            mentionCount: c.mention_count || 0,
            latestMentionAt: c.latest_mention_at || null,
            oldestMentionMessageId: c.oldest_mention_message_id || null,
            mentionReadAt: c.mention_read_at || null
        }));
        
        res.json({ chats });
    } catch (error) {
        logger.error('❌ Get chats error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/v1/chats/:chatId/members', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const search = req.query.search ? req.query.search.trim() : '';
        
        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );

        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        const chatRes = await query('SELECT is_supergroup FROM chats WHERE id = $1', [chatId]);
        const isSuper = chatRes.rows[0]?.is_supergroup || false;

        let queryStr = `
            SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, u.last_seen, u.badge, u.badges, u.is_bot, u.is_premium, u.is_blocked, cm.role, cm.permissions, cm.muted_until,
                    CASE
                        WHEN u.last_seen > NOW() - INTERVAL '5 minutes' THEN TRUE
                        ELSE FALSE
                    END as is_online
             FROM chat_members cm JOIN users u ON cm.user_id = u.id
             WHERE cm.chat_id = $1
        `;
        const params = [chatId];
        let paramIdx = 2;

        if (search) {
            queryStr += ` AND (u.username ILIKE $${paramIdx} OR u.first_name ILIKE $${paramIdx} OR u.last_name ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        if (isSuper || req.query.limit || req.query.offset) {
            queryStr += ` ORDER BY cm.joined_at ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
            params.push(limit, offset);
        } else {
            queryStr += ` ORDER BY cm.joined_at ASC`;
        }

        const result = await query(queryStr, params);
        
        res.json({
            members: result.rows.map(m => ({
                id: m.id,
                username: m.username,
                first_name: m.first_name,
                last_name: m.last_name,
                avatar_url: m.avatar_url,
                role: m.role,
                permissions: m.permissions || {},
                muted_until: m.muted_until || null,
                last_seen: m.last_seen,
                is_online: m.is_online,
                badge: m.badge || null,
                badges: m.badges || [],
                is_bot: m.is_bot || false,
                is_premium: m.is_premium || false,
                is_blocked: m.is_blocked || false
            }))
        });
    } catch (error) {
        logger.error('❌ Get members error:', error);
        res.status(500).json({ error: error.message });
    }
});

// СОЗДАНИЕ ГРУППЫ
app.post('/api/v1/chats/create-group', authMiddleware, async (req, res) => {
    try {
        const { title, description, members, avatar } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ error: req.t('titleRequired') });
        if (!members || !Array.isArray(members) || members.length === 0) return res.status(400).json({ error: req.t('membersRequired') });

        // Проверяем настройки приватности участников
        const allMembers = [...new Set([req.user.id, ...members])];

        // Проверяем groupsAdd для каждого участника
        for (const memberId of members) {
            if (memberId === req.user.id) continue;
            const privResult = await query(
                'SELECT privacy_settings FROM user_settings WHERE user_id = $1',
                [memberId]
            );
            const privacy = privResult.rows[0]?.privacy_settings || {};
            const groupsAdd = privacy.groupsAdd || 'all';
            if (groupsAdd === 'none') {
                const userInfo = await query('SELECT first_name, username FROM users WHERE id = $1', [memberId]);
                const name = userInfo.rows[0]?.first_name || userInfo.rows[0]?.username || req.t('user');
                return res.status(403).json({ error: req.t('groupAddPrivacyNone', { name }) });
            }
            if (groupsAdd === 'contacts') {
                // Проверяем есть ли чат между создателем и участником
                const chatCheck = await query(
                    `SELECT 1 FROM chats c
                     JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
                     JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
                     WHERE c.type = 'private' LIMIT 1`,
                    [memberId, req.user.id]
                );
                if (!chatCheck.rows.length) {
                    const userInfo = await query('SELECT first_name, username FROM users WHERE id = $1', [memberId]);
                    const name = userInfo.rows[0]?.first_name || userInfo.rows[0]?.username || req.t('user');
                    return res.status(403).json({ error: req.t('groupAddPrivacyContacts', { name }) });
                }
            }
        }
        const chatId = uuidv4();

        let avatarUrl = null;
        if (avatar) {
            try { avatarUrl = handleFileUpload(avatar, 'avatar'); } catch (_) {}
        }

        await query(
            `INSERT INTO chats (id, type, title, description, owner_id, avatar_url, created_at)
             VALUES ($1, 'group', $2, $3, $4, $5, NOW())`,
            [chatId, title.trim(), description || '', req.user.id, avatarUrl]
        );

        const memberValues = allMembers.map((uid, i) =>
            `($1, $${i + 2}, '${uid === req.user.id ? 'owner' : 'member'}', NOW())`
        ).join(', ');
        await query(
            `INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES ${memberValues}`,
            [chatId, ...allMembers]
        );
        await checkAndUpgradeToSupergroup(chatId);

        // Системное сообщение
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [uuidv4(), chatId, systemSenderId, req.t('groupCreatedSystem', { name: `"${title.trim()}"` })]
        );

        // Уведомляем участников
        await broadcastToChat(chatId, { type: 'new_chat', chatId, chatType: 'group', title: title.trim() }, null);

        logger.info('✅ Group created:', chatId);
        res.status(201).json({ chatId, title: title.trim() });
    } catch (error) {
        logger.error('❌ Create group error:', error);
        res.status(500).json({ error: error.message });
    }
});

registerChannelRoutes(app, {
    authMiddleware,
    query,
    uuidv4,
    broadcastToChat,
    handleFileUpload,
    logger
});

// УЧАСТНИКИ ГРУППЫ + онлайн статус
app.get('/api/v1/chats/:chatId/members-online', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const result = await query(
            `SELECT u.id, u.username, u.first_name, u.last_name, u.avatar_url, u.is_bot, cm.role, cm.muted_until,
                    CASE WHEN u.is_bot = TRUE THEN FALSE
                         WHEN u.last_seen > NOW() - INTERVAL '5 minutes' THEN TRUE
                         ELSE FALSE END as is_online
             FROM chat_members cm JOIN users u ON cm.user_id = u.id
             WHERE cm.chat_id = $1`,
            [chatId]
        );
        const members = result.rows;
        // Онлайн считаем только живых пользователей (не ботов)
        const onlineCount = members.filter(m => m.is_online && !m.is_bot).length;
        res.json({
            members: members.map(m => ({
                id: m.id,
                username: m.username,
                firstName: m.first_name,
                lastName: m.last_name,
                avatarUrl: m.avatar_url,
                role: m.role,
                isBot: m.is_bot || false,
                isOnline: m.is_online,
                mutedUntil: m.muted_until || null
            })),
            total: members.length,
            online: onlineCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ДОБАВЛЕНИЕ УЧАСТНИКА В ГРУППУ
app.post('/api/v1/chats/:chatId/members', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // Проверяем, что чат существует и является группой
        const chatCheck = await query('SELECT type, title FROM chats WHERE id = $1', [chatId]);
        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        if (chatCheck.rows[0].type !== 'group') {
            return res.status(400).json({ error: 'Chat is not a group' });
        }

        // Проверяем, что текущий пользователь состоит в группе и имеет права
        const callerCheck = await query(
            'SELECT role, permissions FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (callerCheck.rows.length === 0) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        const caller = callerCheck.rows[0];
        if (caller.role === 'admin') {
            const perms = caller.permissions || {};
            if (perms.can_invite_users === false || perms.can_invite_users === 'false') {
                return res.status(403).json({ error: 'You do not have permission to invite users to this group' });
            }
        }

        // Проверяем, существует ли целевой пользователь
        const targetUserCheck = await query('SELECT id, first_name, username FROM users WHERE id = $1', [userId]);
        if (targetUserCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Проверяем, не забанен ли пользователь
        const banCheck = await query(
            'SELECT 1 FROM chat_bans WHERE chat_id = $1 AND user_id = $2 AND (banned_until IS NULL OR banned_until > NOW())',
            [chatId, userId]
        );
        if (banCheck.rows.length > 0) {
            return res.status(400).json({ error: 'User is banned from this group' });
        }

        // Проверяем, не состоит ли уже целевой пользователь в группе
        const targetMemberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );
        if (targetMemberCheck.rows.length > 0) {
            return res.status(400).json({ error: 'User is already a member of this group' });
        }

        // Проверяем настройки конфиденциальности целевого пользователя
        const privResult = await query(
            'SELECT privacy_settings FROM user_settings WHERE user_id = $1',
            [userId]
        );
        const privacy = privResult.rows[0]?.privacy_settings || {};
        const groupsAdd = privacy.groupsAdd || 'all';

        if (groupsAdd === 'none') {
            const name = targetUserCheck.rows[0].first_name || targetUserCheck.rows[0].username || req.t('user');
            return res.status(403).json({ error: req.t('groupAddPrivacyNone', { name }) || `Cannot add ${name} due to privacy settings` });
        }

        if (groupsAdd === 'contacts') {
            // Проверяем наличие личного чата между приглашающим и приглашаемым
            const contactCheck = await query(
                `SELECT 1 FROM chats c
                 JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
                 JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
                 WHERE c.type = 'private' LIMIT 1`,
                [userId, req.user.id]
            );
            if (contactCheck.rows.length === 0) {
                const name = targetUserCheck.rows[0].first_name || targetUserCheck.rows[0].username || req.t('user');
                return res.status(403).json({ error: req.t('groupAddPrivacyContacts', { name }) || `Cannot add ${name} (contacts only)` });
            }
        }

        // Добавляем в группу
        await query(
            "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES ($1, $2, 'member', NOW())",
            [chatId, userId]
        );
        await checkAndUpgradeToSupergroup(chatId);

        // Создаем системное сообщение
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;
        
        const callerName = req.user.first_name || req.user.username || req.t('user');
        const targetName = targetUserCheck.rows[0].first_name || targetUserCheck.rows[0].username || req.t('user');
        const systemMsgText = `${callerName} добавил(а) ${targetName}`;

        const msgId = uuidv4();
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [msgId, chatId, systemSenderId, systemMsgText]
        );

        // WebSocket уведомление о новом сообщении
        const systemMessage = {
            id: msgId,
            chatId,
            senderId: systemSenderId,
            senderUsername: botResult.rows.length ? 'craneapp_bot' : req.user.username,
            senderFirstName: botResult.rows.length ? 'CraneApp Bot' : req.user.first_name,
            content: systemMsgText,
            type: 'text',
            createdAt: new Date().toISOString()
        };

        // Отсылаем и событие добавления в чат, и новое сообщение
        await broadcastToChat(chatId, {
            type: 'member_joined',
            chatId,
            userId,
            joinedUser: {
                id: targetUserCheck.rows[0].id,
                username: targetUserCheck.rows[0].username,
                firstName: targetUserCheck.rows[0].first_name
            },
            message: systemMessage
        }, null);

        // Также отправляем new_chat добавляемому пользователю
        const title = chatCheck.rows[0].title;
        await broadcastToChat(chatId, {
            type: 'new_chat',
            chatId,
            chatType: 'group',
            title
        }, null);

        logger.info(`✅ User ${userId} added to group ${chatId} by ${req.user.id}`);
        res.status(200).json({ success: true });
    } catch (error) {
        logger.error('❌ Add group member error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ИСКЛЮЧЕНИЕ УЧАСТНИКА ИЗ ГРУППЫ
app.delete('/api/v1/chats/:chatId/members/:userId', authMiddleware, async (req, res) => {
    try {
        const { chatId, userId } = req.params;

        // Проверяем, что чат существует и является группой
        const chatCheck = await query('SELECT type, owner_id FROM chats WHERE id = $1', [chatId]);
        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        if (chatCheck.rows[0].type !== 'group') {
            return res.status(400).json({ error: 'Chat is not a group' });
        }

        // Проверяем, состоит ли целевой пользователь в группе
        const targetMemberCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );
        if (targetMemberCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User is not a member of this group' });
        }
        const targetRole = targetMemberCheck.rows[0].role;

        // Проверяем права инициатора
        const callerCheck = await query(
            'SELECT role, permissions FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (callerCheck.rows.length === 0) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        const caller = callerCheck.rows[0];
        let canKick = false;
        if (caller.role === 'owner') {
            canKick = true;
        } else if (caller.role === 'admin') {
            const perms = caller.permissions || {};
            if (targetRole === 'member' && (perms.can_ban_users === true || perms.can_ban_users === 'true')) {
                canKick = true;
            }
        }

        if (!canKick) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        // Владелец не может исключить сам себя через этот эндпоинт
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Owner cannot kick themselves' });
        }

        // Удаляем из группы
        await query('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);

        // Создаем системное сообщение
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;

        const targetUserCheck = await query('SELECT first_name, username FROM users WHERE id = $1', [userId]);
        const callerName = req.user.first_name || req.user.username || req.t('user');
        const targetName = targetUserCheck.rows[0]?.first_name || targetUserCheck.rows[0]?.username || req.t('user');
        const systemMsgText = `${callerName} исключил(а) ${targetName}`;

        const msgId = uuidv4();
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [msgId, chatId, systemSenderId, systemMsgText]
        );

        const systemMessage = {
            id: msgId,
            chatId,
            senderId: systemSenderId,
            senderUsername: botResult.rows.length ? 'craneapp_bot' : req.user.username,
            senderFirstName: botResult.rows.length ? 'CraneApp Bot' : req.user.first_name,
            content: systemMsgText,
            type: 'text',
            createdAt: new Date().toISOString()
        };

        // Отсылаем WebSocket-событие об исключении
        await broadcastToChat(chatId, {
            type: 'member_left',
            chatId,
            userId,
            message: systemMessage
        }, null);

        logger.info(`✅ User ${userId} kicked from group ${chatId} by owner ${req.user.id}`);
        res.status(200).json({ success: true });
    } catch (error) {
        logger.error('❌ Kick group member error:', error);
        res.status(500).json({ error: error.message });
    }
});


// ============================================
// GROUP MODERATION ENDPOINTS
// ============================================

// Helper to check moderation permissions
async function checkModeratorPermission(chatId, userId, requiredPermission) {
    const callerCheck = await query(
        'SELECT role, permissions FROM chat_members WHERE chat_id = $1 AND user_id = $2',
        [chatId, userId]
    );
    if (callerCheck.rows.length === 0) return false;
    const caller = callerCheck.rows[0];
    if (caller.role === 'owner') return true;
    if (caller.role === 'admin') {
        const perms = caller.permissions || {};
        return perms[requiredPermission] === true || perms[requiredPermission] === 'true';
    }
    return false;
}

// 1. GET /api/v1/chats/:chatId/bans
app.get('/api/v1/chats/:chatId/bans', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const isMod = await checkModeratorPermission(chatId, req.user.id, 'can_ban_users');
        if (!isMod) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        const result = await query(
            `SELECT cb.id, cb.reason, cb.banned_until, cb.created_at, cb.banned_by,
                    u.id as user_id, u.username, u.first_name, u.last_name, u.avatar_url
             FROM chat_bans cb
             JOIN users u ON cb.user_id = u.id
             WHERE cb.chat_id = $1 AND (cb.banned_until IS NULL OR cb.banned_until > NOW())`,
            [chatId]
        );

        res.json({
            bans: result.rows.map(row => ({
                id: row.id,
                reason: row.reason,
                banned_until: row.banned_until,
                created_at: row.created_at,
                banned_by: row.banned_by,
                user: {
                    id: row.user_id,
                    username: row.username,
                    first_name: row.first_name,
                    last_name: row.last_name,
                    avatar_url: row.avatar_url
                }
            }))
        });
    } catch (error) {
        logger.error('❌ Get group bans error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. POST /api/v1/chats/:chatId/members/:userId/role
app.post('/api/v1/chats/:chatId/members/:userId/role', authMiddleware, async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const { newRole, permissions } = req.body;
        const role = newRole || req.body.role;

        if (!['admin', 'member'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Only owner can promote/demote
        const callerCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (callerCheck.rows.length === 0 || callerCheck.rows[0].role !== 'owner') {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        // Check if target is a member of the group
        const targetCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );
        if (targetCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Target user is not a member of the group' });
        }

        const newPermissions = role === 'admin' ? (permissions || {}) : {};

        await query(
            'UPDATE chat_members SET role = $1, permissions = $2 WHERE chat_id = $3 AND user_id = $4',
            [role, JSON.stringify(newPermissions), chatId, userId]
        );

        // WebSocket notification
        broadcastToChat(chatId, {
            type: 'member_role_updated',
            chatId,
            userId,
            role,
            permissions: newPermissions
        }, null);

        logger.info(`✅ Role updated for user ${userId} in chat ${chatId} to ${role}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Update member role error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper for duration text in system messages
function getDurationText(durationSec) {
    if (!durationSec) return 'навсегда';
    const hrs = durationSec / 3600;
    if (hrs === 1) return 'на 1 час';
    if (hrs === 24) return 'на 1 день';
    if (hrs === 168) return 'на 1 неделю';
    return `на ${hrs} ч.`;
}

// 3. POST /api/v1/chats/:chatId/members/:userId/mute
app.post('/api/v1/chats/:chatId/members/:userId/mute', authMiddleware, async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const { duration, reason } = req.body;

        const isMod = await checkModeratorPermission(chatId, req.user.id, 'can_ban_users');
        if (!isMod) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        // Get target user role and info
        const targetCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );
        if (targetCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User is not a member of the group' });
        }
        if (targetCheck.rows[0].role === 'owner') {
            return res.status(400).json({ error: 'Cannot mute group owner' });
        }

        let mutedUntil = null;
        if (duration && duration > 0) {
            mutedUntil = new Date(Date.now() + duration * 1000);
        }

        await query(
            'UPDATE chat_members SET muted_until = $1 WHERE chat_id = $2 AND user_id = $3',
            [mutedUntil, chatId, userId]
        );

        // System message
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;
        const callerName = req.user.first_name || req.user.username || req.t('user');
        const targetUser = await query('SELECT first_name, username FROM users WHERE id = $1', [userId]);
        const targetName = targetUser.rows[0]?.first_name || targetUser.rows[0]?.username || req.t('user');
        
        const durationText = getDurationText(duration);
        const systemMsgText = `${callerName} ограничил(а) отправку сообщений для ${targetName} ${durationText}`;

        const msgId = uuidv4();
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [msgId, chatId, systemSenderId, systemMsgText]
        );

        const systemMessage = {
            id: msgId,
            chatId,
            senderId: systemSenderId,
            senderUsername: botResult.rows.length ? 'craneapp_bot' : req.user.username,
            senderFirstName: botResult.rows.length ? 'CraneApp Bot' : req.user.first_name,
            content: systemMsgText,
            type: 'text',
            createdAt: new Date().toISOString()
        };

        broadcastToChat(chatId, {
            type: 'member_muted',
            chatId,
            userId,
            muted_until: mutedUntil ? mutedUntil.toISOString() : null,
            muted_by: req.user.id,
            reason,
            message: systemMessage
        }, null);

        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Mute member error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. POST /api/v1/chats/:chatId/members/:userId/unmute
app.post('/api/v1/chats/:chatId/members/:userId/unmute', authMiddleware, async (req, res) => {
    try {
        const { chatId, userId } = req.params;

        const isMod = await checkModeratorPermission(chatId, req.user.id, 'can_ban_users');
        if (!isMod) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        await query(
            'UPDATE chat_members SET muted_until = NULL WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        // System message
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;
        const callerName = req.user.first_name || req.user.username || req.t('user');
        const targetUser = await query('SELECT first_name, username FROM users WHERE id = $1', [userId]);
        const targetName = targetUser.rows[0]?.first_name || targetUser.rows[0]?.username || req.t('user');
        
        const systemMsgText = `${callerName} разрешил(а) отправку сообщений для ${targetName}`;

        const msgId = uuidv4();
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [msgId, chatId, systemSenderId, systemMsgText]
        );

        const systemMessage = {
            id: msgId,
            chatId,
            senderId: systemSenderId,
            senderUsername: botResult.rows.length ? 'craneapp_bot' : req.user.username,
            senderFirstName: botResult.rows.length ? 'CraneApp Bot' : req.user.first_name,
            content: systemMsgText,
            type: 'text',
            createdAt: new Date().toISOString()
        };

        broadcastToChat(chatId, {
            type: 'member_unmuted',
            chatId,
            userId,
            message: systemMessage
        }, null);

        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Unmute member error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. POST /api/v1/chats/:chatId/members/:userId/ban
app.post('/api/v1/chats/:chatId/members/:userId/ban', authMiddleware, async (req, res) => {
    try {
        const { chatId, userId } = req.params;
        const { duration, reason } = req.body;

        const isMod = await checkModeratorPermission(chatId, req.user.id, 'can_ban_users');
        if (!isMod) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        // Get target role
        const targetCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );
        if (targetCheck.rows.length > 0 && targetCheck.rows[0].role === 'owner') {
            return res.status(400).json({ error: 'Cannot ban group owner' });
        }

        let bannedUntil = null;
        if (duration && duration > 0) {
            bannedUntil = new Date(Date.now() + duration * 1000);
        }

        // Add to bans
        await query(
            `INSERT INTO chat_bans (chat_id, user_id, banned_by, reason, banned_until, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (chat_id, user_id)
             DO UPDATE SET banned_by = EXCLUDED.banned_by, reason = EXCLUDED.reason, banned_until = EXCLUDED.banned_until, created_at = NOW()`,
            [chatId, userId, req.user.id, reason || '', bannedUntil]
        );

        // Delete from chat members
        await query(
            'DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        // System message
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;
        const callerName = req.user.first_name || req.user.username || req.t('user');
        const targetUser = await query('SELECT first_name, username FROM users WHERE id = $1', [userId]);
        const targetName = targetUser.rows[0]?.first_name || targetUser.rows[0]?.username || req.t('user');
        
        const durationText = getDurationText(duration);
        const systemMsgText = `${callerName} забанил(а) ${targetName} ${durationText}`;

        const msgId = uuidv4();
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [msgId, chatId, systemSenderId, systemMsgText]
        );

        const systemMessage = {
            id: msgId,
            chatId,
            senderId: systemSenderId,
            senderUsername: botResult.rows.length ? 'craneapp_bot' : req.user.username,
            senderFirstName: botResult.rows.length ? 'CraneApp Bot' : req.user.first_name,
            content: systemMsgText,
            type: 'text',
            createdAt: new Date().toISOString()
        };

        broadcastToChat(chatId, {
            type: 'member_banned',
            chatId,
            userId,
            banned_until: bannedUntil ? bannedUntil.toISOString() : null,
            banned_by: req.user.id,
            reason,
            message: systemMessage
        }, null);

        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Ban member error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. POST /api/v1/chats/:chatId/members/:userId/unban
app.post('/api/v1/chats/:chatId/members/:userId/unban', authMiddleware, async (req, res) => {
    try {
        const { chatId, userId } = req.params;

        const isMod = await checkModeratorPermission(chatId, req.user.id, 'can_ban_users');
        if (!isMod) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        await query(
            'DELETE FROM chat_bans WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );

        // System message
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;
        const callerName = req.user.first_name || req.user.username || req.t('user');
        const targetUser = await query('SELECT first_name, username FROM users WHERE id = $1', [userId]);
        const targetName = targetUser.rows[0]?.first_name || targetUser.rows[0]?.username || req.t('user');
        
        const systemMsgText = `${callerName} разбанил(а) ${targetName}`;

        const msgId = uuidv4();
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [msgId, chatId, systemSenderId, systemMsgText]
        );

        const systemMessage = {
            id: msgId,
            chatId,
            senderId: systemSenderId,
            senderUsername: botResult.rows.length ? 'craneapp_bot' : req.user.username,
            senderFirstName: botResult.rows.length ? 'CraneApp Bot' : req.user.first_name,
            content: systemMsgText,
            type: 'text',
            createdAt: new Date().toISOString()
        };

        broadcastToChat(chatId, {
            type: 'member_unbanned',
            chatId,
            userId,
            message: systemMessage
        }, null);

        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Unban member error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// CHAT INVITE LINKS & JOIN REQUESTS
// ============================================

// 1. Создать пригласительную ссылку (Owner или Admin)
app.post('/api/v1/chats/:chatId/invite-links', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { expireAt, usageLimit, requestToJoin = false } = req.body;

        // Проверяем, что чат существует и является группой
        const chatCheck = await query('SELECT type FROM chats WHERE id = $1', [chatId]);
        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Чат не найден' });
        }
        if (chatCheck.rows[0].type !== 'group') {
            return res.status(400).json({ error: 'Чат не является группой' });
        }

        // Проверяем роль пользователя в чате
        const callerCheck = await query(
            'SELECT role, permissions FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (callerCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const caller = callerCheck.rows[0];
        if (caller.role !== 'owner' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Только администраторы могут создавать ссылки' });
        }

        if (caller.role === 'admin') {
            const perms = caller.permissions || {};
            if (perms.can_invite_users === false || perms.can_invite_users === 'false') {
                return res.status(403).json({ error: 'У вас нет прав на приглашение пользователей' });
            }
        }

        // Генерируем уникальный код ссылки
        const linkCode = uuidv4().replace(/-/g, '').substring(0, 12);

        const newLink = await query(
            `INSERT INTO chat_invite_links (chat_id, creator_id, link_code, expire_at, usage_limit, request_to_join)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [chatId, req.user.id, linkCode, expireAt || null, usageLimit || null, requestToJoin]
        );

        logger.info(`✅ Invite link created: ${linkCode} for chat ${chatId}`);
        res.status(201).json({ inviteLink: newLink.rows[0] });
    } catch (error) {
        logger.error('❌ Create invite link error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Получить список активных пригласительных ссылок (Owner или Admin)
app.get('/api/v1/chats/:chatId/invite-links', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;

        // Проверяем роль пользователя в чате
        const callerCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (callerCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const caller = callerCheck.rows[0];
        if (caller.role !== 'owner' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Только администраторы могут просматривать ссылки' });
        }

        const linksResult = await query(
            `SELECT cil.*, u.first_name as creator_first_name, u.username as creator_username
             FROM chat_invite_links cil
             LEFT JOIN users u ON cil.creator_id = u.id
             WHERE cil.chat_id = $1 AND cil.is_revoked = FALSE
             ORDER BY cil.created_at DESC`,
            [chatId]
        );

        res.json({ inviteLinks: linksResult.rows });
    } catch (error) {
        logger.error('❌ Get invite links error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2.1. Отозвать пригласительную ссылку (Owner или Admin)
app.delete('/api/v1/chats/:chatId/invite-links/:linkId', authMiddleware, async (req, res) => {
    try {
        const { chatId, linkId } = req.params;

        // Проверяем роль пользователя в чате
        const callerCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (callerCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const caller = callerCheck.rows[0];
        if (caller.role !== 'owner' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Только администраторы могут отзывать ссылки' });
        }

        const updateResult = await query(
            `UPDATE chat_invite_links SET is_revoked = TRUE 
             WHERE id = $1 AND chat_id = $2`,
            [linkId, chatId]
        );

        if (updateResult.rowCount === 0) {
            return res.status(404).json({ error: 'Ссылка не найдена' });
        }

        logger.info(`✅ Invite link ${linkId} revoked by user ${req.user.id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Revoke invite link error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Вступить в чат по пригласительной ссылке
app.post('/api/v1/chats/join-link/:code', authMiddleware, async (req, res) => {
    try {
        const { code } = req.params;

        // Находим ссылку
        const linkResult = await query(
            `SELECT * FROM chat_invite_links 
             WHERE link_code = $1 AND is_revoked = FALSE`,
            [code]
        );
        if (linkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Неверная или недействительная ссылка' });
        }

        const link = linkResult.rows[0];

        // Проверяем срок действия
        if (link.expire_at && new Date(link.expire_at) < new Date()) {
            return res.status(400).json({ error: 'Срок действия ссылки истек' });
        }

        // Проверяем лимит использования
        if (link.usage_limit && link.usage_count >= link.usage_limit) {
            return res.status(400).json({ error: 'Ссылка превысила лимит использований' });
        }

        const chatId = link.chat_id;

        // Проверяем чат
        const chatCheck = await query('SELECT type, title, join_approval_required FROM chats WHERE id = $1', [chatId]);
        if (chatCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Чат не найден' });
        }
        const chat = chatCheck.rows[0];

        // Проверяем, не забанен ли пользователь
        const banCheck = await query(
            'SELECT 1 FROM chat_bans WHERE chat_id = $1 AND user_id = $2 AND (banned_until IS NULL OR banned_until > NOW())',
            [chatId, req.user.id]
        );
        if (banCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Вы забанены в этой группе' });
        }

        // Проверяем, состоит ли пользователь уже в чате
        const memberCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (memberCheck.rows.length > 0) {
            return res.status(200).json({ chatId, alreadyMember: true });
        }

        // Если требуется одобрение заявки
        if (link.request_to_join || chat.join_approval_required) {
            // Проверяем, нет ли уже ожидающей заявки
            const requestCheck = await query(
                `SELECT id, status FROM chat_join_requests 
                 WHERE chat_id = $1 AND user_id = $2 AND status = 'pending'`,
                [chatId, req.user.id]
            );
            if (requestCheck.rows.length > 0) {
                return res.status(200).json({ chatId, joined: false, approvalRequired: true, status: 'pending' });
            }

            const requestId = uuidv4();
            await query(
                `INSERT INTO chat_join_requests (id, chat_id, user_id, status)
                 VALUES ($1, $2, $3, 'pending')`,
                [requestId, chatId, req.user.id]
            );

            logger.info(`📝 Join request submitted for user ${req.user.id} in chat ${chatId}`);
            return res.status(200).json({ chatId, joined: false, approvalRequired: true, status: 'pending' });
        }

        // Прямое вступление в группу
        await query(
            "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES ($1, $2, 'member', NOW())",
            [chatId, req.user.id]
        );
        await checkAndUpgradeToSupergroup(chatId);

        // Обновляем счетчик использований ссылки
        await query(
            'UPDATE chat_invite_links SET usage_count = usage_count + 1 WHERE id = $1',
            [link.id]
        );

        // Создаем системное сообщение
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;
        const userName = req.user.first_name || req.user.username || 'Пользователь';
        const systemMsgText = `${userName} вступил(а) в группу по пригласительной ссылке`;

        const msgId = uuidv4();
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [msgId, chatId, systemSenderId, systemMsgText]
        );

        const systemMessage = {
            id: msgId,
            chatId,
            senderId: systemSenderId,
            senderUsername: botResult.rows.length ? 'craneapp_bot' : req.user.username,
            senderFirstName: botResult.rows.length ? 'CraneApp Bot' : req.user.first_name,
            content: systemMsgText,
            type: 'text',
            createdAt: new Date().toISOString()
        };

        // Отсылаем и событие добавления в чат, и новое сообщение
        await broadcastToChat(chatId, {
            type: 'member_joined',
            chatId,
            userId: req.user.id,
            joinedUser: {
                id: req.user.id,
                username: req.user.username,
                firstName: req.user.first_name
            },
            message: systemMessage
        }, null);

        // Также отправляем new_chat добавляемому пользователю
        await broadcastToChat(chatId, {
            type: 'new_chat',
            chatId,
            chatType: 'group',
            title: chat.title
        }, null);

        logger.info(`✅ User ${req.user.id} joined chat ${chatId} via invite link`);
        res.status(200).json({ chatId, joined: true });
    } catch (error) {
        logger.error('❌ Join link error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Получить список заявок на вступление (Owner или Admin)
app.get('/api/v1/chats/:chatId/join-requests', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;

        // Проверяем роль пользователя в чате
        const callerCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (callerCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const caller = callerCheck.rows[0];
        if (caller.role !== 'owner' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Только администраторы могут просматривать заявки' });
        }

        const requestsResult = await query(
            `SELECT jr.*, u.first_name, u.last_name, u.username, u.avatar_url 
             FROM chat_join_requests jr
             JOIN users u ON jr.user_id = u.id
             WHERE jr.chat_id = $1 AND jr.status = 'pending'
             ORDER BY jr.created_at DESC`,
            [chatId]
        );

        res.json({ joinRequests: requestsResult.rows });
    } catch (error) {
        logger.error('❌ Get join requests error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Одобрить заявку на вступление (Owner или Admin)
app.post('/api/v1/chats/:chatId/join-requests/:requestId/approve', authMiddleware, async (req, res) => {
    try {
        const { chatId, requestId } = req.params;

        // Проверяем роль пользователя в чате
        const callerCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (callerCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const caller = callerCheck.rows[0];
        if (caller.role !== 'owner' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Только администраторы могут одобрять заявки' });
        }

        // Получаем заявку
        const requestCheck = await query(
            'SELECT * FROM chat_join_requests WHERE id = $1 AND chat_id = $2 AND status = \'pending\'',
            [requestId, chatId]
        );
        if (requestCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена или уже обработана' });
        }

        const targetUserId = requestCheck.rows[0].user_id;

        // Проверяем, не забанен ли пользователь
        const banCheck = await query(
            'SELECT 1 FROM chat_bans WHERE chat_id = $1 AND user_id = $2 AND (banned_until IS NULL OR banned_until > NOW())',
            [chatId, targetUserId]
        );
        if (banCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь забанен в этой группе' });
        }

        // Проверяем, не состоит ли уже в чате
        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, targetUserId]
        );
        if (memberCheck.rows.length > 0) {
            // Обновляем статус заявки как approved
            await query(
                `UPDATE chat_join_requests 
                 SET status = 'approved', decided_by = $1, decided_at = NOW() 
                 WHERE id = $2`,
                [req.user.id, requestId]
            );
            return res.json({ success: true, message: 'Пользователь уже является участником' });
        }

        // Обновляем заявку
        await query(
            `UPDATE chat_join_requests 
             SET status = 'approved', decided_by = $1, decided_at = NOW() 
             WHERE id = $2`,
            [req.user.id, requestId]
        );

        // Добавляем в chat_members
        await query(
            "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES ($1, $2, 'member', NOW())",
            [chatId, targetUserId]
        );
        await checkAndUpgradeToSupergroup(chatId);

        // Получаем инфо о целевом пользователе
        const targetUserCheck = await query('SELECT id, first_name, username FROM users WHERE id = $1', [targetUserId]);
        const targetUser = targetUserCheck.rows[0];

        // Получаем инфо о чате
        const chatCheck = await query('SELECT title FROM chats WHERE id = $1', [chatId]);
        const chatTitle = chatCheck.rows[0]?.title || 'Группа';

        // Создаем системное сообщение
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;
        const userName = targetUser.first_name || targetUser.username || 'Пользователь';
        const systemMsgText = `${userName} принят(а) в группу по заявке`;

        const msgId = uuidv4();
        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [msgId, chatId, systemSenderId, systemMsgText]
        );

        const systemMessage = {
            id: msgId,
            chatId,
            senderId: systemSenderId,
            senderUsername: botResult.rows.length ? 'craneapp_bot' : req.user.username,
            senderFirstName: botResult.rows.length ? 'CraneApp Bot' : req.user.first_name,
            content: systemMsgText,
            type: 'text',
            createdAt: new Date().toISOString()
        };

        // Отсылаем и событие добавления в чат, и новое сообщение
        await broadcastToChat(chatId, {
            type: 'member_joined',
            chatId,
            userId: targetUserId,
            joinedUser: {
                id: targetUserId,
                username: targetUser.username,
                firstName: targetUser.first_name
            },
            message: systemMessage
        }, null);

        // Также отправляем new_chat добавляемому пользователю
        await broadcastToChat(chatId, {
            type: 'new_chat',
            chatId,
            chatType: 'group',
            title: chatTitle
        }, null);

        logger.info(`✅ Join request ${requestId} approved by ${req.user.id}. User ${targetUserId} added.`);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Approve join request error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Отклонить заявку на вступление (Owner или Admin)
app.post('/api/v1/chats/:chatId/join-requests/:requestId/decline', authMiddleware, async (req, res) => {
    try {
        const { chatId, requestId } = req.params;

        // Проверяем роль пользователя в чате
        const callerCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (callerCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const caller = callerCheck.rows[0];
        if (caller.role !== 'owner' && caller.role !== 'admin') {
            return res.status(403).json({ error: 'Только администраторы могут отклонять заявки' });
        }

        // Обновляем заявку
        const updateResult = await query(
            `UPDATE chat_join_requests 
             SET status = 'declined', decided_by = $1, decided_at = NOW() 
             WHERE id = $2 AND chat_id = $3 AND status = 'pending'`,
            [req.user.id, requestId, chatId]
        );

        if (updateResult.rowCount === 0) {
            return res.status(404).json({ error: 'Заявка не найдена или уже обработана' });
        }

        logger.info(`✅ Join request ${requestId} declined by ${req.user.id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Decline join request error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ИСПРАВЛЕННЫЙ РОУТ СОЗДАНИЯ ЧАТА
app.post('/api/v1/chats/create', authMiddleware, async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { type, participants } = req.body;
        const currentUserId = req.user.id;

        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ error: 'Participants required' });
        }

        const otherUserId = participants.find(id => id !== currentUserId);
        
        if (!otherUserId) {
            return res.status(400).json({ error: 'Invalid participants' });
        }

        if (otherUserId === currentUserId) {
            return res.status(400).json({ error: 'Cannot create chat with yourself' });
        }

        // Проверяем, не заблокирован ли пользователь
        const blockedCheck = await query(
            'SELECT 1 FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2',
            [otherUserId, currentUserId]
        );

        if (blockedCheck.rows.length > 0) {
            return res.status(403).json({ error: 'You are blocked by this user' });
        }

        // Начинаем транзакцию с блокировкой для предотвращения race condition
        await client.query('BEGIN');
        
        // Блокируем строки пользователей для предотвращения race condition
        const [id1, id2] = [currentUserId, otherUserId].sort();
        await client.query(
            'SELECT 1 FROM users WHERE id = $1 OR id = $2 FOR UPDATE',
            [id1, id2]
        );

        // Проверяем существующий чат с этим пользователем
        const existingChat = await client.query(
            `SELECT c.id, c.created_at FROM chats c
             JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
             JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
             WHERE c.type = 'private'`,
            [currentUserId, otherUserId]
        );

        // Если чат существует, возвращаем его ID
        if (existingChat.rows.length > 0) {
            await client.query('COMMIT');
            logger.info('✅ Existing chat found:', existingChat.rows[0].id);
            return res.status(200).json({ chatId: existingChat.rows[0].id, exists: true });
        }

        // Создаём новый чат
        const chatId = uuidv4();

        await client.query(
            `INSERT INTO chats (id, type, title, owner_id, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [chatId, type || 'private', req.t('privateChatTitle'), currentUserId]
        );

        await client.query(
            `INSERT INTO chat_members (chat_id, user_id, role, joined_at)
             VALUES ($1, $2, 'owner', NOW()), ($1, $3, 'member', NOW())`,
            [chatId, currentUserId, otherUserId]
        );

        await client.query('COMMIT');
        
        logger.info('✅ New chat created:', chatId);

        // Уведомляем получателя о новом чате через WebSocket
        const senderInfo = await query('SELECT first_name, username, avatar_url FROM users WHERE id = $1', [currentUserId]);
        const sender = senderInfo.rows[0] || {};
        broadcastToChat(chatId, {
            type: 'new_chat',
            chatId,
            chatType: 'private',
            senderId: currentUserId,
            senderName: sender.first_name || sender.username || req.t('user'),
            senderAvatar: sender.avatar_url || ''
        }, currentUserId);

        res.status(201).json({ chatId, exists: false });
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('❌ Create chat error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// ============================================
// TOPICS & SETTINGS ROUTES
// ============================================

// 1. GET /api/v1/chats/:chatId/topics - Получить список тем
app.get('/api/v1/chats/:chatId/topics', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const memberCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const topicsRes = await query(
            `SELECT ct.*, 
                    (SELECT COUNT(*) FROM messages m WHERE m.chat_id = ct.chat_id AND m.topic_id = ct.id AND m.is_deleted = FALSE) as message_count
             FROM chat_topics ct
             WHERE ct.chat_id = $1 AND ct.is_hidden = FALSE
             ORDER BY ct.created_at ASC`,
            [chatId]
        );

        const topics = topicsRes.rows;
        const chatRes = await query('SELECT is_supergroup FROM chats WHERE id = $1', [chatId]);
        const chat = chatRes.rows[0];
        
        if (chat && chat.is_supergroup) {
            const generalCountRes = await query(
                `SELECT COUNT(*) as count FROM messages 
                 WHERE chat_id = $1 AND topic_id IS NULL AND is_deleted = FALSE`,
                [chatId]
            );
            
            topics.unshift({
                id: null,
                chat_id: chatId,
                title: 'Общий',
                icon_color: '#9d00ff',
                icon_emoji: '💬',
                creator_id: null,
                is_closed: false,
                is_hidden: false,
                created_at: new Date(0).toISOString(),
                message_count: parseInt(generalCountRes.rows[0].count)
            });
        }

        res.json({ topics });
    } catch (error) {
        logger.error('❌ Get topics error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. POST /api/v1/chats/:chatId/topics - Создать тему
app.post('/api/v1/chats/:chatId/topics', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { title, iconColor, iconEmoji } = req.body;

        if (!title || title.trim().length === 0) {
            return res.status(400).json({ error: 'Название темы не может быть пустым' });
        }

        const memberCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const chatRes = await query('SELECT is_supergroup FROM chats WHERE id = $1', [chatId]);
        const chat = chatRes.rows[0];
        if (!chat || !chat.is_supergroup) {
            return res.status(400).json({ error: 'Темы поддерживаются только в супергруппах' });
        }

        const topicId = uuidv4();
        const newTopic = await query(
            `INSERT INTO chat_topics (id, chat_id, title, icon_color, icon_emoji, creator_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [topicId, chatId, title.trim().substring(0, 100), iconColor || '#00E676', iconEmoji || '📁', req.user.id]
        );

        logger.info(`✅ Topic created: ${title} in chat ${chatId}`);
        res.status(201).json({ topic: newTopic.rows[0] });
    } catch (error) {
        logger.error('❌ Create topic error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. POST /api/v1/chats/:chatId/topics/:topicId/close - Закрыть тему
app.post('/api/v1/chats/:chatId/topics/:topicId/close', authMiddleware, async (req, res) => {
    try {
        const { chatId, topicId } = req.params;
        const memberCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        const myRole = memberCheck.rows[0].role;
        if (myRole !== 'owner' && myRole !== 'admin') {
            return res.status(403).json({ error: 'Недостаточно прав для закрытия темы' });
        }

        await query(
            'UPDATE chat_topics SET is_closed = TRUE WHERE id = $1 AND chat_id = $2',
            [topicId, chatId]
        );

        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Close topic error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. POST /api/v1/chats/:chatId/topics/:topicId/reopen - Открыть тему заново
app.post('/api/v1/chats/:chatId/topics/:topicId/reopen', authMiddleware, async (req, res) => {
    try {
        const { chatId, topicId } = req.params;
        const memberCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        const myRole = memberCheck.rows[0].role;
        if (myRole !== 'owner' && myRole !== 'admin') {
            return res.status(403).json({ error: 'Недостаточно прав для открытия темы' });
        }

        await query(
            'UPDATE chat_topics SET is_closed = FALSE WHERE id = $1 AND chat_id = $2',
            [topicId, chatId]
        );

        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Reopen topic error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. DELETE /api/v1/chats/:chatId/topics/:topicId - Удалить тему
app.delete('/api/v1/chats/:chatId/topics/:topicId', authMiddleware, async (req, res) => {
    try {
        const { chatId, topicId } = req.params;
        const memberCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        const myRole = memberCheck.rows[0].role;
        if (myRole !== 'owner' && myRole !== 'admin') {
            return res.status(403).json({ error: 'Недостаточно прав для удаления темы' });
        }

        await query('DELETE FROM messages WHERE chat_id = $1 AND topic_id = $2', [chatId, topicId]);
        await query('DELETE FROM chat_topics WHERE id = $1 AND chat_id = $2', [topicId, chatId]);

        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Delete topic error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. POST /api/v1/chats/:chatId/settings - Изменить настройки группы (супергруппа, медленный режим, одобрение)
app.post('/api/v1/chats/:chatId/settings', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { isSupergroup, joinApprovalRequired, slowModeSeconds } = req.body;

        const memberCheck = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        const myRole = memberCheck.rows[0].role;
        if (myRole !== 'owner' && myRole !== 'admin') {
            return res.status(403).json({ error: 'Недостаточно прав для изменения настроек' });
        }

        const updates = [];
        const values = [];
        let paramIdx = 1;

        if (isSupergroup !== undefined) {
            updates.push(`is_supergroup = $${paramIdx++}`);
            values.push(isSupergroup);
        }
        if (joinApprovalRequired !== undefined) {
            updates.push(`join_approval_required = $${paramIdx++}`);
            values.push(joinApprovalRequired);
        }
        if (slowModeSeconds !== undefined) {
            updates.push(`slow_mode_seconds = $${paramIdx++}`);
            values.push(slowModeSeconds);
        }

        if (updates.length > 0) {
            values.push(chatId);
            await query(
                `UPDATE chats SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
                values
            );
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Update settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/chats/:chatId', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }
        
        const chatInfo = await query('SELECT type, owner_id FROM chats WHERE id = $1', [chatId]);
        
        if (chatInfo.rows[0].type === 'private') {
            await query('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, req.user.id]);
            
            const remaining = await query('SELECT COUNT(*) FROM chat_members WHERE chat_id = $1', [chatId]);
            if (parseInt(remaining.rows[0].count) === 0) {
                await query('DELETE FROM messages WHERE chat_id = $1', [chatId]);
                await query('DELETE FROM chats WHERE id = $1', [chatId]);
            }
        } else {
            if (chatInfo.rows[0].owner_id === req.user.id) {
                await query('DELETE FROM messages WHERE chat_id = $1', [chatId]);
                await query('DELETE FROM chat_members WHERE chat_id = $1', [chatId]);
                await query('DELETE FROM chats WHERE id = $1', [chatId]);
            } else {
                // Обычный участник выходит из группы
                const callerName = req.user.first_name || req.user.username || req.t('user');
                const systemMsgText = `${callerName} покинул(а) группу`;

                await query('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, req.user.id]);

                // Системное сообщение
                const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
                const systemSenderId = botResult.rows.length ? botResult.rows[0].id : req.user.id;

                const msgId = uuidv4();
                await query(
                    `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
                    [msgId, chatId, systemSenderId, systemMsgText]
                );

                const systemMessage = {
                    id: msgId,
                    chatId,
                    senderId: systemSenderId,
                    senderUsername: botResult.rows.length ? 'craneapp_bot' : req.user.username,
                    senderFirstName: botResult.rows.length ? 'CraneApp Bot' : req.user.first_name,
                    content: systemMsgText,
                    type: 'text',
                    createdAt: new Date().toISOString()
                };

                // Отправляем WebSocket уведомление оставшимся участникам
                await broadcastToChat(chatId, {
                    type: 'member_left',
                    chatId,
                    userId: req.user.id,
                    message: systemMessage
                }, null);
            }
        }
        
        logger.info('✅ Chat deleted/left:', chatId);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Delete chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PIN & ARCHIVE CHATS
// ============================================

// Закрепить чат
app.post('/api/v1/chats/:chatId/pin', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const memberCheck = await query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, req.user.id]);
        if (!memberCheck.rows.length) return res.status(403).json({ error: req.t('accessDenied') });

        await query(`
            INSERT INTO user_chat_settings (user_id, chat_id, is_pinned, pinned_at)
            VALUES ($1, $2, TRUE, NOW())
            ON CONFLICT (user_id, chat_id) DO UPDATE SET is_pinned = TRUE, pinned_at = NOW()
        `, [req.user.id, chatId]);

        logger.info('✅ Chat pinned:', chatId);
        res.json({ success: true, isPinned: true });
    } catch (error) {
        logger.error('❌ Pin chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Открепить чат
app.delete('/api/v1/chats/:chatId/pin', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        await query(`
            INSERT INTO user_chat_settings (user_id, chat_id, is_pinned)
            VALUES ($1, $2, FALSE)
            ON CONFLICT (user_id, chat_id) DO UPDATE SET is_pinned = FALSE, pinned_at = NULL
        `, [req.user.id, chatId]);
        logger.info('✅ Chat unpinned:', chatId);
        res.json({ success: true, isPinned: false });
    } catch (error) {
        logger.error('❌ Unpin chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Архивировать чат
app.post('/api/v1/chats/:chatId/archive', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const memberCheck = await query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, req.user.id]);
        if (!memberCheck.rows.length) return res.status(403).json({ error: req.t('accessDenied') });

        await query(`
            INSERT INTO user_chat_settings (user_id, chat_id, is_archived, archived_at)
            VALUES ($1, $2, TRUE, NOW())
            ON CONFLICT (user_id, chat_id) DO UPDATE SET is_archived = TRUE, archived_at = NOW()
        `, [req.user.id, chatId]);

        logger.info('✅ Chat archived:', chatId);
        res.json({ success: true, isArchived: true });
    } catch (error) {
        logger.error('❌ Archive chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Разархивировать чат
app.delete('/api/v1/chats/:chatId/archive', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        await query(`
            INSERT INTO user_chat_settings (user_id, chat_id, is_archived)
            VALUES ($1, $2, FALSE)
            ON CONFLICT (user_id, chat_id) DO UPDATE SET is_archived = FALSE, archived_at = NULL
        `, [req.user.id, chatId]);
        logger.info('✅ Chat unarchived:', chatId);
        res.json({ success: true, isArchived: false });
    } catch (error) {
        logger.error('❌ Unarchive chat error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Пометить чат прочитанным
app.post('/api/v1/chats/:chatId/read', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const memberCheck = await query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, req.user.id]);
        if (!memberCheck.rows.length) return res.status(403).json({ error: req.t('accessDenied') });

        await query(`
            CREATE TABLE IF NOT EXISTS user_chat_settings (
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
                is_pinned BOOLEAN DEFAULT FALSE,
                pinned_at TIMESTAMP,
                is_archived BOOLEAN DEFAULT FALSE,
                archived_at TIMESTAMP,
                last_read_at TIMESTAMP,
                mention_read_at TIMESTAMP,
                PRIMARY KEY (user_id, chat_id)
            )
        `).catch(() => {});
        await query('ALTER TABLE user_chat_settings ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP').catch(() => {});
        await query('ALTER TABLE user_chat_settings ADD COLUMN IF NOT EXISTS mention_read_at TIMESTAMP').catch(() => {});

        const readResult = await query(`
            INSERT INTO user_chat_settings (user_id, chat_id, last_read_at, mention_read_at)
            VALUES ($1, $2, NOW(), NOW())
            ON CONFLICT (user_id, chat_id) DO UPDATE SET last_read_at = NOW(), mention_read_at = NOW()
            RETURNING last_read_at, mention_read_at
        `, [req.user.id, chatId]);

        const lastReadAt = readResult.rows[0]?.last_read_at || new Date();
        const mentionReadAt = readResult.rows[0]?.mention_read_at || lastReadAt;
        res.json({ success: true, unreadCount: 0, mentionCount: 0, lastReadAt, mentionReadAt });
    } catch (error) {
        logger.error('❌ Mark chat read error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получить архивированные чаты
app.get('/api/v1/chats/archived', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT c.*, cm.role,
                    lm.content      AS last_message_content,
                    lm.type         AS last_message_type,
                    lm.is_encrypted AS last_message_encrypted,
                    lm.encryption_iv AS last_message_iv,
                    lm.created_at   AS last_message_at,
                    COALESCE(unread.unread_count, 0) AS unread_count,
                    ucs.mention_read_at AS mention_read_at,
                    COALESCE(mentions.mention_count, 0) AS mention_count,
                    mentions.latest_mention_at AS latest_mention_at,
                    mentions.oldest_mention_message_id AS oldest_mention_message_id,
                    ucs.archived_at AS user_archived_at
             FROM chats c
             JOIN chat_members cm ON c.id = cm.chat_id AND cm.user_id = $1
             JOIN user_chat_settings ucs ON c.id = ucs.chat_id AND ucs.user_id = $1 AND ucs.is_archived = TRUE
             LEFT JOIN LATERAL (
                 SELECT content, type, is_encrypted, encryption_iv, created_at
                 FROM messages
                 WHERE chat_id = c.id AND is_deleted = FALSE
                 ORDER BY created_at DESC LIMIT 1
             ) lm ON TRUE
             LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS unread_count
                 FROM messages m
                 WHERE m.chat_id = c.id
                   AND m.is_deleted = FALSE
                   AND m.sender_id <> $1
                   AND (ucs.last_read_at IS NULL OR m.created_at > ucs.last_read_at)
             ) unread ON TRUE
             LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS mention_count,
                        MAX(mm.created_at) AS latest_mention_at,
                        (ARRAY_AGG(mm.message_id ORDER BY mm.created_at ASC))[1] AS oldest_mention_message_id
                 FROM message_mentions mm
                 JOIN messages m ON m.id = mm.message_id AND m.is_deleted = FALSE
                 WHERE mm.chat_id = c.id
                   AND mm.user_id = $1
                   AND c.type = 'group'
                   AND (ucs.mention_read_at IS NULL OR mm.created_at > ucs.mention_read_at)
             ) mentions ON TRUE
             ORDER BY ucs.archived_at DESC`,
            [req.user.id]
        );
        
        const chats = result.rows.map(c => ({
            id: c.id,
            type: c.type,
            title: c.title,
            ownerId: c.owner_id,
            avatarUrl: c.avatar_url,
            isSupergroup: c.is_supergroup || false,
            isPinned: false,
            isArchived: true,
            lastMessage: c.last_message_content || '',
            lastMessageEncrypted: c.last_message_encrypted || false,
            lastMessageIv: c.last_message_iv || null,
            lastMessageType: c.last_message_type || 'text',
            unreadCount: c.unread_count || 0,
            lastMessageAt: c.last_message_at,
            mentionCount: c.mention_count || 0,
            latestMentionAt: c.latest_mention_at || null,
            oldestMentionMessageId: c.oldest_mention_message_id || null,
            mentionReadAt: c.mention_read_at || null,
            archivedAt: c.user_archived_at
        }));
        
        res.json({ chats });
    } catch (error) {
        logger.error('❌ Get archived chats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// MESSAGE ROUTES
// ============================================

app.get('/api/v1/messages/:chatId', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50, offset = 0, topicId, includePolls = '1', parentMessageId } = req.query;

        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );

        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        const chatRes = await query('SELECT type, is_supergroup FROM chats WHERE id = $1', [chatId]);
        const chatTypeForList = chatRes.rows[0]?.type || 'private';
        const isSupergroup = chatRes.rows[0]?.is_supergroup || false;

        const memberRoleRes = await query(
            'SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        const isChannelAdmin = chatTypeForList === 'channel' && ['owner', 'admin'].includes(memberRoleRes.rows[0]?.role);

        let sql = `SELECT 
                m.id, m.chat_id, m.sender_id, m.content, m.content_plain, m.type, m.reply_to_message_id,
                m.parent_message_id, m.views_count, m.comment_count, m.is_silent, m.author_signature,
                m.scheduled_at, m.published_at,
                m.is_edited, m.edited_at, m.is_pinned, m.created_at,
                m.media_url, m.media_type, m.voice_duration,
                m.is_encrypted, m.encryption_iv,
                COALESCE(read_state.is_read, FALSE) AS is_read,
                u.username as sender_username, u.first_name as sender_first_name, u.avatar_url as sender_avatar, u.badge as sender_badge, u.badges as sender_badges, u.is_bot as sender_is_bot, u.is_premium as sender_is_premium,
                reply.content as reply_to_content,
                reply.is_encrypted as reply_to_encrypted,
                reply.encryption_iv as reply_to_iv,
                reply_user.first_name as reply_to_sender_first_name,
                reply_user.username as reply_to_sender_username,
                COALESCE(mentions.mentioned_user_ids, ARRAY[]::uuid[]) AS mentioned_user_ids
             FROM messages m
             LEFT JOIN users u ON m.sender_id = u.id
             LEFT JOIN messages reply ON m.reply_to_message_id = reply.id
             LEFT JOIN users reply_user ON reply.sender_id = reply_user.id
             LEFT JOIN LATERAL (
                SELECT bool_and(ucs.last_read_at IS NOT NULL AND ucs.last_read_at >= m.created_at) AS is_read
                FROM chat_members cm_readers
                LEFT JOIN user_chat_settings ucs
                  ON ucs.chat_id = cm_readers.chat_id
                 AND ucs.user_id = cm_readers.user_id
                WHERE cm_readers.chat_id = m.chat_id
                  AND cm_readers.user_id <> m.sender_id
                  AND cm_readers.joined_at <= m.created_at
             ) read_state ON TRUE
             LEFT JOIN LATERAL (
                SELECT ARRAY_AGG(mm.user_id ORDER BY mm.user_id) AS mentioned_user_ids
                FROM message_mentions mm
                WHERE mm.message_id = m.id
             ) mentions ON TRUE
             WHERE m.chat_id = $1 AND m.is_deleted = FALSE`;

        const params = [chatId];
        let paramIdx = 2;

        if (parentMessageId) {
            sql += ` AND m.parent_message_id = $${paramIdx++}`;
            params.push(parentMessageId);
        } else if (chatTypeForList === 'channel') {
            sql += ` AND m.parent_message_id IS NULL`;
            if (!isChannelAdmin) {
                sql += ` AND (m.scheduled_at IS NULL OR m.published_at IS NOT NULL)`;
            }
        }

        if (topicId && !parentMessageId) {
            if (topicId === 'null') {
                sql += ` AND m.topic_id IS NULL`;
            } else {
                sql += ` AND m.topic_id = $${paramIdx++}`;
                params.push(topicId);
            }
        } else if (isSupergroup && !parentMessageId) {
            sql += ` AND m.topic_id IS NULL`;
        }

        sql += ` ORDER BY m.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await query(sql, params);

        const messages = result.rows.reverse().map(m => ({
            id: m.id, 
            chatId: m.chat_id, 
            senderId: m.sender_id,
            senderUsername: m.sender_username, 
            senderFirstName: m.sender_first_name,
            senderAvatar: m.sender_avatar,
            senderBadge: m.sender_badge || null,
            senderBadges: m.sender_badges || [],
            senderIsBot: m.sender_is_bot || false,
            senderIsPremium: m.sender_is_premium || false,
            content: m.content,
            contentPlain: m.content_plain || null,
            type: m.type || m.media_type || 'text',
            mediaUrl: m.media_url,
            voiceDuration: m.voice_duration || 0,
            replyToMessageId: m.reply_to_message_id,
            replyToContent: m.reply_to_content,
            replyToEncrypted: m.reply_to_encrypted || false,
            replyToIv: m.reply_to_iv || null,
            replyToSenderName: m.reply_to_sender_first_name || m.reply_to_sender_username,
            isEdited: m.is_edited, 
            editedAt: m.edited_at,
            isPinned: m.is_pinned,
            isEncrypted: m.is_encrypted || false,
            encryptionIv: m.encryption_iv || null,
            mentionedUserIds: m.mentioned_user_ids || [],
            isRead: m.sender_id === req.user.id && !!m.is_read,
            parentMessageId: m.parent_message_id || null,
            viewsCount: m.views_count || 0,
            commentCount: m.comment_count || 0,
            isSilent: m.is_silent || false,
            authorSignature: m.author_signature || null,
            scheduledAt: m.scheduled_at || null,
            publishedAt: m.published_at || null,
            createdAt: m.created_at
        }));

        // Загружаем реакции для всех сообщений
        const messageIds = messages.map(m => m.id);
        if (messageIds.length > 0) {
            const reactionsResult = await query(`
                SELECT mr.message_id, mr.emoji, COUNT(*) as count,
                       bool_or(mr.user_id = $2) as my_reaction
                FROM message_reactions mr
                WHERE mr.message_id = ANY($1)
                GROUP BY mr.message_id, mr.emoji
                ORDER BY count DESC
            `, [messageIds, req.user.id]);
            
            const reactionsByMessage = {};
            for (const r of reactionsResult.rows) {
                if (!reactionsByMessage[r.message_id]) reactionsByMessage[r.message_id] = [];
                reactionsByMessage[r.message_id].push({ emoji: r.emoji, count: parseInt(r.count), myReaction: r.my_reaction });
            }
            messages.forEach(m => { m.reactions = reactionsByMessage[m.id] || []; });
        }

        if (includePolls !== '0') {
            await attachPollsToMessages(messages, req.user.id);
        }

        if (chatTypeForList === 'channel' && !parentMessageId) {
            const postIds = messages.filter(m => !m.parentMessageId).map(m => m.id);
            if (postIds.length > 0) {
                const previewRes = await query(`
                    WITH latest_per_user AS (
                        SELECT
                            c.parent_message_id,
                            c.sender_id,
                            u.first_name AS sender_first_name,
                            u.username AS sender_username,
                            u.avatar_url AS sender_avatar,
                            MAX(c.created_at) AS last_comment_at
                        FROM messages c
                        JOIN users u ON u.id = c.sender_id
                        WHERE c.parent_message_id = ANY($1::uuid[]) AND c.is_deleted = FALSE
                        GROUP BY c.parent_message_id, c.sender_id, u.first_name, u.username, u.avatar_url
                    ),
                    ranked AS (
                        SELECT *,
                            ROW_NUMBER() OVER (PARTITION BY parent_message_id ORDER BY last_comment_at DESC) AS rn
                        FROM latest_per_user
                    )
                    SELECT parent_message_id, sender_id, sender_first_name, sender_username, sender_avatar
                    FROM ranked
                    WHERE rn <= 3
                    ORDER BY parent_message_id, rn
                `, [postIds]);
                const previewByPost = {};
                for (const row of previewRes.rows) {
                    const pid = row.parent_message_id;
                    if (!previewByPost[pid]) previewByPost[pid] = [];
                    previewByPost[pid].push({
                        senderId: row.sender_id,
                        senderFirstName: row.sender_first_name,
                        senderUsername: row.sender_username,
                        senderAvatar: row.sender_avatar
                    });
                }
                messages.forEach(m => {
                    if (!m.parentMessageId) {
                        m.commentPreview = previewByPost[m.id] || [];
                    }
                });
            }
        }

        if (chatTypeForList === 'channel') {
            for (const msg of messages) {
                if (msg.senderId !== req.user.id) {
                    query(
                        `INSERT INTO message_views (message_id, user_id, viewed_at)
                         VALUES ($1, $2, NOW()) ON CONFLICT (message_id, user_id) DO NOTHING`,
                        [msg.id, req.user.id]
                    ).then(async (ins) => {
                        if (ins.rowCount > 0) {
                            await query(
                                'UPDATE messages SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1',
                                [msg.id]
                            );
                        }
                    }).catch(() => {});
                }
            }
        }

        res.json({ messages, chatType: chatTypeForList });
    } catch (error) {
        logger.error('❌ Get messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/v1/polls/batch', authMiddleware, async (req, res) => {
    try {
        const idsParam = req.query.ids;
        const messageIds = typeof idsParam === 'string' && idsParam.length
            ? idsParam.split(',').filter(Boolean)
            : [];
        const polls = await loadPollsBatch(messageIds, req.user.id);
        res.json({ polls });
    } catch (error) {
        logger.error('❌ Batch polls error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/polls/batch', authMiddleware, async (req, res) => {
    try {
        const { messageIds } = req.body || {};
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            return res.json({ polls: {} });
        }
        const polls = await loadPollsBatch(messageIds, req.user.id);
        res.json({ polls });
    } catch (error) {
        logger.error('❌ Batch polls error:', error);
        res.status(500).json({ error: error.message });
    }
});

/** Разбор @username, @here, @everyone в групповых чатах */
async function resolveGroupMentions(chatId, plainText, senderId) {
    if (!plainText || typeof plainText !== 'string') return [];

    const chatRow = await query('SELECT type FROM chats WHERE id = $1', [chatId]);
    if (chatRow.rows[0]?.type !== 'group') return [];

    const membersResult = await query(
        `SELECT u.id, u.username, u.is_bot,
                CASE WHEN u.is_bot = TRUE THEN FALSE
                     WHEN u.last_seen > NOW() - INTERVAL '5 minutes' THEN TRUE
                     ELSE FALSE END AS is_online
         FROM chat_members cm JOIN users u ON cm.user_id = u.id
         WHERE cm.chat_id = $1`,
        [chatId]
    );
    const members = membersResult.rows;
    const mentioned = new Set();

    if (/@everyone\b/i.test(plainText)) {
        for (const m of members) {
            if (m.id !== senderId && !m.is_bot) mentioned.add(m.id);
        }
    }
    if (/@here\b/i.test(plainText)) {
        for (const m of members) {
            if (m.id !== senderId && !m.is_bot && m.is_online) mentioned.add(m.id);
        }
    }

    const byUsername = new Map();
    for (const m of members) {
        if (m.username) byUsername.set(m.username.toLowerCase(), m.id);
    }

    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = mentionRegex.exec(plainText)) !== null) {
        const tag = match[1].toLowerCase();
        if (tag === 'here' || tag === 'everyone') continue;
        const uid = byUsername.get(tag);
        if (uid && uid !== senderId) mentioned.add(uid);
    }

    return [...mentioned];
}

app.post('/api/v1/messages/:chatId', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { content, type = 'text', replyTo, mediaUrl, mediaType, forwardFrom, voiceDuration, topicId, parentMessageId } = req.body;
        const { iv: encryptionIv, isEncrypted, contentPlain } = req.body;
        const { question, options, isAnonymous, allowMultiple } = req.body;
        const { scheduledAt, isSilent, authorSignature } = req.body;

        logger.info('📨 POST /api/v1/messages:', { chatId, type, mediaUrl: mediaUrl?.substring(0, 50), mediaType });

        // Проверяем мут
        if (req.user.is_muted) {
            const errorMessage = req.user.mute_reason
                ? req.t('mutedReason', { reason: req.user.mute_reason })
                : req.t('mutedCannotSend');
            return res.status(403).json({ error: errorMessage });
        }

        const memberCheck = await query(
            'SELECT role, muted_until FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );

        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        const member = memberCheck.rows[0];
        if (member.muted_until && new Date(member.muted_until) > new Date()) {
            return res.status(403).json({ error: 'Вы временно заглушены в этой группе', mutedUntil: member.muted_until });
        }

        const chatInfo = await query('SELECT type, title, slow_mode_seconds FROM chats WHERE id = $1', [chatId]);
        if (chatInfo.rows.length === 0) {
            return res.status(404).json({ error: 'Чат не найден' });
        }
        const chatType = chatInfo.rows[0].type || 'private';
        const chatTitle = chatInfo.rows[0].title || null;
        const slowModeSeconds = chatInfo.rows[0].slow_mode_seconds || 0;

        const isChannelComment = chatType === 'channel' && !!parentMessageId;

        if (isChannelComment) {
            const postCheck = await query(
                `SELECT id FROM messages WHERE id = $1 AND chat_id = $2 AND parent_message_id IS NULL AND is_deleted = FALSE`,
                [parentMessageId, chatId]
            );
            if (!postCheck.rows.length) {
                return res.status(404).json({ error: 'Пост не найден' });
            }
            if (!content && !mediaUrl) {
                return res.status(400).json({ error: 'Пустой комментарий' });
            }
            if (type === 'poll') {
                return res.status(400).json({ error: 'Опросы в комментариях не поддерживаются' });
            }
        } else if (chatType === 'channel') {
            if (!(await canPostToChannel(query, chatId, req.user.id))) {
                return res.status(403).json({ error: 'Только администраторы канала могут публиковать посты' });
            }
            if (type === 'poll') {
                return res.status(400).json({ error: 'Опросы в каналах не поддерживаются' });
            }
        }

        if (chatType === 'group' && slowModeSeconds > 0 && member.role === 'member') {
            const lastMessageResult = await query(
                `SELECT created_at FROM messages 
                 WHERE chat_id = $1 AND sender_id = $2 AND is_deleted = FALSE 
                 ORDER BY created_at DESC LIMIT 1`,
                [chatId, req.user.id]
            );
            if (lastMessageResult.rows.length > 0) {
                const lastMessageTime = new Date(lastMessageResult.rows[0].created_at);
                const secondsSinceLastMessage = Math.floor((Date.now() - lastMessageTime.getTime()) / 1000);
                if (secondsSinceLastMessage < slowModeSeconds) {
                    const retryAfter = slowModeSeconds - secondsSinceLastMessage;
                    return res.status(429).json({ 
                        error: `Медленный режим активен. Подождите еще ${retryAfter} сек.`, 
                        retryAfter 
                    });
                }
            }
        }

        if (type === 'poll') {
            if (chatType !== 'group') {
                return res.status(400).json({ error: req.t('pollGroupOnly') });
            }
            const pollQuestion = (question || content || '').trim();
            const pollOptions = Array.isArray(options)
                ? options.map(o => String(o || '').trim()).filter(Boolean)
                : [];
            if (!pollQuestion) {
                return res.status(400).json({ error: req.t('pollQuestionRequired') });
            }
            if (pollOptions.length < 2 || pollOptions.length > 10) {
                return res.status(400).json({ error: req.t('pollOptionsCount') });
            }
        }

        let dbTopicId = null;
        if (topicId && topicId !== 'null') {
            dbTopicId = topicId;
            const topicCheck = await query(
                'SELECT is_closed FROM chat_topics WHERE id = $1 AND chat_id = $2',
                [dbTopicId, chatId]
            );
            if (topicCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Тема не найдена' });
            }
            if (topicCheck.rows[0].is_closed) {
                return res.status(403).json({ error: 'Эта тема закрыта для отправки сообщений' });
            }
        }

        if (replyTo) {
            const replyCheck = await query(
                'SELECT id FROM messages WHERE id = $1 AND chat_id = $2 AND is_deleted = FALSE',
                [replyTo, chatId]
            );
            if (replyCheck.rows.length === 0) {
                return res.status(400).json({ error: req.t('replyNotFound') });
            }
        }

        const messageId = uuidv4();

        // Формируем контент для пересланного сообщения
        let messageContent = type === 'poll' ? (question || content || '').trim() : (content || '');
        if (forwardFrom) {
            messageContent = '↪️ ' + req.t('forwardedFrom', { name: forwardFrom }) + ':\n' + messageContent;
        }

        // Если сообщение не зашифровано, content_plain = content
        // Если зашифровано, используем переданный contentPlain
        const plainText = isEncrypted ? (contentPlain || '') : messageContent;

        let scheduledAtDb = null;
        let publishedAtDb = null;
        if (isChannelComment) {
            publishedAtDb = new Date();
        } else if (chatType === 'channel' && scheduledAt) {
            const schedDate = new Date(scheduledAt);
            if (!Number.isNaN(schedDate.getTime()) && schedDate.getTime() > Date.now() + 5000) {
                scheduledAtDb = schedDate;
                publishedAtDb = null;
            }
        }
        if (!scheduledAtDb) {
            publishedAtDb = new Date();
        }

        const channelSilent = chatType === 'channel' && !!isSilent;
        const channelSignature = chatType === 'channel' && authorSignature
            ? String(authorSignature).slice(0, 128)
            : null;

        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, content_plain, type, reply_to_message_id, parent_message_id, topic_id, media_url, media_type, voice_duration, is_encrypted, encryption_iv, scheduled_at, published_at, is_silent, author_signature, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())`,
            [messageId, chatId, req.user.id, messageContent, plainText, type, replyTo || null, parentMessageId || null, dbTopicId, mediaUrl || null, mediaType || null, voiceDuration || 0, isEncrypted || false, encryptionIv || null, scheduledAtDb, publishedAtDb, channelSilent, channelSignature]
        );

        if (parentMessageId) {
            await query(
                `UPDATE messages SET comment_count = COALESCE(comment_count, 0) + 1 WHERE id = $1`,
                [parentMessageId]
            );
        }

        if (type === 'poll') {
            const pollId = uuidv4();
            const pollOptions = options.map(o => String(o || '').trim()).filter(Boolean);
            await query(
                `INSERT INTO polls (id, message_id, question, is_anonymous, allow_multiple, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [pollId, messageId, messageContent, !!isAnonymous, !!allowMultiple]
            );
            for (let i = 0; i < pollOptions.length; i++) {
                await query(
                    `INSERT INTO poll_options (id, poll_id, text, position) VALUES ($1, $2, $3, $4)`,
                    [uuidv4(), pollId, pollOptions[i], i]
                );
            }
        }

        logger.info('✅ Message inserted:', messageId);

        let replyToData = null;
        if (replyTo) {
            const replyResult = await query(
                `SELECT m.content, m.is_encrypted, m.encryption_iv, u.first_name, u.username 
                 FROM messages m 
                 LEFT JOIN users u ON m.sender_id = u.id 
                 WHERE m.id = $1`,
                [replyTo]
            );
            if (replyResult.rows.length > 0) {
                replyToData = {
                    messageId: replyTo,
                    content: replyResult.rows[0].content,
                    isEncrypted: replyResult.rows[0].is_encrypted || false,
                    encryptionIv: replyResult.rows[0].encryption_iv || null,
                    senderName: replyResult.rows[0].first_name || replyResult.rows[0].username
                };
            }
        }



        const mentionedUserIds = chatType === 'group'
            ? await resolveGroupMentions(chatId, plainText, req.user.id)
            : [];

        if (mentionedUserIds.length > 0) {
            await query(
                `INSERT INTO message_mentions (message_id, chat_id, user_id, created_at)
                 SELECT $1, $2, unnest($3::uuid[]), NOW()
                 ON CONFLICT (message_id, user_id) DO NOTHING`,
                [messageId, chatId, mentionedUserIds]
            );
        }

        const message = {
            id: messageId, 
            chatId, 
            senderId: req.user.id, 
            sender: {
                id: req.user.id,
                username: req.user.username,
                firstName: req.user.first_name,
                lastName: req.user.last_name,
                avatarUrl: req.user.avatar_url,
                badge: req.user.badge || null,
                isBot: req.user.is_bot || false
            },
            content: messageContent, 
            type: mediaType || type, 
            mediaUrl: mediaUrl,
            voiceDuration: voiceDuration || 0,
            replyToMessageId: replyTo,
            replyToData: replyToData,
            forwardFrom: forwardFrom || null,
            isEncrypted: isEncrypted || false,
            encryptionIv: encryptionIv || null,
            mentionedUserIds,
            createdAt: new Date(),
            topicId: dbTopicId,
            isSilent: channelSilent,
            authorSignature: channelSignature,
            scheduledAt: scheduledAtDb,
            publishedAt: publishedAtDb,
            viewsCount: 0,
            commentCount: 0,
            parentMessageId: parentMessageId || null
        };

        if (type === 'poll') {
            message.poll = await buildPollPayload(messageId, req.user.id);
        }

        if (!scheduledAtDb) {
            if (parentMessageId) {
                broadcastToChat(chatId, {
                    type: 'channel_comment',
                    chatId,
                    postId: parentMessageId,
                    comment: message
                }, req.user.id);
            } else {
                broadcastToChat(chatId, { type: 'new_message', chatId, chatType, chatTitle, message }, req.user.id);
            }
        }

        // ── Обработка команд бота CraneApp ──────────────────────────────
        try {
            const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
            if (botResult.rows.length > 0) {
                const botId = botResult.rows[0].id;
                const isBotMember = await query(
                    `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
                    [chatId, botId]
                );
                if (isBotMember.rows.length > 0) {
                    const chatMeta = await query('SELECT title, type FROM chats WHERE id = $1', [chatId]);
                    const isPrivateBotChat = chatMeta.rows[0]?.type === 'private';

                    let botReply = null;
                    // Бот отвечает только в личных чатах (не в группах)
                    if (isPrivateBotChat) {
                        botReply = await handleBotCommand(content || '', req.user.id, botId, chatId, req.locale);
                    }

                    if (botReply) {
                        const botMsgId = uuidv4();
                        await query(
                            `INSERT INTO messages (id, chat_id, sender_id, content, type, created_at) VALUES ($1, $2, $3, $4, 'text', NOW())`,
                            [botMsgId, chatId, botId, botReply]
                        );
                        const botMessage = { id: botMsgId, chatId, senderId: botId, content: botReply, type: 'text', createdAt: new Date() };
                        broadcastToChat(chatId, { type: 'new_message', chatId, chatType, message: botMessage }, null);
                    }
                }
            }
        } catch (botErr) {
            logger.error('❌ Bot command error:', botErr.message, botErr.stack);
        }

        logger.info('✅ Message sent:', messageId);
        res.status(201).json({ message });
    } catch (error) {
        logger.error('❌ Send message error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/v1/messages/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Message content required' });
        }
        
        const msgCheck = await query('SELECT sender_id, chat_id FROM messages WHERE id = $1', [messageId]);
        
        if (msgCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        if (msgCheck.rows[0].sender_id !== req.user.id) {
            return res.status(403).json({ error: 'Cannot edit someone else message' });
        }
        
        await query(
            `UPDATE messages SET content = $1, is_edited = TRUE, edited_at = NOW() WHERE id = $2`,
            [content, messageId]
        );

        broadcastToChat(msgCheck.rows[0].chat_id, { type: 'message_edited', messageId, content, editedAt: new Date() });
        
        logger.info('✅ Message edited:', messageId);
        res.json({ success: true, content, editedAt: new Date() });
    } catch (error) {
        logger.error('❌ Edit message error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/messages/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { forEveryone = 'false' } = req.query;
        
        const msgCheck = await query('SELECT sender_id, chat_id FROM messages WHERE id = $1', [messageId]);
        
        if (msgCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        const message = msgCheck.rows[0];
        
        let canDelete = message.sender_id === req.user.id;
        if (!canDelete && forEveryone === 'true') {
            const callerCheck = await query(
                'SELECT role, permissions FROM chat_members WHERE chat_id = $1 AND user_id = $2',
                [message.chat_id, req.user.id]
            );
            if (callerCheck.rows.length > 0) {
                const caller = callerCheck.rows[0];
                if (caller.role === 'owner') {
                    canDelete = true;
                } else if (caller.role === 'admin') {
                    const perms = caller.permissions || {};
                    if (perms.can_delete_messages === true || perms.can_delete_messages === 'true') {
                        canDelete = true;
                    }
                }
            }
        }
        
        if (forEveryone === 'true' && !canDelete) {
            return res.status(403).json({ error: 'Only sender or group admin can delete for everyone' });
        }
        
        await query(`UPDATE messages SET is_deleted = TRUE, is_pinned = FALSE, pinned_at = NULL WHERE id = $1`, [messageId]);

        broadcastToChat(message.chat_id, { type: 'message_deleted', messageId, chatId: message.chat_id, forEveryone: forEveryone === 'true' });
        
        logger.info('✅ Message deleted:', messageId);
        res.json({ success: true });
    } catch (error) {
        logger.error('❌ Delete message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// PIN MESSAGE
// ============================================
app.post('/api/v1/messages/:messageId/pin', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const msgCheck = await query('SELECT id, chat_id FROM messages WHERE id = $1', [messageId]);
        
        if (msgCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        const chatId = msgCheck.rows[0].chat_id;
        
        // Проверяем, является ли пользователь участником чата
        const memberCheck = await query(
            'SELECT role, permissions FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );

        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        // В группах/каналах — только owner и admin с правами могут закреплять
        const chatType = await query('SELECT type FROM chats WHERE id = $1', [chatId]);
        const isGroup = chatType.rows[0]?.type === 'group' || chatType.rows[0]?.type === 'channel';
        const member = memberCheck.rows[0];
        if (isGroup) {
            let canPin = false;
            if (member.role === 'owner') {
                canPin = true;
            } else if (member.role === 'admin') {
                const perms = member.permissions || {};
                if (perms.can_pin_messages === true || perms.can_pin_messages === 'true') {
                    canPin = true;
                }
            }
            if (!canPin) {
                return res.status(403).json({ error: req.t('adminsPinOnly') || 'Only the creator or admin can pin messages' });
            }
        }

        // Проверяем лимит закрепленных сообщений (макс 50)
        const pinnedCount = await query(
            'SELECT COUNT(*) as cnt FROM messages WHERE chat_id = $1 AND is_pinned = TRUE AND is_deleted = FALSE',
            [chatId]
        );
        if (parseInt(pinnedCount.rows[0].cnt) >= 50) {
            return res.status(400).json({ error: 'Maximum 50 pinned messages per chat' });
        }

        // Проверяем, не закреплено ли уже
        const alreadyPinned = await query('SELECT is_pinned FROM messages WHERE id = $1', [messageId]);
        if (alreadyPinned.rows[0]?.is_pinned) {
            return res.status(400).json({ error: 'Message is already pinned' });
        }

        // Закрепляем сообщение
        await query(
            `UPDATE messages SET is_pinned = TRUE, pinned_at = NOW() WHERE id = $1`,
            [messageId]
        );

        // Получаем обновленное сообщение
        const pinnedMsg = await query(
            `SELECT m.*, u.username as sender_username, u.first_name as sender_first_name
             FROM messages m
             LEFT JOIN users u ON m.sender_id = u.id
             WHERE m.id = $1`,
            [messageId]
        );

        const msg = pinnedMsg.rows[0];
        const message = {
            id: msg.id,
            chatId: msg.chat_id,
            senderId: msg.sender_id,
            senderUsername: msg.sender_username,
            senderFirstName: msg.sender_first_name,
            content: msg.content,
            type: msg.media_type || msg.type,
            mediaUrl: msg.media_url,
            isPinned: true,
            isEncrypted: msg.is_encrypted || false,
            encryptionIv: msg.encryption_iv || null,
            createdAt: msg.created_at
        };
        
        broadcastToChat(chatId, { type: 'message_pinned', chatId, message }, req.user.id);
        
        logger.info('✅ Message pinned:', messageId);
        res.json({ success: true, isPinned: true, message });
    } catch (error) {
        logger.error('❌ Pin message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Открепить сообщение
app.delete('/api/v1/messages/:messageId/pin', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const msgCheck = await query('SELECT id, chat_id FROM messages WHERE id = $1', [messageId]);
        
        if (msgCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        const chatId = msgCheck.rows[0].chat_id;
        
        // Проверяем, является ли пользователь участником чата
        const memberCheck = await query(
            'SELECT role, permissions FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );

        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }

        // В группах/каналах — только owner и admin с правами могут откреплять
        const chatType = await query('SELECT type FROM chats WHERE id = $1', [chatId]);
        const isGroup = chatType.rows[0]?.type === 'group' || chatType.rows[0]?.type === 'channel';
        const member = memberCheck.rows[0];
        if (isGroup) {
            let canPin = false;
            if (member.role === 'owner') {
                canPin = true;
            } else if (member.role === 'admin') {
                const perms = member.permissions || {};
                if (perms.can_pin_messages === true || perms.can_pin_messages === 'true') {
                    canPin = true;
                }
            }
            if (!canPin) {
                return res.status(403).json({ error: req.t('adminsPinOnly') || 'Only the creator or admin can unpin messages' });
            }
        }

        await query(
            `UPDATE messages SET is_pinned = FALSE, pinned_at = NULL WHERE id = $1`,
            [messageId]
        );
        
        broadcastToChat(chatId, { type: 'message_unpinned', messageId, chatId });
        
        logger.info('✅ Message unpinned:', messageId);
        res.json({ success: true, isPinned: false });
    } catch (error) {
        logger.error('❌ Unpin message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получить закрепленное сообщение в чате
app.get('/api/v1/chats/:chatId/pinned', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        // Проверяем, является ли пользователь участником чата
        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ error: req.t('accessDenied') });
        }
        
        const result = await query(
            `SELECT m.*, u.username as sender_username, u.first_name as sender_first_name, u.avatar_url as sender_avatar
             FROM messages m
             LEFT JOIN users u ON m.sender_id = u.id
             WHERE m.chat_id = $1 AND m.is_pinned = TRUE AND m.is_deleted = FALSE
             ORDER BY m.pinned_at DESC
             LIMIT 50`,
            [chatId]
        );
        
        const messages = result.rows.map(msg => ({
            id: msg.id,
            chatId: msg.chat_id,
            senderId: msg.sender_id,
            senderUsername: msg.sender_username,
            senderFirstName: msg.sender_first_name,
            senderAvatar: msg.sender_avatar,
            content: msg.content,
            type: msg.media_type || msg.type,
            mediaUrl: msg.media_url,
            isPinned: true,
            pinnedAt: msg.pinned_at,
            isEncrypted: msg.is_encrypted || false,
            encryptionIv: msg.encryption_iv || null,
            createdAt: msg.created_at
        }));
        
        // Обратная совместимость: message = последнее закрепленное
        res.json({ message: messages[0] || null, messages });
    } catch (error) {
        logger.error('❌ Get pinned message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// E2E ENCRYPTION — KEY EXCHANGE
// ============================================

// Загрузить/обновить свой публичный ключ
app.post('/api/v1/encryption/keys', authMiddleware, async (req, res) => {
    try {
        const { publicKey, keyId } = req.body;
        if (!publicKey || !keyId) return res.status(400).json({ error: 'publicKey and keyId required' });

        await query(`
            INSERT INTO user_public_keys (user_id, public_key, key_id, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), NOW())
            ON CONFLICT (user_id) DO UPDATE SET public_key = $2, key_id = $3, updated_at = NOW()
        `, [req.user.id, publicKey, keyId]);

        res.json({ ok: true });
    } catch (e) {
        logger.error('❌ Upload key error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Получить публичный ключ пользователя
app.get('/api/v1/encryption/keys/:userId', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT public_key, key_id FROM user_public_keys WHERE user_id = $1',
            [req.params.userId]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Key not found' });
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Получить публичные ключи всех участников чата
app.get('/api/v1/encryption/chat-keys/:chatId', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: req.t('accessDenied') });

        const result = await query(`
            SELECT upk.user_id, upk.public_key, upk.key_id
            FROM chat_members cm
            JOIN user_public_keys upk ON cm.user_id = upk.user_id
            WHERE cm.chat_id = $1
        `, [chatId]);

        res.json({ keys: result.rows });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Сохранить зашифрованный сессионный ключ чата для пользователя
app.post('/api/v1/encryption/chat-keys/:chatId', authMiddleware, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { encryptedKeys } = req.body; // [{ userId, encryptedKey, senderKeyId }]
        if (!Array.isArray(encryptedKeys)) return res.status(400).json({ error: 'encryptedKeys array required' });

        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: req.t('accessDenied') });

        for (const { userId, encryptedKey, senderKeyId } of encryptedKeys) {
            await query(`
                INSERT INTO chat_encryption_keys (id, chat_id, user_id, encrypted_key, sender_key_id, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (chat_id, user_id) DO UPDATE SET encrypted_key = $4, sender_key_id = $5
            `, [uuidv4(), chatId, userId, encryptedKey, senderKeyId]);
        }

        res.json({ ok: true });
    } catch (e) {
        logger.error('❌ Save chat key error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Получить свой зашифрованный сессионный ключ чата
app.get('/api/v1/encryption/my-key/:chatId', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT encrypted_key, sender_key_id FROM chat_encryption_keys WHERE chat_id = $1 AND user_id = $2',
            [req.params.chatId, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'No key found' });
        res.json(result.rows[0]);
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================
// APPLE EMOJIS
// ============================================

const applemojis = require('applemojis');

app.get('/api/v1/emojis', (req, res) => {
    try {
        const all = applemojis.getAll();
        // Отдаём только code и base64 — минимум данных
        const data = all.map(e => ({ code: e.code, img: e.emoji }));
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.json({ emojis: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// POLLS
// ============================================

async function buildPollPayload(messageId, userId) {
    const pollResult = await query(
        `SELECT id, message_id, question, is_anonymous, allow_multiple
         FROM polls WHERE message_id = $1`,
        [messageId]
    );
    if (!pollResult.rows.length) return null;

    const poll = pollResult.rows[0];
    const optionsResult = await query(
        `SELECT id, text, position FROM poll_options
         WHERE poll_id = $1 ORDER BY position ASC`,
        [poll.id]
    );

    const votesResult = await query(
        `SELECT pv.option_id, pv.user_id,
                u.first_name, u.username, u.avatar_url
         FROM poll_votes pv
         JOIN users u ON pv.user_id = u.id
         WHERE pv.poll_id = $1`,
        [poll.id]
    );

    const myVotes = [];
    const votersByOption = {};
    const voteCounts = {};
    const voterIds = new Set();

    for (const opt of optionsResult.rows) {
        voteCounts[opt.id] = 0;
        votersByOption[opt.id] = [];
    }

    for (const vote of votesResult.rows) {
        voteCounts[vote.option_id] = (voteCounts[vote.option_id] || 0) + 1;
        voterIds.add(vote.user_id);
        if (vote.user_id === userId) myVotes.push(vote.option_id);
        if (!poll.is_anonymous) {
            votersByOption[vote.option_id].push({
                id: vote.user_id,
                firstName: vote.first_name || vote.username || 'User',
                avatarUrl: vote.avatar_url || null
            });
        }
    }

    return formatPollPayload(
        poll,
        optionsResult.rows,
        voteCounts,
        myVotes,
        voterIds.size,
        votersByOption
    );
}

function formatPollPayload(poll, options, voteCounts, myVotes, totalVoters, votersByOption, includeVoters = true) {
    const hasVoted = myVotes.length > 0;
    const attachVoters = includeVoters && hasVoted && !poll.is_anonymous;

    return {
        id: poll.id,
        question: poll.question,
        isAnonymous: poll.is_anonymous,
        allowMultiple: poll.allow_multiple,
        hasVoted,
        myVotes,
        totalVoters,
        options: options.map(opt => ({
            id: opt.id,
            text: opt.text,
            voteCount: voteCounts[opt.id] || 0,
            voters: attachVoters ? (votersByOption[opt.id] || []) : []
        }))
    };
}

async function loadPollsBatch(messageIds, userId) {
    const uniqueIds = [...new Set((messageIds || []).filter(Boolean))];
    if (!uniqueIds.length) return {};

    const msgResult = await query(
        `SELECT id, chat_id, type FROM messages
         WHERE id = ANY($1) AND is_deleted = FALSE`,
        [uniqueIds]
    );
    if (!msgResult.rows.length) return {};

    const chatIds = [...new Set(msgResult.rows.map(r => r.chat_id))];
    const memberResult = await query(
        `SELECT chat_id FROM chat_members
         WHERE user_id = $1 AND chat_id = ANY($2)`,
        [userId, chatIds]
    );
    const allowedChats = new Set(memberResult.rows.map(r => r.chat_id));

    const pollMessages = msgResult.rows
        .filter(r => r.type === 'poll' && allowedChats.has(r.chat_id))
        .map(r => ({ id: r.id, type: 'poll' }));

    await attachPollsToMessages(pollMessages, userId);

    const polls = {};
    for (const m of pollMessages) {
        if (m.poll) polls[m.id] = m.poll;
    }
    return polls;
}

async function attachPollsToMessages(messages, userId) {
    const pollMessages = messages.filter(m => m.type === 'poll');
    if (!pollMessages.length) return;

    const messageIds = pollMessages.map(m => m.id);

    const result = await query(
        `SELECT
            p.message_id,
            p.id AS poll_id,
            p.question,
            p.is_anonymous,
            p.allow_multiple,
            COALESCE(vt.total_voters, 0)::int AS total_voters,
            COALESCE(my_votes.option_ids, ARRAY[]::uuid[]) AS my_votes,
            COALESCE(opts.options_json, '[]'::json) AS options_json
         FROM polls p
         LEFT JOIN LATERAL (
            SELECT COUNT(DISTINCT user_id)::int AS total_voters
            FROM poll_votes pv WHERE pv.poll_id = p.id
         ) vt ON TRUE
         LEFT JOIN LATERAL (
            SELECT ARRAY_AGG(pv.option_id) AS option_ids
            FROM poll_votes pv
            WHERE pv.poll_id = p.id AND pv.user_id = $2
         ) my_votes ON TRUE
         LEFT JOIN LATERAL (
            SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                    'id', po.id,
                    'text', po.text,
                    'position', po.position,
                    'voteCount', COALESCE(vc.cnt, 0)
                ) ORDER BY po.position
            ) AS options_json
            FROM poll_options po
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS cnt FROM poll_votes pv2 WHERE pv2.option_id = po.id
            ) vc ON TRUE
            WHERE po.poll_id = p.id
         ) opts ON TRUE
         WHERE p.message_id = ANY($1::uuid[])`,
        [messageIds, userId]
    );
    if (!result.rows.length) return;

    const pollByMessageId = new Map(result.rows.map(row => [row.message_id, row]));

    for (const m of pollMessages) {
        const row = pollByMessageId.get(m.id);
        if (!row) continue;

        const rawOptions = Array.isArray(row.options_json) ? row.options_json : [];
        const options = rawOptions.map(opt => ({
            id: opt.id,
            text: opt.text,
            position: opt.position
        }));
        const voteCounts = {};
        for (const opt of rawOptions) {
            voteCounts[opt.id] = opt.voteCount || 0;
        }

        m.poll = formatPollPayload(
            {
                id: row.poll_id,
                question: row.question,
                is_anonymous: row.is_anonymous,
                allow_multiple: row.allow_multiple
            },
            options,
            voteCounts,
            row.my_votes || [],
            row.total_voters,
            {},
            false
        );
    }
}

app.get('/api/v1/polls/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const msgResult = await query(
            'SELECT chat_id, type FROM messages WHERE id = $1 AND is_deleted = FALSE',
            [messageId]
        );
        if (!msgResult.rows.length) return res.status(404).json({ error: req.t('messageNotFound') });
        if (msgResult.rows[0].type !== 'poll') {
            return res.status(400).json({ error: req.t('pollNotPollMessage') });
        }

        const chatId = msgResult.rows[0].chat_id;
        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: req.t('accessDenied') });

        const pollPayload = await buildPollPayload(messageId, req.user.id);
        if (!pollPayload) return res.status(404).json({ error: req.t('pollNotFound') });

        res.json({ poll: pollPayload });
    } catch (error) {
        logger.error('❌ Get poll error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/polls/:messageId/vote', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { optionIds } = req.body;

        if (!Array.isArray(optionIds) || optionIds.length === 0) {
            return res.status(400).json({ error: req.t('pollOptionIdsRequired') });
        }

        const msgResult = await query(
            'SELECT chat_id, type FROM messages WHERE id = $1 AND is_deleted = FALSE',
            [messageId]
        );
        if (!msgResult.rows.length) return res.status(404).json({ error: req.t('messageNotFound') });
        if (msgResult.rows[0].type !== 'poll') {
            return res.status(400).json({ error: req.t('pollNotPollMessage') });
        }

        const chatId = msgResult.rows[0].chat_id;
        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: req.t('accessDenied') });

        const chatType = await query('SELECT type FROM chats WHERE id = $1', [chatId]);
        if (chatType.rows[0]?.type !== 'group') {
            return res.status(400).json({ error: req.t('pollGroupOnly') });
        }

        const pollResult = await query('SELECT id, allow_multiple FROM polls WHERE message_id = $1', [messageId]);
        if (!pollResult.rows.length) return res.status(404).json({ error: req.t('pollNotFound') });

        const poll = pollResult.rows[0];
        const uniqueOptionIds = [...new Set(optionIds)];

        if (!poll.allow_multiple && uniqueOptionIds.length > 1) {
            return res.status(400).json({ error: req.t('pollSingleOptionOnly') });
        }

        const validOptions = await query(
            'SELECT id FROM poll_options WHERE poll_id = $1 AND id = ANY($2)',
            [poll.id, uniqueOptionIds]
        );
        if (validOptions.rows.length !== uniqueOptionIds.length) {
            return res.status(400).json({ error: req.t('pollInvalidOption') });
        }

        await query('DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [poll.id, req.user.id]);

        for (const optionId of uniqueOptionIds) {
            await query(
                `INSERT INTO poll_votes (id, poll_id, option_id, user_id, created_at)
                 VALUES ($1, $2, $3, $4, NOW())`,
                [uuidv4(), poll.id, optionId, req.user.id]
            );
        }

        const pollPayload = await buildPollPayload(messageId, req.user.id);
        broadcastToChat(chatId, { type: 'poll_updated', messageId, chatId }, null);

        res.json({ success: true, poll: pollPayload });
    } catch (error) {
        logger.error('❌ Poll vote error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/v1/polls/:messageId/vote', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;

        const msgResult = await query(
            'SELECT chat_id, type FROM messages WHERE id = $1 AND is_deleted = FALSE',
            [messageId]
        );
        if (!msgResult.rows.length) return res.status(404).json({ error: req.t('messageNotFound') });
        if (msgResult.rows[0].type !== 'poll') {
            return res.status(400).json({ error: req.t('pollNotPollMessage') });
        }

        const chatId = msgResult.rows[0].chat_id;
        const memberCheck = await query(
            'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
            [chatId, req.user.id]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: req.t('accessDenied') });

        const pollResult = await query('SELECT id FROM polls WHERE message_id = $1', [messageId]);
        if (!pollResult.rows.length) return res.status(404).json({ error: req.t('pollNotFound') });

        await query('DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [pollResult.rows[0].id, req.user.id]);

        const pollPayload = await buildPollPayload(messageId, req.user.id);
        broadcastToChat(chatId, { type: 'poll_updated', messageId, chatId }, null);

        res.json({ success: true, poll: pollPayload });
    } catch (error) {
        logger.error('❌ Poll retract vote error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// REACTIONS
// ============================================

app.post('/api/v1/messages/:messageId/reactions', authMiddleware, async (req, res) => {
    const { messageId } = req.params;
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'emoji required' });
    
    const msgCheck = await query('SELECT chat_id FROM messages WHERE id = $1', [messageId]);
    if (!msgCheck.rows.length) return res.status(404).json({ error: 'Message not found' });
    const chatId = msgCheck.rows[0].chat_id;
    const memberCheck = await query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, req.user.id]);
    if (!memberCheck.rows.length) return res.status(403).json({ error: req.t('accessDenied') });
    
    const existing = await query('SELECT id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [messageId, req.user.id, emoji]);
    let added;
    if (existing.rows.length > 0) {
        await query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [messageId, req.user.id, emoji]);
        added = false;
    } else {
        await query('INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES ($1, $2, $3, $4, NOW())', [uuidv4(), messageId, req.user.id, emoji]);
        added = true;
    }
    
    const reactions = await query(`
        SELECT emoji, COUNT(*) as count, 
               bool_or(user_id = $2) as my_reaction,
               array_agg(u.first_name ORDER BY mr.created_at) as users
        FROM message_reactions mr
        JOIN users u ON mr.user_id = u.id
        WHERE mr.message_id = $1
        GROUP BY emoji
        ORDER BY count DESC
    `, [messageId, req.user.id]);
    
    broadcastToChat(chatId, { type: 'reaction_updated', messageId, reactions: reactions.rows }, null);
    
    res.json({ success: true, added, reactions: reactions.rows });
});

app.get('/api/v1/messages/:messageId/reactions', authMiddleware, async (req, res) => {
    const { messageId } = req.params;
    const reactions = await query(`
        SELECT emoji, COUNT(*) as count,
               bool_or(user_id = $2) as my_reaction,
               array_agg(u.first_name ORDER BY mr.created_at) as users
        FROM message_reactions mr
        JOIN users u ON mr.user_id = u.id
        WHERE mr.message_id = $1
        GROUP BY emoji
        ORDER BY count DESC
    `, [messageId, req.user.id]);
    res.json({ reactions: reactions.rows });
});

// ============================================
// FAVORITES
// ============================================

// Получить избранные сообщения
app.get('/api/v1/messages/favorites', authMiddleware, async (req, res) => {
    try {
        const result = await query(`
            SELECT
                m.id, m.content, m.type, m.media_url, m.is_encrypted, m.encryption_iv,
                m.created_at,
                fm.saved_at,
                u.first_name as sender_first_name, u.username as sender_username, u.avatar_url as sender_avatar_url,
                c.title as chat_title, c.name as chat_name, c.type as chat_type,
                m.chat_id
            FROM favorite_messages fm
            JOIN messages m ON fm.message_id = m.id
            JOIN users u ON m.sender_id = u.id
            JOIN chats c ON m.chat_id = c.id
            WHERE fm.user_id = $1
            ORDER BY fm.saved_at DESC
            LIMIT 200
        `, [req.user.id]);

        const favorites = result.rows.map(r => ({
            id: r.id,
            content: r.content,
            type: r.type,
            mediaUrl: r.media_url,
            isEncrypted: r.is_encrypted,
            encryptionIv: r.encryption_iv,
            createdAt: r.created_at,
            savedAt: r.saved_at,
            senderFirstName: r.sender_first_name,
            senderUsername: r.sender_username,
            senderAvatarUrl: r.sender_avatar_url,
            chatTitle: r.chat_title,
            chatName: r.chat_name,
            chatId: r.chat_id
        }));

        res.json({ favorites });
    } catch (error) {
        logger.error('❌ Get favorites error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Добавить в избранное
app.post('/api/v1/messages/:messageId/favorite', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        await query(`
            INSERT INTO favorite_messages (user_id, message_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, message_id) DO NOTHING
        `, [req.user.id, messageId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Убрать из избранного
app.delete('/api/v1/messages/:messageId/favorite', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        await query(`
            DELETE FROM favorite_messages WHERE user_id = $1 AND message_id = $2
        `, [req.user.id, messageId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// WEBSOCKET
// ============================================

const connectedUsers = new Map();
// userId -> { type, roomId, kind, from, fromName, fromAvatar, title }
// Хранит call_incoming для пользователей, которых не было онлайн в момент звонка
const pendingCallInvites = new Map();

// Throttle last_seen updates: не чаще 1 раза в 30 секунд на пользователя
const _lastSeenTs = new Map();
function throttleLastSeen(userId) {
    const now = Date.now();
    if ((_lastSeenTs.get(userId) || 0) > now - 30000) return;
    _lastSeenTs.set(userId, now);
    query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId]).catch(() => {});
}

wss.on('connection', async (ws, req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    
    // Защита WebSocket от flood — максимум 5 соединений с одного IP
    const wsCount = WS_CONNECTIONS.get(ip) || 0;
    if (wsCount >= 5) {
        logger.warn(`🚫 WS flood: too many connections from ${ip}`);
        ws.close(1008, 'Too many connections');
        return;
    }
    WS_CONNECTIONS.set(ip, wsCount + 1);
    
    // Счётчик сообщений для защиты от WS flood
    let wsMessageCount = 0;
    let wsMessageResetAt = Date.now() + 1000;
    
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const userId = urlParams.get('userId') || 'anonymous-' + Date.now();

    logger.info('🔌 WebSocket connection:', userId, 'from', ip);

    // last_seen + рассылка статуса "онлайн" — в фоне, не блокируем WS-handshake
    if (userId && !userId.startsWith('anonymous')) {
        (async () => {
            try {
                await query('UPDATE users SET last_seen = NOW(), is_online = TRUE WHERE id = $1', [userId]);
                // Один JOIN вместо N+1: все пользователи, которые состоят в одном чате с userId
                const res = await query(
                    `SELECT DISTINCT cm2.user_id
                     FROM chat_members cm1
                     JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id AND cm2.user_id != $1
                     WHERE cm1.user_id = $1`,
                    [userId]
                );
                const statusMsg = JSON.stringify({
                    type: 'user_status', userId, isOnline: true,
                    lastSeen: new Date().toISOString()
                });
                for (const row of res.rows) {
                    const conns = connectedUsers.get(row.user_id);
                    if (!conns) continue;
                    for (const c of conns) {
                        if (c.readyState === WebSocket.OPEN) {
                            try { c.send(statusMsg); } catch (_) {}
                        }
                    }
                }
            } catch (_) {}
        })();
    }

    if (!connectedUsers.has(userId)) {
        connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(ws);

    ws.userId = userId;
    ws.isAlive = true;

    // Если есть незакрытый звонок для этого пользователя — отправляем сразу
    if (!userId.startsWith('anonymous')) {
        const _pending = pendingCallInvites.get(userId);
        if (_pending && callRoom.getRoom(_pending.roomId)) {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    try { ws.send(JSON.stringify(_pending)); } catch (_) {}
                }
            }, 800);
        } else if (_pending) {
            pendingCallInvites.delete(userId);
        }
    }

    // Ping/pong для проверки соединения
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', async (data) => {
        // Ограничение размера сообщения — 64KB
        if (data.length > 64 * 1024) {
            ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
            return;
        }

        let msg;
        try {
            msg = JSON.parse(data);
        } catch (_) {
            return;
        }

        // WS flood protection — WebRTC-сигнализация (ICE/SDP) не ограничивается,
        // т.к. браузер генерирует 20–30 ICE-кандидатов за 1 сек при подключении
        const isRtcSignaling = msg.type === 'call_ice' || msg.type === 'call_offer' ||
                               msg.type === 'call_answer' || msg.type === 'call_join';
        if (!isRtcSignaling) {
            const now = Date.now();
            if (now > wsMessageResetAt) {
                wsMessageCount = 0;
                wsMessageResetAt = now + 1000;
            }
            wsMessageCount++;
            if (wsMessageCount > 30) {
                logger.warn(`🚫 WS message flood from ${ip} (user: ${userId})`);
                ws.close(1008, 'Message rate limit exceeded');
                return;
            }
        }

        try {
            // Обновляем last_seen — не чаще 1 раза в 30 сек, не блокируем обработку
            if (userId && !userId.startsWith('anonymous')) throttleLastSeen(userId);
            
            switch (msg.type) {
                case 'chat_message':
                    if (msg.chatId && msg.message) {
                        broadcastToChat(msg.chatId, { type: 'new_message', chatId: msg.chatId, message: msg.message }, ws.userId);
                    }
                    break;
                case 'typing':
                    if (msg.chatId) {
                        broadcastToChat(msg.chatId, { type: 'user_typing', chatId: msg.chatId, userId: ws.userId }, ws.userId);
                    }
                    break;
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;

                // ===== Видеозвонки =====
                case 'call_join': {
                    if (!msg.roomId) break;
                    // Сохраняем callKind на комнате если клиент его прислал
                    const existingRoom = callRoom.getRoom(msg.roomId);
                    if (existingRoom && msg.callKind) existingRoom.callKind = msg.callKind;
                    const r = callRoom.joinRoom(msg.roomId, ws.userId, {
                        displayName: msg.displayName || null,
                        avatarUrl: msg.avatarUrl || null
                    });
                    if (!r.ok) {
                        ws.send(JSON.stringify({ type: 'call_error', reason: r.error }));
                        break;
                    }
                    // Сохраняем roomId на сокете
                    ws.callRoomId = msg.roomId;
                    // Шлём текущему — список существующих участников (peers)
                    ws.send(JSON.stringify({
                        type: 'call_joined',
                        roomId: msg.roomId,
                        peers: r.peers,
                        self: { userId: ws.userId }
                    }));
                    // Шлём остальным — что новый участник присоединился
                    sendToCallRoom(msg.roomId, {
                        type: 'call_peer_joined',
                        roomId: msg.roomId,
                        peer: { userId: ws.userId, displayName: msg.displayName || null, avatarUrl: msg.avatarUrl || null }
                    }, ws.userId);
                    break;
                }
                case 'call_leave': {
                    const roomId = ws.callRoomId || msg.roomId;
                    if (!roomId) break;
                    const lr = callRoom.leaveRoom(roomId, ws.userId);
                    sendToCallRoom(roomId, {
                        type: 'call_peer_left',
                        roomId,
                        peer: { userId: ws.userId }
                    }, ws.userId);
                    if (lr && lr.ok) saveCallMessage(lr).catch(() => {});
                    // Комната закрылась — уведомляем pending-адресатов и зачищаем
                    if (lr && lr.closed) {
                        for (const [uid, inv] of pendingCallInvites) {
                            if (inv.roomId === roomId) {
                                sendToUser(uid, { type: 'call_cancelled', roomId });
                                pendingCallInvites.delete(uid);
                            }
                        }
                    }
                    ws.callRoomId = null;
                    break;
                }
                case 'call_offer':
                case 'call_answer':
                case 'call_ice': {
                    if (!msg.to || !msg.payload) break;
                    sendToUser(msg.to, {
                        type: msg.type,
                        roomId: msg.roomId || ws.callRoomId,
                        from: ws.userId,
                        payload: msg.payload
                    });
                    break;
                }
                case 'call_invite': {
                    // Приглашение конкретного пользователя в комнату
                    if (!msg.to || !msg.roomId) break;
                    const _invite = {
                        type: 'call_incoming',
                        roomId: msg.roomId,
                        kind: msg.kind || 'video',
                        callType: msg.callType || 'p2p',
                        from: ws.userId,
                        fromName: msg.fromName || null,
                        fromAvatar: msg.fromAvatar || null,
                        title: msg.title || null
                    };
                    sendToUser(msg.to, _invite);
                    // Сохраняем invite — если адресат был офлайн, он получит его при подключении
                    pendingCallInvites.set(msg.to, _invite);
                    break;
                }
                case 'call_invite_response': {
                    // Ответ на приглашение (accepted/rejected) — уведомляем инициатора
                    if (!msg.to) break;
                    sendToUser(msg.to, {
                        type: 'call_invite_response',
                        roomId: msg.roomId,
                        from: ws.userId,
                        accepted: !!msg.accepted
                    });
                    // Invite обработан — убираем pending
                    pendingCallInvites.delete(ws.userId);
                    break;
                }

                default:
                    ws.send(JSON.stringify({ type: 'received', data: msg }));
            }
        } catch (error) {
            logger.error('❌ WS error:', error);
        }
    });

    ws.on('close', async () => {
        // Уменьшаем счётчик WS соединений для IP
        const currentCount = WS_CONNECTIONS.get(ip) || 1;
        if (currentCount <= 1) WS_CONNECTIONS.delete(ip);
        else WS_CONNECTIONS.set(ip, currentCount - 1);

        // Если пользователь был в видеозвонке — оповещаем остальных и убираем
        if (ws.callRoomId) {
            try {
                const lr = callRoom.leaveRoom(ws.callRoomId, ws.userId);
                sendToCallRoom(ws.callRoomId, {
                    type: 'call_peer_left',
                    roomId: ws.callRoomId,
                    peer: { userId: ws.userId }
                }, ws.userId);
                if (lr && lr.ok) saveCallMessage(lr).catch(() => {});
                // Комната закрылась при дисконнекте — уведомляем pending-адресатов и зачищаем
                if (lr && lr.closed) {
                    const _closedRoomId = ws.callRoomId;
                    for (const [uid, inv] of pendingCallInvites) {
                        if (inv.roomId === _closedRoomId) {
                            sendToUser(uid, { type: 'call_cancelled', roomId: _closedRoomId });
                            pendingCallInvites.delete(uid);
                        }
                    }
                }
            } catch (_) {}
            ws.callRoomId = null;
        }

        const userConnections = connectedUsers.get(userId);
        if (userConnections) {
            userConnections.delete(ws);
            if (userConnections.size === 0) {
                connectedUsers.delete(userId);
                
                // Рассылка статуса "оффлайн" — в фоне, один JOIN
                if (userId && !userId.startsWith('anonymous')) {
                    (async () => {
                        try {
                            await query('UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1', [userId]);
                            const res = await query(
                                `SELECT DISTINCT cm2.user_id
                                 FROM chat_members cm1
                                 JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id AND cm2.user_id != $1
                                 WHERE cm1.user_id = $1`,
                                [userId]
                            );
                            const statusMsg = JSON.stringify({
                                type: 'user_status', userId, isOnline: false,
                                lastSeen: new Date().toISOString()
                            });
                            for (const row of res.rows) {
                                const conns = connectedUsers.get(row.user_id);
                                if (!conns) continue;
                                for (const c of conns) {
                                    if (c.readyState === WebSocket.OPEN) {
                                        try { c.send(statusMsg); } catch (_) {}
                                    }
                                }
                            }
                        } catch (_) {}
                    })();
                }
            }
        }
        logger.info('🔌 WebSocket disconnected:', userId);
    });

    ws.send(JSON.stringify({ type: 'connected', userId, timestamp: new Date().toISOString() }));
});

// Ping всех подключений каждые 30 секунд
setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 15000); // 15 сек — меньше таймаута NAT мобильных операторов (~20-30 сек)

// Доставить сообщение конкретному пользователю (всем его открытым WS-сокетам)
function sendToUser(userId, message) {
    const conns = connectedUsers.get(userId);
    if (!conns || conns.size === 0) return false;
    const data = JSON.stringify(message);
    let sent = 0;
    for (const c of conns) {
        if (c.readyState === WebSocket.OPEN) {
            try { c.send(data); sent++; } catch (_) {}
        }
    }
    return sent > 0;
}

// Разослать всем участникам call-комнаты, кроме отправителя
function sendToCallRoom(roomId, message, exceptUserId) {
    const room = callRoom.getRoom(roomId);
    if (!room) return;
    const data = JSON.stringify(message);
    for (const p of room.participants.values()) {
        if (p.userId === exceptUserId) continue;
        const conns = connectedUsers.get(p.userId);
        if (!conns) continue;
        for (const c of conns) {
            if (c.readyState === WebSocket.OPEN) {
                try { c.send(data); } catch (_) {}
            }
        }
    }
}

async function broadcastToChat(chatId, message, excludeUserId) {
    try {
        const members = await query(
            'SELECT user_id FROM chat_members WHERE chat_id = $1',
            [chatId]
        );
        const memberIds = new Set(members.rows.map(r => r.user_id));
        const data = JSON.stringify(message);
        wss.clients.forEach(client => {
            if (
                client.readyState === WebSocket.OPEN &&
                client.userId !== excludeUserId &&
                memberIds.has(client.userId)
            ) {
                try { client.send(data); } catch (_) {}
            }
        });
    } catch (e) {
        logger.warn('⚠️ broadcastToChat error:', e.message);
    }
}

async function checkAndUpgradeToSupergroup(chatId) {
    try {
        const countRes = await query('SELECT COUNT(*) FROM chat_members WHERE chat_id = $1', [chatId]);
        const memberCount = parseInt(countRes.rows[0].count, 10);
        if (memberCount >= 200) {
            const chatRes = await query('SELECT type, is_supergroup FROM chats WHERE id = $1', [chatId]);
            if (chatRes.rows.length > 0) {
                const chat = chatRes.rows[0];
                if (chat.type === 'group' && !chat.is_supergroup) {
                    await query('UPDATE chats SET is_supergroup = TRUE WHERE id = $1', [chatId]);
                    logger.info(`⚡ Chat ${chatId} automatically upgraded to a Supergroup! Member count: ${memberCount}`);
                    
                    const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
                    const systemSenderId = botResult.rows.length ? botResult.rows[0].id : null;
                    if (systemSenderId) {
                        const msgId = uuidv4();
                        const systemMsgText = `Группа автоматически повышена до Супергруппы в связи с достижением 200 участников! 🚀`;
                        await query(
                            `INSERT INTO messages (id, chat_id, sender_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
                            [msgId, chatId, systemSenderId, systemMsgText]
                        );
                        await broadcastToChat(chatId, {
                            type: 'new_message',
                            chatId,
                            message: {
                                id: msgId,
                                chatId,
                                senderId: systemSenderId,
                                senderUsername: 'craneapp_bot',
                                senderFirstName: 'CraneApp Bot',
                                content: systemMsgText,
                                type: 'text',
                                createdAt: new Date().toISOString()
                            }
                        });
                    }
                    await broadcastToChat(chatId, {
                        type: 'chat_settings_updated',
                        chatId,
                        settings: {
                            isSupergroup: true
                        }
                    });
                }
            }
        }
    } catch (err) {
        logger.error('❌ Check/Upgrade to supergroup error:', err);
    }
}


// ============================================
// HEALTH & ERROR HANDLING
// ============================================

app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(), 
        uptime: process.uptime(),
        connections: wss.clients.size
    });
});

// Алиас для клиентской проверки
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.use((err, req, res, next) => {
    logger.error('❌ Error:', err);
    // Для API запросов — JSON ошибка
    if (req.path.startsWith('/api/')) {
        return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
    }
    // Для страниц — редирект на страницу ошибки
    res.status(err.status || 500).sendFile('client/mobile/screens/error/server-down.html', { root: process.cwd() });
});

// ============================================
// SUPPORT REQUESTS API
// ============================================

app.get('/api/v1/support/requests', authMiddleware, async (req, res) => {
    if (!isDeveloper(req.user.username)) return res.status(403).json({ error: req.t('accessDenied') });
    try {
        const result = await query(`
            SELECT sr.id, sr.message, sr.status, sr.created_at,
                   u.id as user_id, u.username, u.first_name, u.last_name, u.avatar_url, u.badges,
                   sr.chat_id
            FROM support_requests sr
            JOIN users u ON sr.user_id = u.id
            ORDER BY sr.created_at DESC
            LIMIT 100
        `);
        res.json({ requests: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/v1/support/requests/:id', authMiddleware, async (req, res) => {
    if (!isDeveloper(req.user.username)) return res.status(403).json({ error: req.t('accessDenied') });
    try {
        const { status } = req.body;
        await query('UPDATE support_requests SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Ответить на support request от имени бота
app.post('/api/v1/support/requests/:id/reply', authMiddleware, async (req, res) => {
    if (!isDeveloper(req.user.username)) return res.status(403).json({ error: req.t('accessDenied') });
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: req.t('messageRequired') });

        const reqResult = await query('SELECT * FROM support_requests WHERE id = $1', [req.params.id]);
        if (!reqResult.rows.length) return res.status(404).json({ error: req.t('requestNotFound') });
        if (reqResult.rows[0].status === 'closed') return res.status(400).json({ error: req.t('supportRequestClosed') });

        const supportReq = reqResult.rows[0];
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        if (!botResult.rows.length) return res.status(500).json({ error: req.t('botNotFound') });
        const botId = botResult.rows[0].id;

        // Находим чат пользователя с ботом
        const botChat = await query(
            `SELECT c.id FROM chats c
             JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
             JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
             WHERE c.type = 'private' LIMIT 1`,
            [supportReq.user_id, botId]
        );

        if (!botChat.rows.length) return res.status(404).json({ error: 'User bot chat not found' });

        const targetChatId = botChat.rows[0].id;
        const msgId = uuidv4();

        await query(
            `INSERT INTO messages (id, chat_id, sender_id, content, type, created_at) VALUES ($1, $2, $3, $4, 'text', NOW())`,
            [msgId, targetChatId, botId, message]
        );

        broadcastToChat(targetChatId, {
            type: 'new_message',
            chatId: targetChatId,
            message: { id: msgId, senderId: botId, content: message, type: 'text', createdAt: new Date() }
        }, null);

        await query('UPDATE support_requests SET status = $1 WHERE id = $2', ['closed', req.params.id]);

        res.json({ success: true, chatId: targetChatId });
    } catch (e) {
        logger.error('Support reply error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Получить историю чата пользователя с ботом (для разработчика)
app.get('/api/v1/support/requests/:id/messages', authMiddleware, async (req, res) => {
    if (!isDeveloper(req.user.username)) return res.status(403).json({ error: req.t('accessDenied') });
    try {
        const reqResult = await query('SELECT * FROM support_requests WHERE id = $1', [req.params.id]);
        if (!reqResult.rows.length) return res.status(404).json({ error: 'Not found' });

        const supportReq = reqResult.rows[0];
        const botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        if (!botResult.rows.length) return res.status(404).json({ error: 'Bot not found' });
        const botId = botResult.rows[0].id;

        const botChat = await query(
            `SELECT c.id FROM chats c
             JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
             JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
             WHERE c.type = 'private' LIMIT 1`,
            [supportReq.user_id, botId]
        );

        if (!botChat.rows.length) return res.json({ messages: [], chatId: null });

        const chatId = botChat.rows[0].id;
        const msgs = await query(
            `SELECT m.id, m.content, m.type, m.created_at, m.sender_id,
                    u.first_name, u.username, u.is_bot
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.chat_id = $1 AND m.is_deleted = FALSE
             ORDER BY m.created_at ASC LIMIT 100`,
            [chatId]
        );

        const userInfo = await query('SELECT first_name, username, avatar_url FROM users WHERE id = $1', [supportReq.user_id]);

        res.json({
            messages: msgs.rows,
            chatId,
            userId: supportReq.user_id,
            requestId: req.params.id,
            status: supportReq.status,
            user: userInfo.rows[0] || {}
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
});

async function handleBotCommand(text, userId, botId, chatId, locale) {
    if (!text || !text.startsWith('/')) {
        return null;
    }
    const lang = i18n.normalizeLanguage(locale) || await i18n.languageForUser(userId, query) || 'ru';
    const bt = (key, vars) => i18n.t(lang, key, vars);

    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    let username = '';
    try {
        const user = await query('SELECT username FROM users WHERE id = $1', [userId]);
        username = user.rows[0]?.username || '';
    } catch (e) {
        logger.warn('Bot: failed to get username', e.message);
    }

    const isDevUser = isDeveloper(username);

    // ── Команды для ВСЕХ пользователей ───────────────────────────────
    if (cmd === '/start' || cmd === '/help') {
        return bt('botHelp') + (isDevUser ? bt('botDevCommands') : '');
    }

    if (cmd === '/status') {
        try {
            const u = await query('SELECT username, is_premium, badges FROM users WHERE id = $1', [userId]);
            const r = u.rows[0];
            if (!r) return '❌ ' + bt('userNotFound');
            const badgeList = (r.badges || []).join(', ') || bt('none');
            return `👤 @${r.username}\n💎 Premium: ${r.is_premium ? bt('premiumYes') + ' ✓' : bt('premiumNo')}\n🏷 ${bt('botBadges')}: ${badgeList}`;
        } catch (e) {
            return '❌ ' + bt('botError', { message: e.message });
        }
    }

    if (cmd === '/support') {
        const msg = args.join(' ').trim();
        if (!msg) return '❌ ' + bt('botSupportUsage');
        try {
            // Проверяем cooldown 30 минут
            const lastReq = await query(
                `SELECT created_at FROM support_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [userId]
            );
            if (lastReq.rows.length) {
                const diff = Date.now() - new Date(lastReq.rows[0].created_at).getTime();
                const remaining = 30 * 60 * 1000 - diff;
                if (remaining > 0) {
                    const mins = Math.ceil(remaining / 60000);
                    return '⏳ ' + bt('botSupportCooldown', { minutes: mins });
                }
            }
            await query(
                'INSERT INTO support_requests (user_id, chat_id, message) VALUES ($1, $2, $3)',
                [userId, chatId, msg]
            );
            // Уведомляем разработчиков
            const devs = await query(`SELECT id FROM users WHERE username = ANY($1)`, [Array.from(DEVELOPERS)]);
            for (const dev of devs.rows) {
                try {
                    const botChat = await query(
                        `SELECT c.id FROM chats c JOIN chat_members cm1 ON c.id=cm1.chat_id AND cm1.user_id=$1 JOIN chat_members cm2 ON c.id=cm2.chat_id AND cm2.user_id=$2 WHERE c.type='private' LIMIT 1`,
                        [dev.id, botId]
                    );
                    if (botChat.rows.length) {
                        const notifId = uuidv4();
                        const devLang = await i18n.languageForUser(dev.id, query) || lang;
                        const notifText = i18n.t(devLang, 'botSupportNotification', { username, message: msg });
                        await query(`INSERT INTO messages (id, chat_id, sender_id, content, type, created_at) VALUES ($1,$2,$3,$4,'text',NOW())`,
                            [notifId, botChat.rows[0].id, botId, notifText]);
                        broadcastToChat(botChat.rows[0].id, { type: 'new_message', chatId: botChat.rows[0].id, message: { id: notifId, senderId: botId, content: notifText, type: 'text', createdAt: new Date() } }, null);
                    }
                } catch (_) {}
            }
            return '✅ ' + bt('botSupportSent');
        } catch (e) {
            return '❌ ' + bt('botError', { message: e.message });
        }
    }

    // ── Команды только для разработчиков ─────────────────────────────
    if (!isDevUser) return null;

    if (cmd === '/badge') {
        const target = (args[0] || '').replace('@', '');
        const badge = args[1] || '';
        if (!target) return '❌ ' + bt('botSpecifyUsername');
        const validBadges = ['verified', 'admin', 'developer', 'premium', 'fake', 'scam'];
        if (!validBadges.includes(badge)) return '❌ ' + bt('botAvailableBadges', { badges: validBadges.join(', ') });
        const t = await query('SELECT id, username, badges FROM users WHERE username = $1', [target]);
        if (!t.rows.length) return '❌ ' + bt('botUserNotFoundAt', { username: target });
        const uid = t.rows[0].id;
        if (badge === 'fake') {
            await query('UPDATE users SET is_fake = TRUE, is_scam = FALSE WHERE id = $1', [uid]);
        } else if (badge === 'scam') {
            await query('UPDATE users SET is_scam = TRUE, is_fake = FALSE WHERE id = $1', [uid]);
        } else {
            await query(`UPDATE users SET badges = array_append(COALESCE(badges,'{}'), $1) WHERE id = $2 AND NOT ($1 = ANY(COALESCE(badges,'{}')))`, [badge, uid]);
        }
        return '✅ ' + bt('botBadgeAdded', { username: target, badge });
    }

    if (cmd === '/unbadge') {
        const target = (args[0] || '').replace('@', '');
        const badge = args[1] || '';
        if (!target) return '❌ ' + bt('botSpecifyUsername');
        const t = await query('SELECT id, username FROM users WHERE username = $1', [target]);
        if (!t.rows.length) return '❌ ' + bt('botUserNotFoundAt', { username: target });
        if (badge) {
            await query(`UPDATE users SET badges = array_remove(COALESCE(badges,'{}'), $1) WHERE id = $2`, [badge, t.rows[0].id]);
            return '✅ ' + bt('botBadgeRemoved', { username: target, badge });
        } else {
            await query(`UPDATE users SET badges = '{}', is_fake = FALSE, is_scam = FALSE WHERE id = $1`, [t.rows[0].id]);
            return '✅ ' + bt('botBadgesCleared', { username: target });
        }
    }

    if (cmd === '/premium') {
        const target = (args[0] || '').replace('@', '');
        if (!target) return '❌ ' + bt('botSpecifyUsername');
        const t = await query('SELECT id, username, is_premium FROM users WHERE username = $1', [target]);
        if (!t.rows.length) return '❌ ' + bt('botUserNotFoundAt', { username: target });
        const newVal = !t.rows[0].is_premium;
        await query('UPDATE users SET is_premium = $1 WHERE id = $2', [newVal, t.rows[0].id]);
        return '✅ ' + bt(newVal ? 'botPremiumGranted' : 'botPremiumRemoved', { username: target });
    }

    if (cmd === '/mute') {
        const target = (args[0] || '').replace('@', '');
        const minutes = parseInt(args[1]) || 60;
        if (!target) return '❌ ' + bt('botSpecifyUsername');
        const t = await query('SELECT id, username FROM users WHERE username = $1', [target]);
        if (!t.rows.length) return '❌ ' + bt('botUserNotFoundAt', { username: target });
        const until = new Date(Date.now() + minutes * 60000);
        await query('UPDATE users SET is_muted = TRUE, muted_until = $1 WHERE id = $2', [until, t.rows[0].id]);
        return '🔇 ' + bt('botMuted', { username: target, minutes, time: until.toLocaleTimeString(lang) });
    }

    if (cmd === '/unmute') {
        const target = (args[0] || '').replace('@', '');
        if (!target) return '❌ ' + bt('botSpecifyUsername');
        const t = await query('SELECT id, username FROM users WHERE username = $1', [target]);
        if (!t.rows.length) return '❌ ' + bt('botUserNotFoundAt', { username: target });
        await query('UPDATE users SET is_muted = FALSE, muted_until = NULL WHERE id = $1', [t.rows[0].id]);
        return '🔊 ' + bt('botUnmuted', { username: target });
    }

    if (cmd === '/ban') {
        const target = (args[0] || '').replace('@', '');
        if (!target) return '❌ ' + bt('botSpecifyUsername');
        const t = await query('SELECT id, username FROM users WHERE username = $1', [target]);
        if (!t.rows.length) return '❌ ' + bt('botUserNotFoundAt', { username: target });
        await query('UPDATE users SET is_banned = TRUE WHERE id = $1', [t.rows[0].id]);
        // Отзываем все сессии
        security.revokeAllUserSessions(t.rows[0].id);
        return '🚫 ' + bt('botBanned', { username: target });
    }

    if (cmd === '/unban') {
        const target = (args[0] || '').replace('@', '');
        if (!target) return '❌ ' + bt('botSpecifyUsername');
        const t = await query('SELECT id, username FROM users WHERE username = $1', [target]);
        if (!t.rows.length) return '❌ ' + bt('botUserNotFoundAt', { username: target });
        await query('UPDATE users SET is_banned = FALSE WHERE id = $1', [t.rows[0].id]);
        return '✅ ' + bt('botUnbanned', { username: target });
    }

    if (cmd === '/info') {
        const target = (args[0] || '').replace('@', '');
        if (!target) return '❌ ' + bt('botSpecifyUsername');
        const t = await query(
            'SELECT username, first_name, last_name, is_premium, badge, is_fake, is_scam, is_muted, is_banned, created_at, last_seen FROM users WHERE username = $1',
            [target]
        );
        if (!t.rows.length) return '❌ ' + bt('botUserNotFoundAt', { username: target });
        const r = t.rows[0];
        return `👤 @${r.username} (${r.first_name || ''} ${r.last_name || ''})\n`
            + `💎 Premium: ${r.is_premium ? bt('premiumYes') : bt('premiumNo')}\n`
            + `🏷 ${bt('botBadge')}: ${r.badge || bt('none')}\n`
            + `⚠️ ${bt('botFake')}: ${r.is_fake ? bt('premiumYes') : bt('premiumNo')} | Scam: ${r.is_scam ? bt('premiumYes') : bt('premiumNo')}\n`
            + `🔇 ${bt('botMute')}: ${r.is_muted ? bt('premiumYes') : bt('premiumNo')}\n`
            + `🚫 ${bt('botBan')}: ${r.is_banned ? bt('premiumYes') : bt('premiumNo')}\n`
            + `📅 ${bt('botRegistration')}: ${new Date(r.created_at).toLocaleDateString(lang)}\n`
            + `🕐 ${bt('botLastSeen')}: ${r.last_seen ? new Date(r.last_seen).toLocaleString(lang) : bt('lastSeenUnknown')}`;
    }

    if (cmd === '/broadcast') {
        const msg = args.join(' ');
        if (!msg) return '❌ ' + bt('botBroadcastUsage');
        const allUsers = await query('SELECT id FROM users WHERE is_bot = FALSE AND is_banned = FALSE');
        let sent = 0;
        for (const u of allUsers.rows) {
            try {
                // Находим чат с ботом
                const botChat = await query(
                    `SELECT c.id FROM chats c
                     JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
                     JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
                     WHERE c.type = 'private' LIMIT 1`,
                    [u.id, botId]
                );
                if (botChat.rows.length) {
                    const msgId = uuidv4();
                    await query(
                        `INSERT INTO messages (id, chat_id, sender_id, content, type, created_at) VALUES ($1, $2, $3, $4, 'text', NOW())`,
                        [msgId, botChat.rows[0].id, botId, '📢 ' + msg]
                    );
                    broadcastToChat(botChat.rows[0].id, { type: 'new_message', chatId: botChat.rows[0].id, message: { id: msgId, senderId: botId, content: '📢 ' + msg, type: 'text', createdAt: new Date() } }, botId);
                    sent++;
                }
            } catch (_) {}
        }
        return '✅ ' + bt('botBroadcastSent', { count: sent });
    }

    if (cmd === '/stats') {
        const stats = await query(`
            SELECT
                (SELECT COUNT(*) FROM users WHERE is_bot = FALSE) as users,
                (SELECT COUNT(*) FROM users WHERE is_premium = TRUE) as premium,
                (SELECT COUNT(*) FROM users WHERE is_banned = TRUE) as banned,
                (SELECT COUNT(*) FROM chats) as chats,
                (SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '24 hours') as messages_today
        `);
        const r = stats.rows[0];
        return `📊 ${bt('botStatsTitle')}:\n👥 ${bt('botStatsUsers')}: ${r.users}\n💎 Premium: ${r.premium}\n🚫 ${bt('botStatsBanned')}: ${r.banned}\n💬 ${bt('botStatsChats')}: ${r.chats}\n📨 ${bt('botStatsMessagesToday')}: ${r.messages_today}`;
    }

    return '❓ ' + bt('botUnknownCommand');
}

async function createCraneAppBotChat(userId) {
    try {
        // Находим или создаём бота CraneApp
        let botResult = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
        let botId;
        
        if (botResult.rows.length === 0) {
            const oldBot = await query("SELECT id FROM users WHERE username = 'iris_ai'");
            if (oldBot.rows.length > 0) {
                botId = oldBot.rows[0].id;
                const avatarUrl = '/logo.png';
                await query(`UPDATE users SET username = 'craneapp_bot', first_name = 'CraneApp', avatar_url = $1, badge = 'verified', is_verified = TRUE WHERE id = $2`, [avatarUrl, botId]);
            } else {
                botId = uuidv4();
                // Фиксированный пароль для возможности входа в аккаунт бота: логин craneapp_bot, пароль CraneAppBot2026!
                const botPassword = 'CraneAppBot2026!';
                const hashedPassword = await bcrypt.hash(botPassword, 10);
                const avatarUrl = '/logo.png';
                // Пробуем разные варианты INSERT в зависимости от схемы БД
                try {
                    await query(
                        `INSERT INTO users (id, username, password_hash, first_name, last_name, phone, is_bot, is_verified, badge, avatar_url, created_at)
                         VALUES ($1, $2, $3, 'CraneApp', '', NULL, TRUE, TRUE, 'verified', $4, NOW())
                         ON CONFLICT (username) DO UPDATE SET first_name = 'CraneApp', is_verified = TRUE, badge = 'verified', avatar_url = $4`,
                        [botId, 'craneapp_bot', hashedPassword, avatarUrl]
                    );
                } catch (e1) {
                    logger.warn('⚠️ Bot insert v1 failed, trying v2:', e1.message);
                    await query(
                        `INSERT INTO users (id, username, password_hash, first_name, last_name, is_bot, is_verified, badge, avatar_url, created_at)
                         VALUES ($1, $2, $3, 'CraneApp', '', TRUE, TRUE, 'verified', $4, NOW())
                         ON CONFLICT (username) DO UPDATE SET first_name = 'CraneApp', is_verified = TRUE, badge = 'verified', avatar_url = $4`,
                        [botId, 'craneapp_bot', hashedPassword, avatarUrl]
                    );
                }
                // Перечитываем ID на случай ON CONFLICT
                const recheck = await query("SELECT id FROM users WHERE username = 'craneapp_bot'");
                if (recheck.rows.length > 0) botId = recheck.rows[0].id;
            }
        } else {
            botId = botResult.rows[0].id;
            // Обновляем существующего бота: добавляем аватар и галочку verified
            await query(
                `UPDATE users SET avatar_url = $1, badge = 'verified', is_verified = TRUE, is_bot = TRUE WHERE id = $2`,
                ['/logo.png', botId]
            ).catch(() => {});
        }

        // Проверяем существующий чат
        const existingChat = await query(
            `SELECT c.id FROM chats c
             JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
             JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
             WHERE c.type = 'private'`,
            [userId, botId]
        );

        if (existingChat.rows.length > 0) {
            return existingChat.rows[0].id;
        }

        const chatId = uuidv4();
        await query(
            `INSERT INTO chats (id, type, owner_id, created_at)
             VALUES ($1, 'private', $2, NOW())`,
            [chatId, userId]
        );
        // Обновляем title отдельно — на случай если колонка только что добавлена
        await query(`UPDATE chats SET title = 'CraneApp' WHERE id = $1`, [chatId]).catch(() => {});

        await query(
            `INSERT INTO chat_members (chat_id, user_id, role, joined_at)
             VALUES ($1, $2, 'owner', NOW()), ($1, $3, 'member', NOW())`,
            [chatId, userId, botId]
        );

        // Проверяем нет ли уже сообщений в чате
        const existingMsgs = await query('SELECT COUNT(*) FROM messages WHERE chat_id = $1', [chatId]);
        if (parseInt(existingMsgs.rows[0].count) === 0) {
            const lang = await i18n.languageForUser(userId, query) || 'ru';
            await query(
                `INSERT INTO messages (id, chat_id, sender_id, content, type, created_at)
                 VALUES ($1, $2, $3, $4, 'text', NOW())`,
                [uuidv4(), chatId, botId, i18n.t(lang, 'botWelcome')]
            );
        }

        logger.info('✅ CraneApp chat created for user:', userId);
        return chatId;
    } catch (error) {
        logger.error('❌ Create CraneApp chat error for user ' + userId + ':', error.message);
    }
}

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
        await autoMigrate();
        
        // Очищаем дубликаты при запуске
        await cleanDuplicatePrivateChats();

        setInterval(() => {
            publishScheduledMessages({ query, broadcastToChat, logger, uuidv4 }).catch((err) => {
                logger.error('❌ Scheduled channel publish error:', err.message);
            });
        }, 15000);
        
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

if (require.main === module) {
    start();
}

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
