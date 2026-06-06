/**
 * Global Theme Manager
 * Синхронизирует настройки темы между устройствами
 */

// ── Перехват ошибок API — выполняется ДО всего остального ─────────────────
(function() {
    if (window.location.pathname.includes('/error/')) return;
    const _origFetch = window.fetch;
    let _errShown = false;

    function _retryMin(res, body) {
        const h = res.headers.get('Retry-After');
        if (h) return Math.ceil(parseInt(h, 10) / 60);
        const m = (body?.error || '').match(/(\d+)\s*minute/i);
        return m ? parseInt(m[1], 10) : 1;
    }

    window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        const isApi = url.includes('/api/');
        try {
            const res = await _origFetch.apply(this, args);
            if (!isApi || _errShown) return res;
            if (res.status === 429 || res.status === 403) {
                // Не перенаправляем на экран блокировки при обычных бизнес-ошибках доступа к чатам, участникам, звонкам и сообщениям
                const isBusinessError = url.includes('/chats/') || url.includes('/members') || url.includes('/calls/') || url.includes('/messages/');
                if ((res.status === 403 || res.status === 429) && isBusinessError) {
                    return res;
                }

                const clone = res.clone();
                clone.json().then(body => {
                    if (_errShown) return; _errShown = true;
                    const min = _retryMin(res, body);
                    const msg = encodeURIComponent(body?.error || '');
                    location.href = '/client/mobile/screens/error/blocked.html?code=' + res.status + '&retry=' + min + '&msg=' + msg;
                }).catch(() => {
                    if (_errShown) return; _errShown = true;
                    location.href = '/client/mobile/screens/error/blocked.html?code=' + res.status;
                });
            } else if (res.status === 502 || res.status === 503 || res.status === 504) {
                _errShown = true;
                location.href = '/client/mobile/screens/error/server-down.html';
            }
            return res;
        } catch (e) {
            if (isApi && !_errShown) {
                _errShown = true;
                location.href = '/client/mobile/screens/error/server-down.html';
            }
            throw e;
        }
    };
})();

