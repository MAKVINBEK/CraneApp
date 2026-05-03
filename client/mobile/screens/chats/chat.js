import { router } from '../../app/router.js';
        router.init();

        const urlParams = new URLSearchParams(window.location.search);
        const chatId = urlParams.get('id') || 'craneapp_bot';
        
        const chats = {
            'craneapp_bot': { name: 'CraneApp Bot', av: '🤖' },
            'support': { name: 'Поддержка', av: '🎧' },
            'news': { name: 'Новости', av: '📢' },
            'admin': { name: 'Администратор', av: '👤' }
        };

        const chat = chats[chatId] || { name: 'Чат', av: '💬' };
        document.getElementById('chatName').textContent = chat.name;
        document.getElementById('chatAvatar').textContent = chat.av;

        const messages = document.getElementById('messages');
        const input = document.getElementById('msgInput');

        const demoMessages = [
            { text: 'Привет! Я CraneApp Bot — официальный бот.', incoming: true, time: '10:00' },
            { text: 'Как настроить тему?', incoming: false, time: '10:01' },
            { text: 'Зайди в Настройки → Оформление!', incoming: true, time: '10:02' }
        ];

        demoMessages.forEach(m => {
            const div = document.createElement('div');
            div.className = 'message' + (m.incoming ? ' incoming' : ' outgoing');
            div.innerHTML = `${m.text}<div class="msg-time">${m.time}</div>`;
            messages.appendChild(div);
        });
        messages.scrollTop = messages.scrollHeight;

        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

        function sendMessage() {
            const text = input.value.trim();
            if (!text) return;
            const div = document.createElement('div');
            div.className = 'message outgoing';
            div.innerHTML = `${text}<div class="msg-time">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>`;
            messages.appendChild(div);
            input.value = '';
            messages.scrollTop = messages.scrollHeight;
            setTimeout(() => {
                const reply = document.createElement('div');
                reply.className = 'message incoming';
                reply.innerHTML = `Получил: "${text}"<div class="msg-time">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>`;
                messages.appendChild(reply);
                messages.scrollTop = messages.scrollHeight;
            }, 1000);
        }