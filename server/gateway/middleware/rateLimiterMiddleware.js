function createGatewayRateLimiters({ i18n, logger, rateLimit, trafficProtection }) {
    return {
        apiLimiter: createApiLimiter({ i18n, rateLimit }),
        authLimiter: createAuthLimiter({ i18n, logger, rateLimit, trafficProtection }),
        globalLimiter: createGlobalLimiter({ i18n, logger, rateLimit }),
        uploadLimiter: createUploadLimiter({ i18n, rateLimit }),
    };
}

function createGlobalLimiter({ i18n, logger, rateLimit }) {
    return rateLimit({
        windowMs: 60 * 1000,
        max: 600,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: getIp,
        handler: (req, res) => {
            const ip = getIp(req);
            logger.warn(`🚫 Rate limit exceeded: ${ip}`);
            res.set('Retry-After', '60');
            res.status(429).json({ error: i18n.t(i18n.languageFromHeaders(req), 'tooManyRequests') });
        },
    });
}

function createAuthLimiter({ i18n, logger, rateLimit, trafficProtection }) {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: getIp,
        handler: (req, res) => {
            const ip = getIp(req);
            logger.warn(`🚫 Auth rate limit exceeded: ${ip}`);
            trafficProtection.blockIp(ip, 30 * 60 * 1000);
            res.set('Retry-After', '1800');
            res.status(429).json({ error: i18n.t(i18n.languageFromHeaders(req), 'tooManyFailedAttempts', { minutes: 30 }) });
        },
    });
}

function createApiLimiter({ i18n, rateLimit }) {
    return rateLimit({
        windowMs: 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: getIp,
        handler: (req, res) => {
            res.set('Retry-After', '60');
            res.status(429).json({ error: (req.t || ((key) => i18n.t(i18n.languageFromHeaders(req), key)))('tooManyRequests') });
        },
    });
}

function createUploadLimiter({ i18n, rateLimit }) {
    return rateLimit({
        windowMs: 60 * 1000,
        max: 20,
        keyGenerator: getIp,
        handler: (req, res) => {
            res.set('Retry-After', '60');
            res.status(429).json({ error: (req.t || ((key) => i18n.t(i18n.languageFromHeaders(req), key)))('tooManyRequests') });
        },
    });
}

function getIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
}

module.exports = createGatewayRateLimiters;
