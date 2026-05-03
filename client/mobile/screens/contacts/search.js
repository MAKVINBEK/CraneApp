console.log('✅ Скрипт поиска загружен!');

        // ✅ ИСПРАВЛЕНИЕ 1: Правильный ключ токена
        const token = localStorage.getItem('craneapp_auth_token');
        console.log('🔑 Токен:', token ? '✅ Найден' : '❌ Не найден');
        
        if (!token) {
            alert('Требуется вход в аккаунт');
            window.location.href = '../auth/login.html';
        }

        let searchTimeout = null;

        document.getElementById('searchInput').addEventListener('input', (e) => {
            let query = e.target.value.trim().replace('@', '');
            clearTimeout(searchTimeout);
            
            if (query.length < 2) {
                document.getElementById('searchStatus').classList.remove('visible');
                document.getElementById('results').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🔍</div>
                        <div>Введите юзернейм для поиска</div>
                    </div>
                `;
                return;
            }
            
            searchTimeout = setTimeout(() => searchUsers(query), 300);
        });

        async function searchUsers(query) {
            console.log('🔍 Поиск:', query);
            
            const statusEl = document.getElementById('searchStatus');
            statusEl.className = 'search-status visible searching';
            statusEl.innerHTML = 'Поиск...';
            
            try {
                // ✅ ИСПРАВЛЕНИЕ 2: Параметр q вместо query
                const res = await fetch(`/api/v1/users/search?q=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                console.log('📊 Статус:', res.status);
                
                const data = await res.json();
                console.log('📦 Ответ:', data);
                
                // ✅ ИСПРАВЛЕНИЕ 3: Проверка без data.success
                if (data.users && data.users.length > 0) {
                    statusEl.className = 'search-status visible found';
                    statusEl.innerHTML = '✅ Найдено: ' + data.users.length;
                    renderResults(data.users);
                } else {
                    statusEl.className = 'search-status visible not-found';
                    statusEl.innerHTML = '❌ Ничего не найдено';
                    document.getElementById('results').innerHTML = `
                        <div class="empty-state">
                            <div class="empty-icon">😕</div>
                            <div>Ничего не найдено</div>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('❌ Ошибка:', error);
                statusEl.className = 'search-status visible not-found';
                statusEl.innerHTML = '❌ Ошибка: ' + error.message;
            }
        }

        function renderResults(users) {
            console.log('📝 Рендер:', users.length, 'пользователей');
            
            const container = document.getElementById('results');
            container.innerHTML = users.map(user => {
                console.log('  - ' + user.username);
                return `
                    <div class="result-item" onclick="startChat('${user.id}', '${user.username}')">
                        <div class="result-avatar">${(user.firstName || user.username)[0].toUpperCase()}</div>
                        <div class="result-info">
                            <div class="result-name">${user.firstName || user.lastName || 'Пользователь'}</div>
                            <div class="result-username">@${user.username}</div>
                        </div>
                        <button class="action-btn">Написать</button>
                    </div>
                `;
            }).join('');
        }

        async function startChat(userId, username) {
            const btn = event.target;
            btn.disabled = true;
            btn.textContent = '...';
            
            try {
                // ✅ ИСПРАВЛЕНИЕ 4: Правильная структура тела запроса
                const res = await fetch('/api/v1/chats/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ 
                        type: 'private', 
                        participants: [userId] 
                    })
                });
                
                const data = await res.json();
                console.log('Создание чата:', data);
                
                if (data.chatId) {
                    btn.className = 'action-btn success';
                    btn.textContent = '✓';
                    alert('Чат создан!');
                    setTimeout(() => {
                        window.location.href = '../chats/chats.html';
                    }, 1000);
                } else {
                    throw new Error(data.error || 'Не удалось создать чат');
                }
            } catch (error) {
                console.error('Ошибка создания чата:', error);
                alert('Ошибка: ' + error.message);
                btn.disabled = false;
                btn.textContent = 'Написать';
            }
        }