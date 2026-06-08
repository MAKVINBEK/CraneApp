import { router } from '../../app/router.js';
        router.init();

        const samplePosts = [
            { title: 'Новости CraneApp', content: 'Мы запустили новую версию! 🚀', date: 'Сегодня, 10:00', reactions: ['❤️ 42', '🔥 15'] },
            { title: 'Обновление безопасности', content: 'Улучшили шифрование сообщений.', date: 'Вчера, 15:30', reactions: ['👍 28'] },
            { title: 'Новые эмодзи', content: 'Добавили 50+ новых реакций!', date: '10 марта', reactions: ['😍 67', '🎉 34'] }
        ];

        document.getElementById('channelName').textContent = 'CraneApp Новости';
        document.getElementById('channelSubs').textContent = '1,234 подписчика';

        function renderPosts() {
            const container = document.getElementById('postsFeed');
            container.innerHTML = '';
            samplePosts.forEach(post => {
                const div = document.createElement('div');
                div.className = 'post';
                div.innerHTML = `
                    <div class="post-header">
                        <div class="post-avatar">📢</div>
                        <div>
                            <div class="post-title">${post.title}</div>
                            <div class="post-date">${post.date}</div>
                        </div>
                    </div>
                    <div class="post-content">${post.content}</div>
                    <div class="post-reactions">${post.reactions.map(r => `<span class="reaction">${r}</span>`).join('')}</div>
                `;
                container.appendChild(div);
            });
        }

        document.getElementById('subscribeBtn').onclick = function() {
            this.textContent = 'Вы подписаны ✓';
            this.disabled = true;
            this.style.opacity = '0.7';
        };

        renderPosts();