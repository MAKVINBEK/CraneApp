const token = localStorage.getItem('craneapp_auth_token');
        if (!token) window.location.href = '../auth/login.html';

        let originalData = {};
        let isDirty = false;
        let newAvatarBase64 = null;
        let usernameCheckTimer = null;
        let usernameValid = true;

        async function loadProfile() {
            try {
                const res = await fetch('/api/v1/users/me', { headers: { 'Authorization': 'Bearer ' + token } });
                if (!res.ok) throw new Error();
                const { user: u } = await res.json();
                originalData = { firstName: u.firstName||'', lastName: u.lastName||'', username: u.username||'', bio: u.bio||'', avatarUrl: u.avatarUrl||'' };
            } catch (e) {
                const u = JSON.parse(localStorage.getItem('craneapp_user_data') || '{}');
                originalData = { firstName: u.firstName||'', lastName: u.lastName||'', username: u.username||'', bio: u.bio||'', avatarUrl: u.avatarUrl||'' };
            }
            document.getElementById('firstName').value = originalData.firstName;
            document.getElementById('lastName').value  = originalData.lastName;
            document.getElementById('username').value  = originalData.username;
            document.getElementById('bio').value       = originalData.bio;
            updateBioCounter();
            renderAvatar(originalData.avatarUrl, originalData.firstName);
        }

        function renderAvatar(url, name) {
            const el = document.getElementById('avatarEl');
            el.innerHTML = (url && (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')))
                ? `<img src="${url}" alt="">`
                : `<span>${(name || '?')[0].toUpperCase()}</span>`;
        }

        function updateBioCounter() {
            document.getElementById('bioCounter').textContent = document.getElementById('bio').value.length;
        }

        function markDirty() { isDirty = true; }

        function handleAvatarChange(input) {
            const file = input.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) { showToast('error', 'Файл слишком большой (макс. 5 МБ)', '❌'); return; }
            const reader = new FileReader();
            reader.onload = e => { newAvatarBase64 = e.target.result; renderAvatar(newAvatarBase64, ''); markDirty(); };
            reader.readAsDataURL(file);
        }

        function scheduleUsernameCheck() {
            clearTimeout(usernameCheckTimer);
            const val = document.getElementById('username').value.trim();
            const statusEl = document.getElementById('usernameStatus');
            if (!val || val === originalData.username) { statusEl.textContent = ''; usernameValid = true; return; }
            if (!/^[a-zA-Z0-9_]{3,32}$/.test(val)) {
                statusEl.textContent = 'Только буквы, цифры и _ (3–32 символа)';
                statusEl.className = 'username-status error'; usernameValid = false; return;
            }
            statusEl.textContent = 'Проверяем...'; statusEl.className = 'username-status checking';
            usernameCheckTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/v1/users/check-username?username=${encodeURIComponent(val)}`, { headers: { 'Authorization': 'Bearer ' + token } });
                    if (res.ok) {
                        const d = await res.json();
                    statusEl.textContent = d.available
                        ? (window.i18n?.t('usernameAvailable') || '✓ Доступен')
                        : (window.i18n?.t('usernameTaken') || 'Уже занят');
                        statusEl.className = 'username-status ' + (d.available ? 'ok' : 'error');
                        usernameValid = d.available;
                    }
                } catch (_) { statusEl.textContent = ''; usernameValid = true; }
            }, 600);
        }

        async function saveProfile() {
            if (!isDirty && !newAvatarBase64) return;
            if (!usernameValid) { showToast('error', 'Юзернейм недоступен', '❌'); return; }
            const firstName = document.getElementById('firstName').value.trim();
            if (!firstName) { showToast('error', 'Имя не может быть пустым', '❌'); return; }

            const btn = document.getElementById('saveBtn');
            btn.disabled = true; btn.textContent = 'Сохранение...';

            const body = { firstName, lastName: document.getElementById('lastName').value.trim(), bio: document.getElementById('bio').value.trim() };
            const newUsername = document.getElementById('username').value.trim();
            if (newUsername && newUsername !== originalData.username) body.username = newUsername;
            if (newAvatarBase64) body.avatar = newAvatarBase64;

            try {
                const res = await fetch('/api/v1/users/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (res.ok) {
                    const cached = JSON.parse(localStorage.getItem('craneapp_user_data') || '{}');
                    localStorage.setItem('craneapp_user_data', JSON.stringify({ ...cached, ...data.user }));
                    originalData = { firstName: data.user.firstName, lastName: data.user.lastName, username: data.user.username, bio: data.user.bio, avatarUrl: data.user.avatarUrl };
                    newAvatarBase64 = null; isDirty = false;
                    showToast('success', 'Профиль сохранён', '✓');
                    setTimeout(() => history.back(), 1000);
                } else {
                    showToast('error', data.error || 'Ошибка сохранения', '❌');
                }
            } catch (e) {
                showToast('error', 'Ошибка сети', '❌');
            } finally {
                btn.disabled = false; btn.textContent = 'Сохранить';
            }
        }

        function openPwModal()  { document.getElementById('pwModal').classList.add('active'); }
        function closePwModal() {
            document.getElementById('pwModal').classList.remove('active');
            ['pwCurrent','pwNew','pwConfirm'].forEach(id => document.getElementById(id).value = '');
        }

        async function changePassword() {
            const current = document.getElementById('pwCurrent').value;
            const newPw   = document.getElementById('pwNew').value;
            const confirm = document.getElementById('pwConfirm').value;
            if (!current || !newPw) { showToast('error', 'Заполните все поля', '❌'); return; }
            if (newPw.length < 6)   { showToast('error', 'Пароль минимум 6 символов', '❌'); return; }
            if (newPw !== confirm)   { showToast('error', 'Пароли не совпадают', '❌'); return; }
            try {
                const res = await fetch('/api/v1/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ currentPassword: current, newPassword: newPw })
                });
                const data = await res.json();
                if (res.ok) { closePwModal(); showToast('success', 'Пароль изменён', '✓'); }
                else showToast('error', data.error || 'Ошибка', '❌');
            } catch (e) { showToast('error', 'Ошибка сети', '❌'); }
        }

        function showToast(type, message, icon) {
            const t = document.createElement('div');
            t.className = 'toast ' + type;
            t.innerHTML = `<span>${icon}</span><span>${message}</span>`;
            document.getElementById('toastContainer').appendChild(t);
            setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(()=>t.remove(),300); }, 2500);
        }

        document.getElementById('pwModal').addEventListener('click', e => { if (e.target===e.currentTarget) closePwModal(); });

        loadProfile();
        if (window.applyTheme) window.applyTheme();
