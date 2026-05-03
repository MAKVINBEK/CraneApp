import { router } from '../../app/router.js';
        import { authStore } from '../../store/authStore.js';
        router.init();

        const user = authStore.getUser();
        if (user) {
            document.getElementById('name').textContent = user.firstName || 'User';
            document.getElementById('displayName').textContent = user.firstName || 'User';
            document.getElementById('username').textContent = user.username ? '@' + user.username : '@username';
            document.getElementById('bio').textContent = user.bio || 'Нет информации';
            const firstLetter = (user.firstName || 'U')[0].toUpperCase();
            document.getElementById('avatar').textContent = firstLetter;
        }