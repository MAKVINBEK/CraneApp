/**
 * CraneApp — End-to-End Encryption
 * 
 * Схема:
 *  1. При первом запуске генерируем пару ключей ECDH (P-256)
 *  2. Публичный ключ загружается на сервер
 *  3. При открытии чата — получаем публичные ключи собеседников
 *  4. Генерируем AES-256-GCM сессионный ключ для чата
 *  5. Шифруем сессионный ключ публичным ключом каждого участника (ECDH + AES-KW)
 *  6. Каждое сообщение шифруется сессионным ключом + уникальным IV
 *  7. Сервер хранит только зашифрованный текст — расшифровать может только клиент
 */

if (!window.E2E) {
const E2E = (() => {
    const DB_NAME = 'craneapp_e2e';
    const DB_VERSION = 1;
    const STORE_NAME = 'keys';

    // ── IndexedDB для хранения приватных ключей ────────────────────────────
    let dbPromise = null;

    function openDB() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = e => {
                    if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
                        e.target.result.createObjectStore(STORE_NAME);
                    }
                };
                req.onsuccess = e => resolve(e.target.result);
                req.onerror = () => {
                    dbPromise = null;
                    reject(req.error);
                };
            });
        }
        return dbPromise;
    }

    async function dbGet(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbSet(key, value) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const req = tx.objectStore(STORE_NAME).put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    // ── Утилиты ────────────────────────────────────────────────────────────
    function bufToB64(buf) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
    }

    function b64ToBuf(b64) {
        const bin = atob(b64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf.buffer;
    }

    function randomId() {
        return bufToB64(crypto.getRandomValues(new Uint8Array(16)));
    }

    // ── Генерация пары ключей ECDH ─────────────────────────────────────────
    async function generateKeyPair() {
        const pair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true, // extractable
            ['deriveKey', 'deriveBits']
        );
        return pair;
    }

    // ── Экспорт публичного ключа в base64 ─────────────────────────────────
    async function exportPublicKey(key) {
        const raw = await crypto.subtle.exportKey('spki', key);
        return bufToB64(raw);
    }

    // ── Импорт публичного ключа из base64 ─────────────────────────────────
    async function importPublicKey(b64) {
        const raw = b64ToBuf(b64);
        return crypto.subtle.importKey(
            'spki', raw,
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            [] // публичный ключ — только для derive
        );
    }

    // ── Derive общего секрета (ECDH) → AES-256-GCM ключ ──────────────────
    async function deriveSharedKey(privateKey, publicKey) {
        return crypto.subtle.deriveKey(
            { name: 'ECDH', public: publicKey },
            privateKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['wrapKey', 'unwrapKey']
        );
    }

    // ── Генерация сессионного AES-256-GCM ключа для чата ──────────────────
    async function generateSessionKey() {
        return crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    // ── Зашифровать сессионный ключ публичным ключом получателя ───────────
    async function wrapSessionKey(sessionKey, recipientPublicKeyB64, myPrivateKey) {
        const recipientPubKey = await importPublicKey(recipientPublicKeyB64);
        const sharedKey = await deriveSharedKey(myPrivateKey, recipientPubKey);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.wrapKey('raw', sessionKey, sharedKey, { name: 'AES-GCM', iv });
        return bufToB64(iv) + ':' + bufToB64(wrapped);
    }

    // ── Расшифровать сессионный ключ своим приватным ключом ───────────────
    async function unwrapSessionKey(wrappedB64, senderPublicKeyB64, myPrivateKey) {
        const [ivB64, keyB64] = wrappedB64.split(':');
        const iv = b64ToBuf(ivB64);
        const wrapped = b64ToBuf(keyB64);
        const senderPubKey = await importPublicKey(senderPublicKeyB64);
        const sharedKey = await deriveSharedKey(myPrivateKey, senderPubKey);
        return crypto.subtle.unwrapKey(
            'raw', wrapped, sharedKey,
            { name: 'AES-GCM', iv },
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // ── Зашифровать сообщение ─────────────────────────────────────────────
    async function encryptMessage(text, sessionKey) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, encoded);
        return {
            ciphertext: bufToB64(ciphertext),
            iv: bufToB64(iv)
        };
    }

    // ── Расшифровать сообщение ────────────────────────────────────────────
    async function decryptMessage(ciphertextB64, ivB64, sessionKey) {
        const ciphertext = b64ToBuf(ciphertextB64);
        const iv = b64ToBuf(ivB64);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sessionKey, ciphertext);
        return new TextDecoder().decode(decrypted);
    }

    // ── Кэш сессионных ключей (chatId → CryptoKey) ────────────────────────
    const sessionKeyCache = new Map();
    const sessionKeyInflight = new Map();

    // ── Публичный API ──────────────────────────────────────────────────────

    /**
     * Инициализация: генерируем/загружаем ключевую пару, публикуем публичный ключ
     */
    async function init(authToken) {
        try {
            // Проверяем есть ли уже ключи
            let privateKey = await dbGet('privateKey');
            let publicKeyB64 = await dbGet('publicKeyB64');
            let keyId = await dbGet('keyId');

            if (!privateKey || !publicKeyB64) {
                console.log('🔐 E2E: Generating new key pair...');
                const pair = await generateKeyPair();
                privateKey = pair.privateKey;
                publicKeyB64 = await exportPublicKey(pair.publicKey);
                keyId = randomId();

                await dbSet('privateKey', privateKey);
                await dbSet('publicKeyB64', publicKeyB64);
                await dbSet('keyId', keyId);
            }

            // Публикуем публичный ключ на сервер
            await fetch('/api/v1/encryption/keys', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken
                },
                body: JSON.stringify({ publicKey: publicKeyB64, keyId })
            });

            console.log('🔐 E2E: Initialized, key ID:', keyId.substring(0, 8) + '...');
            return true;
        } catch (e) {
            console.warn('⚠️ E2E init failed:', e);
            return false;
        }
    }

    /**
     * Получить или создать сессионный ключ для чата
     */
    async function getSessionKey(chatId, authToken) {
        if (sessionKeyCache.has(chatId)) return sessionKeyCache.get(chatId);
        if (sessionKeyInflight.has(chatId)) return sessionKeyInflight.get(chatId);

        const loadPromise = loadSessionKey(chatId, authToken);
        sessionKeyInflight.set(chatId, loadPromise);
        try {
            return await loadPromise;
        } finally {
            sessionKeyInflight.delete(chatId);
        }
    }

    async function loadSessionKey(chatId, authToken) {
        if (sessionKeyCache.has(chatId)) return sessionKeyCache.get(chatId);

        const privateKey = await dbGet('privateKey');
        const myKeyId = await dbGet('keyId');
        const myPublicKeyB64 = await dbGet('publicKeyB64');
        if (!privateKey) return null;

        // Пробуем загрузить существующий ключ с сервера
        try {
            const res = await fetch('/api/v1/encryption/my-key/' + chatId, {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });

            if (res.ok) {
                const { encrypted_key, sender_key_id } = await res.json();

                // Получаем публичный ключ отправителя ключа
                // Если sender_key_id == myKeyId — это мы сами создали ключ
                let senderPublicKeyB64;
                if (sender_key_id === myKeyId) {
                    senderPublicKeyB64 = myPublicKeyB64;
                } else {
                    // Ищем публичный ключ среди участников чата
                    const keysRes = await fetch('/api/v1/encryption/chat-keys/' + chatId, {
                        headers: { 'Authorization': 'Bearer ' + authToken }
                    });
                    if (keysRes.ok) {
                        const { keys } = await keysRes.json();
                        // Находим ключ по keyId (sender_key_id хранит userId отправителя)
                        const senderKey = keys.find(k => k.key_id === sender_key_id);
                        if (senderKey) senderPublicKeyB64 = senderKey.public_key;
                    }
                }

                if (senderPublicKeyB64) {
                    const sessionKey = await unwrapSessionKey(encrypted_key, senderPublicKeyB64, privateKey);
                    sessionKeyCache.set(chatId, sessionKey);
                    return sessionKey;
                }
            }
        } catch (e) {
            console.warn('⚠️ E2E: Could not load session key:', e);
        }

        // Создаём новый сессионный ключ
        try {
            const sessionKey = await generateSessionKey();

            // Получаем публичные ключи всех участников чата
            const keysRes = await fetch('/api/v1/encryption/chat-keys/' + chatId, {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });

            if (!keysRes.ok) {
                sessionKeyCache.set(chatId, sessionKey);
                return sessionKey;
            }

            const { keys } = await keysRes.json();
            if (!keys || keys.length === 0) {
                sessionKeyCache.set(chatId, sessionKey);
                return sessionKey;
            }

            // Шифруем сессионный ключ для каждого участника
            const encryptedKeys = [];
            for (const { user_id, public_key } of keys) {
                try {
                    const wrapped = await wrapSessionKey(sessionKey, public_key, privateKey);
                    encryptedKeys.push({ userId: user_id, encryptedKey: wrapped, senderKeyId: myKeyId });
                } catch (e) {
                    console.warn('⚠️ E2E: Could not wrap key for user', user_id);
                }
            }

            // Также шифруем для себя (если нас нет в списке)
            const myUserId = JSON.parse(localStorage.getItem('craneapp_user_data') || '{}').id;
            if (myUserId && !keys.find(k => k.user_id === myUserId)) {
                const wrapped = await wrapSessionKey(sessionKey, myPublicKeyB64, privateKey);
                encryptedKeys.push({ userId: myUserId, encryptedKey: wrapped, senderKeyId: myKeyId });
            }

            if (encryptedKeys.length > 0) {
                await fetch('/api/v1/encryption/chat-keys/' + chatId, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ encryptedKeys })
                });
            }

            sessionKeyCache.set(chatId, sessionKey);
            return sessionKey;
        } catch (e) {
            console.warn('⚠️ E2E: Could not create session key:', e);
            return null;
        }
    }

    /**
     * Зашифровать текст сообщения
     * Возвращает { content: '🔐<base64>', iv: '<base64>', isEncrypted: true }
     * или исходный объект если шифрование недоступно
     */
    async function encrypt(text, chatId, authToken) {
        try {
            const sessionKey = await getSessionKey(chatId, authToken);
            if (!sessionKey) return { content: text, isEncrypted: false };

            const { ciphertext, iv } = await encryptMessage(text, sessionKey);
            return { content: ciphertext, iv, isEncrypted: true };
        } catch (e) {
            console.warn('⚠️ E2E encrypt failed:', e);
            return { content: text, isEncrypted: false };
        }
    }

    /**
     * Расшифровать сообщение
     */
    async function decrypt(ciphertext, iv, chatId, authToken) {
        try {
            const sessionKey = await getSessionKey(chatId, authToken);
            if (!sessionKey) return ciphertext;
            return await decryptMessage(ciphertext, iv, sessionKey);
        } catch (e) {
            console.warn('⚠️ E2E decrypt failed:', e);
            return '🔒 [зашифровано]';
        }
    }

    /**
     * Сбросить кэш ключей (при смене чата или logout)
     */
    function clearCache(chatId) {
        if (chatId) sessionKeyCache.delete(chatId);
        else sessionKeyCache.clear();
    }

    return { init, encrypt, decrypt, getSessionKey, clearCache };
})();

window.E2E = E2E;
}
