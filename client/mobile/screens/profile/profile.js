import { router } from '../../app/router.js';
        import { authStore } from '../../store/authStore.js';
        router.init();

        const user = authStore.getUser();
        if (user) {
            document.getElementById('name').textContent = user.firstName || 'User';
            document.getElementById('displayName').textContent = user.firstName || 'User';
            document.getElementById('username').textContent = user.username ? '@' + user.username : '@username';
            document.getElementById('bio').textContent = user.bio || window.i18n?.t('noDescription') || 'Нет информации';
            const firstLetter = (user.firstName || 'U')[0].toUpperCase();
            document.getElementById('avatar').textContent = firstLetter;
        }

        function translatePage() {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                el.textContent = window.i18n.t(el.getAttribute('data-i18n'));
            });
            document.getElementById('profileTitle').textContent = window.i18n.t('profile');
            document.getElementById('messageBtn').textContent = '💬 ' + window.i18n.t('message');
            document.getElementById('callBtn').textContent = '📞 ' + window.i18n.t('calls');
            document.getElementById('name').textContent = user ? (user.firstName || window.i18n.t('name')) : window.i18n.t('loading');
            if (user) document.getElementById('status').textContent = window.i18n.t('online');
        }

        if (window.i18n) translatePage();