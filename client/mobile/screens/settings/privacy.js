const token = localStorage.getItem('craneapp_auth_token');
        if (!token) window.location.href = '../auth/login.html';

        const DEFAULTS = {
            lastSeen: 'all', photoVisibility: 'all',
            twoFactorAuth: false, autoDeleteAccount: true, e2eEncryption: false
        };

        let settings = { ...DEFAULTS };
        let blockedUsers = [];

        const valueLabels = { all: 'Все', contacts: 'Мои контакты', none: 'Никто' };

        // ── Загрузка ──────────────────────────────────────────────────────
        async function loadSettings() {
            // Сначала применяем локальный кэш мгновенно
            const cached = localStorage.getItem('craneapp_privacy_settings');
            if (cached) {
                try { settings = { ...DEFAULTS, ...JSON.parse(cached) }; } catch (_) {}
            }
            updateUI();

            // Затем тянем с сервера
            try {
                const res = await fetch('/api/v1/users/all-settings', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.privacySettings && Object.keys(data.privacySettings).length) {
                        settings = { ...DEFAULTS, ...data.privacySettings };
                        localStorage.setItem('craneapp_privacy_settings', JSON.stringify(settings));
                    }
                    // Статус passcode
                    const passcodeEl = document.getElementById('passcodeValue');
                    if (passcodeEl) {
                    passcodeEl.textContent = data.passcodeEnabled ? (window.i18n?.t('on') || 'Вкл') : (window.i18n?.t('off') || 'Выкл');
                    }
                }
            } catch (e) {
                console.warn('Load privacy settings failed:', e);
            }

            await loadBlockedUsers();
            updateUI();
        }

        async function loadBlockedUsers() {
            try {
                const res = await fetch('/api/v1/users/blocked', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    blockedUsers = data.blocked || [];
                }
            } catch (e) {
                console.warn('Load blocked users failed:', e);
            }
        }

        // ── UI ────────────────────────────────────────────────────────────
        function updateUI() {
            document.getElementById('lastSeenValue').textContent       = valueLabels[settings.lastSeen]       || 'Все';
            document.getElementById('photoVisibilityValue').textContent = valueLabels[settings.photoVisibility] || 'Все';

            updateToggle('toggle2FA',        settings.twoFactorAuth);
            update2FAStatus();            updateToggle('toggleE2E',        settings.e2eEncryption);
            updateToggle('toggleAutoDelete', settings.autoDeleteAccount);

            renderBlockedUsers();
        }

        function updateToggle(id, value) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.toggle('active', !!value);
        }

        function renderBlockedUsers() {
            const container = document.getElementById('blockedList');
            if (blockedUsers.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div style="font-size:48px;margin-bottom:12px;opacity:0.5;line-height:1;">🚫</div>
                        <div>Нет заблокированных пользователей</div>
                    </div>`;
                return;
            }
            container.innerHTML = blockedUsers.map(u => `
                <div class="blocked-user" data-id="${u.id}">
                    <div class="blocked-avatar">
                        ${u.avatarUrl
                            ? `<img src="${u.avatarUrl}" alt="">`
                            : (u.firstName || u.username || '?')[0].toUpperCase()}
                    </div>
                    <div class="blocked-info">
                        <div class="blocked-name">${u.firstName || u.username || 'Пользователь'}</div>
                        <div class="blocked-username">@${u.username || ''}</div>
                    </div>
                    <button class="unblock-btn" onclick="unblockUser('${u.id}')">Разблокировать</button>
                </div>
            `).join('');
        }

        // ── Сохранение ────────────────────────────────────────────────────
        async function saveSettings() {
            localStorage.setItem('craneapp_privacy_settings', JSON.stringify(settings));
            try {
                await fetch('/api/v1/users/all-settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ privacySettings: settings })
                });
            } catch (e) {
                console.warn('Save privacy settings failed:', e);
            }
        }

        // ── Тоггл ─────────────────────────────────────────────────────────
        async function toggleSetting(el, key) {
            el.classList.toggle('active');
            settings[key] = el.classList.contains('active');
            await saveSettings();
            showToast('success', settings[key] ? (window.i18n?.t('enabledToast') || 'Включено') : (window.i18n?.t('disabledToast') || 'Выключено'), '✓');
        }

        // ── Picker ────────────────────────────────────────────────────────
        let currentPickerKey = null;

        function showPicker(key, options) {
            currentPickerKey = key;
            const titles = {
                lastSeen: 'Последний визит',
                photoVisibility: 'Фото профиля'
            };
            document.getElementById('pickerTitle').textContent = titles[key] || 'Выберите';
            document.getElementById('pickerOptions').innerHTML = options.map(opt => `
                <div class="picker-option ${settings[key] === opt ? 'selected' : ''}" onclick="selectOption('${opt}')">
                    <span>${valueLabels[opt] || opt}</span>
                    ${settings[key] === opt ? '<span class="picker-option-check">✓</span>' : ''}
                </div>
            `).join('');
            document.getElementById('pickerOverlay').classList.add('active');
            setTimeout(() => document.getElementById('pickerModal').classList.add('active'), 10);
        }

        async function selectOption(value) {
            settings[currentPickerKey] = value;
            const valueMap = {
                lastSeen: 'lastSeenValue',
                photoVisibility: 'photoVisibilityValue'
            };
            if (valueMap[currentPickerKey]) {
                document.getElementById(valueMap[currentPickerKey]).textContent = valueLabels[value];
            }
            await saveSettings();
            closePicker();
            showToast('success', 'Сохранено', '✓');
        }

        function closePicker() {
            document.getElementById('pickerOverlay').classList.remove('active');
            document.getElementById('pickerModal').classList.remove('active');
        }

        // ── Разблокировка ─────────────────────────────────────────────────
        async function unblockUser(userId) {
            if (!confirm(window.i18n?.t('unblockUserConfirm') || 'Разблокировать пользователя?')) return;
            try {
                const res = await fetch('/api/v1/users/blocked/' + userId, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    blockedUsers = blockedUsers.filter(u => u.id !== userId);
                    renderBlockedUsers();
                    showToast('success', 'Пользователь разблокирован', '✓');
                } else {
                    showToast('error', 'Ошибка', '❌');
                }
            } catch (e) {
                showToast('error', 'Ошибка сети', '❌');
            }
        }

        // ── Toast ─────────────────────────────────────────────────────────
        function showToast(type, message, icon) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }

        // ── Обновление при возврате на страницу ───────────────────────────
        window.addEventListener('pageshow', () => {
            // Обновляем статус passcode при возврате со страницы passcode.html
            const enabled = localStorage.getItem('craneapp_passcode_enabled') === 'true';
            const el = document.getElementById('passcodeValue');
            if (el) el.textContent = enabled ? (window.i18n?.t('on') || 'Вкл') : (window.i18n?.t('off') || 'Выкл');
        });

        // ── 2FA ───────────────────────────────────────────────────────────
        let twoFAEnabled = false;

        async function check2FAStatus() {
            try {
                const res = await fetch('/api/v1/auth/2fa/status', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    twoFAEnabled = data.enabled;
                    update2FAStatus();
                }
            } catch (e) {}
        }

        function update2FAStatus() {
            document.getElementById('twoFAStatus').textContent = twoFAEnabled ? (window.i18n?.t('on') || 'Вкл') : (window.i18n?.t('off') || 'Выкл');
            document.getElementById('twoFASubtitle').textContent = twoFAEnabled
                ? 'Дополнительный пароль установлен'
                : 'Дополнительный пароль при входе';
        }

        function open2FAModal() {
            const box = document.getElementById('twoFABox');
            const overlay = document.getElementById('twoFAOverlay');

            if (twoFAEnabled) {
                box.innerHTML = '<div class="modal-title">🔒 Двухфакторная аутентификация</div>'
                    + '<div class="modal-desc">2FA включена. Введите текущий доп. пароль чтобы отключить.</div>'
                    + '<input class="modal-input" type="password" id="twoFACurrentPwd" placeholder="Текущий доп. пароль">'
                    + '<button class="modal-btn danger" onclick="disable2FA()">Отключить 2FA</button>'
                    + '<button class="modal-btn secondary" onclick="close2FAModal()">Отмена</button>';
            } else {
                box.innerHTML = '<div class="modal-title">🔒 Двухфакторная аутентификация</div>'
                    + '<div class="modal-desc">Установите дополнительный пароль. При входе потребуется ввести его после основного.</div>'
                    + '<input class="modal-input" type="password" id="twoFANewPwd" placeholder="Новый доп. пароль (мин. 6 символов)">'
                    + '<input class="modal-input" type="password" id="twoFAConfirmPwd" placeholder="Повторите пароль">'
                    + '<button class="modal-btn" onclick="enable2FA()">Включить 2FA</button>'
                    + '<button class="modal-btn secondary" onclick="close2FAModal()">Отмена</button>';
            }

            overlay.classList.add('active');
            setTimeout(function() {
                const inp = box.querySelector('input');
                if (inp) inp.focus();
            }, 100);
        }

        function close2FAModal() {
            document.getElementById('twoFAOverlay').classList.remove('active');
        }

        async function enable2FA() {
            const pwd = document.getElementById('twoFANewPwd').value;
            const confirm = document.getElementById('twoFAConfirmPwd').value;

            if (pwd.length < 6) { showToast('error', 'Минимум 6 символов', '❌'); return; }
            if (pwd !== confirm) { showToast('error', 'Пароли не совпадают', '❌'); return; }

            try {
                const res = await fetch('/api/v1/auth/2fa/enable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ password: pwd })
                });
                const data = await res.json();
                if (res.ok) {
                    twoFAEnabled = true;
                    update2FAStatus();
                    close2FAModal();
                    showToast('success', '2FA включена', '✓');
                } else {
                    showToast('error', data.error || 'Ошибка', '❌');
                }
            } catch (e) {
                showToast('error', 'Ошибка сети', '❌');
            }
        }

        async function disable2FA() {
            const pwd = document.getElementById('twoFACurrentPwd').value;
            if (!pwd) { showToast('error', 'Введите пароль', '❌'); return; }

            try {
                const res = await fetch('/api/v1/auth/2fa/disable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ password: pwd })
                });
                const data = await res.json();
                if (res.ok) {
                    twoFAEnabled = false;
                    update2FAStatus();
                    close2FAModal();
                    showToast('success', '2FA отключена', '✓');
                } else {
                    showToast('error', data.error || 'Неверный пароль', '❌');
                }
            } catch (e) {
                showToast('error', 'Ошибка сети', '❌');
            }
        }

        // Закрытие по клику на оверлей
        document.getElementById('twoFAOverlay').addEventListener('click', function(e) {
            if (e.target === this) close2FAModal();
        });

        loadSettings();
        check2FAStatus();
        if (window.i18n) window.i18n.translatePage();
