const token = localStorage.getItem('craneapp_auth_token');
        if (!token) window.location.href = '../auth/login.html';

        let favorites = [];

        async function load() {
            try {
                const res = await fetch('/api/v1/messages/favorites', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (!res.ok) throw new Error();
                const data = await res.json();
                favorites = data.favorites || [];
                render();
            } catch (e) {
                // Fallback: читаем из localStorage
                favorites = JSON.parse(localStorage.getItem('craneapp_favorites') || '[]');
                render();
            }
        }

        function render() {
            const el = document.getElementById('content');
            const countEl = document.getElementById('favCount');

            if (favorites.length === 0) {
                countEl.textContent = '';
                el.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">⭐</div>
                        <div class="empty-title">Нет избранных</div>
                        <div class="empty-desc">Удерживайте сообщение в чате и выберите «В избранное»</div>
                    </div>`;
                return;
            }

            countEl.textContent = favorites.length;
            el.innerHTML = favorites.map((m, i) => {
                const sender = m.senderFirstName || m.senderUsername || 'Пользователь';
                const initial = sender[0].toUpperCase();
                const avatar = m.senderAvatarUrl
                    ? `<img src="${m.senderAvatarUrl}" alt="">`
                    : initial;
                const time = formatTime(m.savedAt || m.createdAt);
                const chatName = m.chatTitle || m.chatName || 'Чат';
                let body = '';
                if (m.type === 'text' || !m.type) {
                    body = `<div class="fav-text">${escHtml(m.content || '')}</div>`;
                } else {
                    const icons = { image: '🖼 Фото', video: '🎥 Видео', audio: '🎵 Аудио', voice: '🎤 Голосовое', file: '📎 Файл', sticker: '🎭 Стикер' };
                    body = `<div class="fav-media">${icons[m.type] || m.type}</div>`;
                }
                return `
                    <div class="fav-item" onclick="openChat('${m.chatId}')">
                        <div class="fav-avatar">${avatar}</div>
                        <div class="fav-body">
                            <div class="fav-header">
                                <span class="fav-sender">${escHtml(sender)}</span>
                                <span class="fav-time">${time}</span>
                            </div>
                            <div class="fav-chat">из «${escHtml(chatName)}»</div>
                            ${body}
                        </div>
                        <div class="fav-actions">
                            <button class="unfav-btn" onclick="event.stopPropagation(); removeFav('${m.id}', ${i})" title="Убрать из избранного">★</button>
                        </div>
                    </div>`;
            }).join('');
        }

        async function removeFav(messageId, idx) {
            try {
                await fetch('/api/v1/messages/' + messageId + '/favorite', {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
            } catch (e) {}
            favorites.splice(idx, 1);
            // Обновляем localStorage
            const local = JSON.parse(localStorage.getItem('craneapp_favorites') || '[]');
            const updated = local.filter(m => m.id !== messageId);
            localStorage.setItem('craneapp_favorites', JSON.stringify(updated));
            render();
            showToast('Убрано из избранного', '★');
        }

        function openChat(chatId) {
            if (chatId) window.location.href = '../chats/chats.html?chat=' + chatId;
        }

        function formatTime(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            const now = new Date();
            const diff = now - d;
            if (diff < 86400000 && d.getDate() === now.getDate()) {
                return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
            }
            if (diff < 7 * 86400000) {
                return d.toLocaleDateString('ru', { weekday: 'short' });
            }
            return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
        }

        function escHtml(s) {
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        function showToast(msg, icon) {
            const t = document.createElement('div');
            t.className = 'toast';
            t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
            document.getElementById('toastContainer').appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2000);
        }

        load();