// CraneApp Frontend Logic
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ CraneApp loaded');

    // Elements
    const loadingScreen = document.getElementById('loading-screen');
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    
    const phoneInput = document.getElementById('phone');
    const loginBtn = document.getElementById('login-btn');
    const phoneError = document.getElementById('phone-error');
    const registerLink = document.getElementById('register-link');
    const logoutBtn = document.getElementById('logout-btn');

    // Check Auth (Mock)
    const token = localStorage.getItem('crane_token');
    
    setTimeout(() => {
        loadingScreen.classList.remove('active');
        if (token) {
            showScreen(appScreen);
        } else {
            showScreen(loginScreen);
        }
    }, 1500);

    // Navigation
    function showScreen(screen) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    // Login Logic
    loginBtn.addEventListener('click', async () => {
        const phone = phoneInput.value.trim();
        
        // Validation
        if (!phone || phone.length < 10) {
            phoneInput.classList.add('error');
            phoneError.textContent = 'Введите корректный номер';
            return;
        }
        
        phoneInput.classList.remove('error');
        phoneError.textContent = '';
        
        // Loading State
        setLoading(true);
        
        try {
            // Mock API Call
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Save Token (Mock)
            localStorage.setItem('crane_token', 'mock-token-' + Date.now());
            
            // Redirect to App
            showScreen(appScreen);
        } catch (error) {
            phoneError.textContent = 'Ошибка входа';
        } finally {
            setLoading(false);
        }
    });

    // ✅ Register Link - ТЕПЕРЬ ПЕРЕХОДИТ НА СТРАНИЦУ РЕГИСТРАЦИИ
    // Alert убран, теперь это обычная ссылка в HTML

    // Logout
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('crane_token');
        showScreen(loginScreen);
        phoneInput.value = '';
    });

    // Input Validation
    phoneInput.addEventListener('input', () => {
        if (phoneInput.value.length >= 10) {
            phoneInput.classList.remove('error');
            phoneError.textContent = '';
        }
    });

    // Helpers
    function setLoading(loading) {
        loginBtn.disabled = loading;
        const btnText = loginBtn.querySelector('.btn-text');
        const btnLoader = loginBtn.querySelector('.btn-loader');
        
        if (loading) {
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline';
        } else {
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
        }
    }
});