(function() {
    const defaultSettings = {
        theme: 'dark',
        accentColor: '#FF007F',
        fontSize: 'medium'
    };

    function getSettings() {
        const saved = localStorage.getItem('craneapp_settings');
        return saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings };
    }

    function saveSettingsLocal(settings) {
        localStorage.setItem('craneapp_settings', JSON.stringify(settings));
    }

    function applyTheme() {
        const settings = getSettings();
        
        // Применяем тему
        document.documentElement.setAttribute('data-theme', settings.theme);
        
        // Применяем цвет акцента
        document.documentElement.style.setProperty('--accent-color', settings.accentColor);
        document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${settings.accentColor}, #9D00FF)`);
        
        // Применяем размер шрифта
        const fontSizes = { small: '14px', medium: '16px', large: '18px' };
        const fontSize = fontSizes[settings.fontSize] || '16px';
        document.documentElement.style.setProperty('--base-font-size', fontSize);
        if (document.body) document.body.style.fontSize = fontSize;
        else document.addEventListener('DOMContentLoaded', () => { document.body.style.fontSize = fontSize; });
        
        console.log('🎨 Theme applied:', settings.theme, settings.accentColor, settings.fontSize);
    }

    // Синхронизация с сервером
    async function syncWithServer() {
        const token = localStorage.getItem('craneapp_auth_token');
        if (!token) return;

        try {
            const res = await fetch('/api/v1/users/all-settings', {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (res.ok) {
                const data = await res.json();

                // Применяем каждую группу настроек в localStorage
                if (data.settings && Object.keys(data.settings).length) {
                    const local = getSettings();
                    // Мержим аккуратно: не затираем локальные значения пустыми серверными
                    const merged = { ...local };
                    if (data.settings.theme) merged.theme = data.settings.theme;
                    if (data.settings.accentColor) merged.accentColor = data.settings.accentColor;
                    if (data.settings.fontSize) merged.fontSize = data.settings.fontSize;
                    if (data.settings.language) {
                        merged.language = data.settings.language;
                        localStorage.setItem('craneapp_language', data.settings.language);
                        if (window.i18n?.setLanguage && window.i18n.currentLang !== data.settings.language) {
                            window.i18n.setLanguage(data.settings.language);
                        }
                    }
                    if (data.settings.notifications !== undefined) merged.notifications = data.settings.notifications;
                    if (data.settings.sounds !== undefined) merged.sounds = data.settings.sounds;
                    saveSettingsLocal(merged);
                    applyTheme();
                }
                if (data.notificationSettings && Object.keys(data.notificationSettings).length) {
                    localStorage.setItem('craneapp_notification_settings', JSON.stringify(data.notificationSettings));
                }
                if (data.privacySettings && Object.keys(data.privacySettings).length) {
                    localStorage.setItem('craneapp_privacy_settings', JSON.stringify(data.privacySettings));
                }
                if (data.soundSettings && Object.keys(data.soundSettings).length) {
                    localStorage.setItem('craneapp_sound_settings', JSON.stringify(data.soundSettings));
                }
                if (data.storageSettings && Object.keys(data.storageSettings).length) {
                    localStorage.setItem('craneapp_data_settings', JSON.stringify(data.storageSettings));
                }
                if (data.advancedSettings && Object.keys(data.advancedSettings).length) {
                    localStorage.setItem('craneapp_advanced_settings', JSON.stringify(data.advancedSettings));
                }
                if (data.folders && data.folders.length) {
                    localStorage.setItem('craneapp_folders', JSON.stringify(data.folders));
                }
                if (data.passcodeEnabled !== undefined) {
                    localStorage.setItem('craneapp_passcode_enabled', data.passcodeEnabled ? 'true' : 'false');
                }

                console.log('🔄 All settings synced from server');
            }
        } catch (e) {
            console.warn('⚠️ Settings sync failed:', e);
        }
    }

    // Сохранение настроек на сервер (универсальный)
    async function saveSettingsToServer(settings) {
        const token = localStorage.getItem('craneapp_auth_token');
        if (!token) return;

        try {
            await fetch('/api/v1/users/all-settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ settings })
            });
        } catch (e) {
            console.warn('⚠️ Failed to save settings to server:', e);
        }
    }

    // Слушаем settings_updated от других устройств через WebSocket
    function listenForSettingsUpdates() {
        const token = localStorage.getItem('craneapp_auth_token');
        const userData = localStorage.getItem('craneapp_user_data');
        if (!token || !userData) return;

        const userId = JSON.parse(userData).id;
        if (!userId) return;

        // Не создаём отдельный WS если страница уже имеет свой (chats.html)
        if (window._chatWsConnected) return;
        // Не создаём если уже есть (notifications.js создаст)
        window._settingsSyncRegistered = true;
    }

    // Обновить тему (для вызова снаружи)
    async function updateTheme(theme) {
        const settings = getSettings();
        settings.theme = theme;
        saveSettingsLocal(settings);
        applyTheme();
        await saveSettingsToServer(settings);
    }

    // Обновить цвет акцента (для вызова снаружи)
    async function updateAccentColor(color) {
        const settings = getSettings();
        settings.accentColor = color;
        saveSettingsLocal(settings);
        applyTheme();
        await saveSettingsToServer(settings);
    }

    // Обновить размер шрифта (для вызова снаружи)
    async function updateFontSize(size) {
        const settings = getSettings();
        settings.fontSize = size;
        saveSettingsLocal(settings);
        applyTheme();
        await saveSettingsToServer(settings);
    }

    // ============================================
    // PASSCODE LOCK
    // ============================================
    function isPasscodeEnabled() {
        return localStorage.getItem('craneapp_passcode_enabled') === 'true';
    }

    function isUnlocked() {
        return sessionStorage.getItem('craneapp_unlocked') === 'true';
    }

    function setUnlocked() {
        sessionStorage.setItem('craneapp_unlocked', 'true');
    }

    function isAuthPage() {
        const path = window.location.pathname;
        return path.includes('/auth/') 
            || path.includes('passcode.html')
            || path.includes('login.html')
            || path.includes('register.html')
            || path.includes('phoneVerification.html')
            || window.__isPasscodePage === true;
    }

    function showPasscodeLock() {
        if (isAuthPage()) return;
        if (!isPasscodeEnabled()) return;
        if (isUnlocked()) return;
        if (document.getElementById('passcodeLockOverlay')) return; // уже показан

        const overlay = document.createElement('div');
        overlay.id = 'passcodeLockOverlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: var(--bg-primary, #000);
            z-index: 99999;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 40px 24px;
            font-family: system-ui, -apple-system, sans-serif;
            color: var(--text-primary, #fff);
        `;

        const lockTitle = window.i18n?.t('passcodeLockedTitle') || 'CraneApp заблокирован';
        const lockDesc = window.i18n?.t('passcodeLockedDesc') || 'Введите код-пароль для продолжения';

        overlay.innerHTML = `
            <div style="font-size:48px;margin-bottom:16px;">🔐</div>
            <div style="font-size:22px;font-weight:700;margin-bottom:8px;">${lockTitle}</div>
            <div style="font-size:14px;color:#B0B0B0;margin-bottom:40px;">${lockDesc}</div>
            <div id="lockDots" style="display:flex;gap:16px;margin-bottom:40px;">
                <div id="ld0" style="width:16px;height:16px;border-radius:50%;border:2px solid #666;transition:all 0.15s;"></div>
                <div id="ld1" style="width:16px;height:16px;border-radius:50%;border:2px solid #666;transition:all 0.15s;"></div>
                <div id="ld2" style="width:16px;height:16px;border-radius:50%;border:2px solid #666;transition:all 0.15s;"></div>
                <div id="ld3" style="width:16px;height:16px;border-radius:50%;border:2px solid #666;transition:all 0.15s;"></div>
            </div>
            <div id="lockNumpad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:280px;"></div>
            <div id="lockError" style="margin-top:20px;color:#FF4B4B;font-size:14px;min-height:20px;"></div>
        `;

        document.body.appendChild(overlay);

        let buf = '';
        let attempts = 0;

        function updateDots(state) {
            for (let i = 0; i < 4; i++) {
                const d = overlay.querySelector('#ld' + i);
                if (!d) return;
                if (state === 'error') {
                    d.style.background = '#FF4B4B';
                    d.style.borderColor = '#FF4B4B';
                } else if (i < buf.length) {
                    d.style.background = 'var(--accent-color, #FF007F)';
                    d.style.borderColor = 'var(--accent-color, #FF007F)';
                } else {
                    d.style.background = 'transparent';
                    d.style.borderColor = '#666';
                }
            }
        }

        async function checkCode() {
            const token = localStorage.getItem('craneapp_auth_token');
            try {
                const res = await fetch('/api/v1/users/passcode/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ passcode: buf })
                });
                if (res.ok) {
                    setUnlocked();
                    overlay.remove();
                } else {
                    fail();
                }
            } catch (e) {
                const stored = localStorage.getItem('craneapp_passcode');
                if (stored && stored === buf) {
                    setUnlocked();
                    overlay.remove();
                } else {
                    fail();
                }
            }
        }

        function fail() {
            attempts++;
            updateDots('error');
            const errEl = overlay.querySelector('#lockError');
            if (errEl) errEl.textContent = attempts >= 5
                ? (window.i18n?.t('passcodeTooMany') || 'Слишком много попыток. Войдите заново.')
                : (window.i18n?.t('passcodeWrong') || 'Неверный код');
            const dots = overlay.querySelector('#lockDots');
            if (dots) {
                dots.style.animation = 'lockShake 0.4s ease';
                setTimeout(() => { dots.style.animation = ''; }, 400);
            }
            if (attempts >= 5) {
                setTimeout(() => {
                    localStorage.removeItem('craneapp_auth_token');
                    localStorage.removeItem('craneapp_user_data');
                    window.location.href = '/client/mobile/screens/auth/login.html';
                }, 1500);
                return;
            }
            setTimeout(() => { buf = ''; updateDots(); }, 500);
        }

        // Строим кнопки через JS, не через innerHTML с onclick
        const numpadKeys = ['1','2','3','4','5','6','7','8','9','','0','DEL'];
        const numpad = overlay.querySelector('#lockNumpad');
        numpadKeys.forEach(k => {
            const btn = document.createElement('button');
            btn.textContent = k === 'DEL' ? '⌫' : k;
            btn.style.cssText = `
                height:72px; border-radius:50%; border:none;
                background:${k === '' ? 'transparent' : 'rgba(255,255,255,0.08)'};
                color:var(--text-primary,#fff); font-size:24px; font-weight:500;
                cursor:${k === '' ? 'default' : 'pointer'};
                display:flex; align-items:center; justify-content:center;
                transition:background 0.1s; width:100%;
            `;
            if (k === '') {
                btn.disabled = true;
            } else {
                btn.addEventListener('click', () => {
                    if (k === 'DEL') {
                        buf = buf.slice(0, -1);
                        updateDots();
                    } else if (buf.length < 4) {
                        buf += k;
                        updateDots();
                        if (buf.length === 4) setTimeout(checkCode, 150);
                    }
                });
            }
            numpad.appendChild(btn);
        });

        // Анимация shake
        if (!document.getElementById('lockShakeStyle')) {
            const style = document.createElement('style');
            style.id = 'lockShakeStyle';
            style.textContent = '@keyframes lockShake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }';
            document.head.appendChild(style);
        }
    }

    // Service Worker — офлайн страница при полном отключении сервера
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/client/mobile/scripts/sw.js').catch(() => {});
    }

    // Применяем локальную тему сразу
    applyTheme();

    // Подключаем глобальные стили и анимации
    (function loadStyles() {
        if (!document.getElementById('craneAnimations')) {
            const a = document.createElement('link');
            a.id = 'craneAnimations';
            a.rel = 'stylesheet';
            a.href = '/client/mobile/styles/animations.css';
            document.head.appendChild(a);
        }
        if (!document.getElementById('craneGlobal')) {
            const g = document.createElement('link');
            g.id = 'craneGlobal';
            g.rel = 'stylesheet';
            g.href = '/client/mobile/styles/global.css';
            document.head.appendChild(g);
        }
        // Apple Emoji уже подключены отдельным скриптом
        // Twemoji отключён
    })();

    // Показываем блокировку если нужно
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showPasscodeLock);
    } else {
        showPasscodeLock();
    }

    // Синхронизируем с сервером после загрузки страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncWithServer);
    } else {
        syncWithServer();
    }

    // Применяем при возврате на страницу
    window.addEventListener('pageshow', () => {
        applyTheme();
        syncWithServer();
        if (!isAuthPage()) showPasscodeLock();
    });

    // Глобальные функции
    window.applyTheme = applyTheme;
    window.syncThemeWithServer = syncWithServer;
    window.updateTheme = updateTheme;
    window.updateAccentColor = updateAccentColor;
    window.updateFontSize = updateFontSize;

    // Подключаем сервис уведомлений
    (function loadNotifications() {
        const path = window.location.pathname;
        if (path.includes('/auth/') || path.includes('login.html') || path.includes('register.html')) return;
        const s = document.createElement('script');
        s.src = '/client/mobile/scripts/notifications.js';
        document.head.appendChild(s);
    })();

    // Подключаем Apple Emoji
    (function loadAppleEmoji() {
        const path = window.location.pathname;
        if (path.includes('/auth/') || path.includes('login.html') || path.includes('register.html')) return;
        if (document.getElementById('apple-emoji-script')) return;
        const s = document.createElement('script');
        s.id = 'apple-emoji-script';
        s.src = '/client/mobile/scripts/apple-emoji.js';
        document.head.appendChild(s);
    })();
    // Подключаем E2E шифрование
    (function loadE2E() {
        const path = window.location.pathname;
        if (path.includes('/auth/') || path.includes('login.html') || path.includes('register.html')) return;
        if (document.getElementById('e2e-crypto-script')) return;
        const s = document.createElement('script');
        s.id = 'e2e-crypto-script';
        s.src = '/client/mobile/scripts/e2e-crypto.js';
        s.onload = () => {
            const token = localStorage.getItem('craneapp_auth_token');
            if (token && window.E2E) window.E2E.init(token);
        };
        document.head.appendChild(s);
    })();
    (function loadSounds() {
        const s = document.createElement('script');
        s.src = '/client/mobile/assets/sounds/sounds.js';
        document.head.appendChild(s);
    })();

    // Применяем язык через единый i18n runtime
    (function applyLanguage() {
        const apply = () => window.i18n && window.i18n.translatePage();

        if (window.i18n) {
            apply();
            return;
        }

        const existing = document.querySelector('script[src$="/scripts/i18n.js"],script[src*="scripts/i18n.js"]');
        if (existing) {
            existing.addEventListener('load', apply, { once: true });
            setTimeout(apply, 200);
            return;
        }

        const s = document.createElement('script');
        s.id = 'crane-i18n-script';
        s.src = '/client/mobile/scripts/i18n.js';
        s.onload = apply;
        document.head.appendChild(s);
    })();



})();
