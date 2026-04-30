export const router = {
    init() {
        const token = localStorage.getItem('token');
        const path = window.location.pathname;
        
        // Нет токена → на вход
        if (!token && !path.includes('login.html') && !path.includes('register.html')) {
            window.location.href = '/client/mobile/screens/auth/login.html';
            return;
        }
        
        // Есть токен + страница входа → в чаты
        if (token && (path.includes('login.html') || path.includes('register.html'))) {
            window.location.href = '/client/mobile/screens/chats/chats.html';
            return;
        }

        // Простейшая маршрутизация Settings (план А)
        if (path.includes('settings') || path.includes('settings.html')) {
            window.location.href = '/client/mobile/screens/settings/settings.html';
            return;
        }
    }
};
