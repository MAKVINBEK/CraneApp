// Проверка: если уже залогинен → сразу в чаты
        const existingToken = localStorage.getItem('craneapp_auth_token');
        if (existingToken) {
            window.location.href = '/client/mobile/screens/chats/chats.html';
        }

        // Функция загрузки настроек с сервера
        async function fetchUserSettings(token) {
            try {
                const res = await fetch('/api/v1/users/settings', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    return data.settings;
                }
            } catch (e) {
                console.error('Failed to fetch settings:', e);
            }
            return { theme: 'dark', notifications: true, sounds: true };
        }

        document.getElementById('loginForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const btn = document.getElementById('loginBtn');
            
            btn.disabled = true;
            btn.textContent = window.i18n?.t('loginLoading') || 'Вход...';

            try {
                // Получаем публичный IP для уведомления о входе
                let clientIP = '';
                try {
                    const ipRes = await fetch('https://api.ipify.org?format=json');
                    if (ipRes.ok) { const d = await ipRes.json(); clientIP = d.ip || ''; }
                } catch (_) {}

                const res = await fetch('/api/v1/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, clientIP })
                });
                
                const data = await res.json();
                
                if (!res.ok) {
                    throw new Error(data.error || window.i18n?.t('loginError') || 'Ошибка входа');
                }

                // 2FA — требуется доп. пароль
                if (data.twoFARequired) {
                    btn.disabled = false;
                    btn.textContent = window.i18n?.t('login') || 'Войти';
                    const twoFAPwd = prompt(window.i18n?.t('twoFAPrompt') || 'Введите дополнительный пароль (2FA):');
                    if (!twoFAPwd) return;

                    btn.disabled = true;
                    btn.textContent = window.i18n?.t('checking2FA') || 'Проверка 2FA...';

                    const res2 = await fetch('/api/v1/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password, twoFAPassword: twoFAPwd, clientIP })
                    });
                    const data2 = await res2.json();
                    if (!res2.ok) throw new Error(data2.error || window.i18n?.t('invalid2FA') || 'Неверный доп. пароль');
                    Object.assign(data, data2);
                }
                
                if (data.token) {
                    // Сохраняем токен
                    localStorage.setItem('craneapp_auth_token', data.token);
                    
                    // Сохраняем данные пользователя из ответа
                    const user = data.user;
                    localStorage.setItem('craneapp_user_data', JSON.stringify({
                        id: user.id,
                        username: user.username,
                        firstName: user.firstName,
                        lastName: user.lastName || '',
                        bio: user.bio || '',
                        avatarUrl: user.avatarUrl || ''
                    }));
                    
                    // Загружаем настройки
                    btn.textContent = window.i18n?.t('loading') || 'Загрузка...';
                    const settings = await fetchUserSettings(data.token);
                    localStorage.setItem('craneapp_settings', JSON.stringify(settings));
                    
                    showToast('success', window.i18n?.t('loginDone') || 'Вход выполнен!', '✓');
                    
                    setTimeout(function() {
                        window.location.href = '/client/mobile/screens/chats/chats.html';
                    }, 500);
                } else {
                    throw new Error(window.i18n?.t('invalidResponse') || 'Неверный формат ответа');
                }
            } catch (err) {
                console.error('Login error:', err);
                showToast('error', err.message, '❌');
                btn.disabled = false;
                btn.textContent = window.i18n?.t('login') || 'Войти';
            }
        });

        function showToast(type, message, icon) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(function() {
                toast.style.opacity = '0';
                setTimeout(function() { toast.remove(); }, 300);
            }, 3000);
        }
        function toggleLoginEye(e) {
            e.preventDefault();
            const inp = document.getElementById('password');
            const eye = document.getElementById('loginEye');
            if (inp.type === 'password') {
                inp.type = 'text';
                eye.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
            } else {
                inp.type = 'password';
                eye.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
            }
        }
