const token = localStorage.getItem('token');
        if (!token) window.location.href = '../auth/login.html';

        const tabBar = document.getElementById('tabBar');
        const tabs = [
            { icon: '👥', label: 'Контакты', page: './contacts.html', active: true },
            { icon: '📞', label: 'Звонки', page: '../calls/calls.html' },
            { icon: '💬', label: 'Чаты', page: '../chats/chats.html' },
            { icon: '⚙', label: 'Настройки', page: '../settings/settings.html' }
        ];
        tabs.forEach(t => {
            const div = document.createElement('div');
            div.className = 'tab-item' + (t.active ? ' active' : '');
            div.innerHTML = `<span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>`;
            div.onclick = () => { if (!t.active) window.location.href = t.page; };
            tabBar.appendChild(div);
        });