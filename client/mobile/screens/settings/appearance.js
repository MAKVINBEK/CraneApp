// === ЗАГРУЗКА НАСТРОЕК ПРИ СТАРТЕ ===
        const defaultSettings = { theme: 'dark', accentColor: '#FF007F', fontSize: 'medium' };
        
        function loadSettings() {
            let settings = JSON.parse(localStorage.getItem('craneapp_settings') || '{}');
            settings = { ...defaultSettings, ...settings };
            
            // === ПРИМЕНЯЕМ ТЕМУ СРАЗУ ПРИ ЗАГРУЗКЕ ===
            document.documentElement.setAttribute('data-theme', settings.theme);
            document.documentElement.style.setProperty('--accent-color', settings.accentColor);
            document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${settings.accentColor}, #9D00FF)`);
            const fontSizes = { small: '14px', medium: '16px', large: '18px' };
            document.documentElement.style.setProperty('--base-font-size', fontSizes[settings.fontSize] || '16px');
            document.body.style.fontSize = fontSizes[settings.fontSize] || '16px';

            // === УСТАНАВЛИВАЕМ ЗНАЧЕНИЯ В UI ===
            document.getElementById('themeSelect').value = settings.theme;
            document.getElementById('fontSizeSelect').value = settings.fontSize || 'medium';
            
            return settings;
        }
        
        let settings = loadSettings();

        // === ПРАВИЛЬНО ПОДСВЕЧИВАЕМ ВЫБРАННЫЙ ЦВЕТ ===
        function updateColorSelection() {
            const savedColor = settings.accentColor.toUpperCase();
            document.querySelectorAll('.color-option').forEach(el => {
                const optionColor = el.getAttribute('data-color').toUpperCase();
                // Сравниваем через data-атрибут (надёжно!)
                if (optionColor === savedColor) {
                    el.classList.add('selected');
                } else {
                    el.classList.remove('selected');
                }
            });
        }

        // Вызываем сразу после загрузки
        updateColorSelection();

        // === СМЕНА ТЕМЫ ===
        window.changeTheme = async function(theme) {
            settings.theme = theme;
            localStorage.setItem('craneapp_settings', JSON.stringify(settings));
            document.documentElement.setAttribute('data-theme', theme);
            const token = localStorage.getItem('craneapp_auth_token');
            if (token) {
                try {
                    await fetch('/api/v1/users/all-settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({ settings: { theme } })
                    });
                } catch (e) {}
            }
        };

        // === СМЕНА РАЗМЕРА ШРИФТА ===
        window.changeFontSize = async function(size) {
            settings.fontSize = size;
            localStorage.setItem('craneapp_settings', JSON.stringify(settings));
            const fontSizes = { small: '14px', medium: '16px', large: '18px' };
            document.documentElement.style.setProperty('--base-font-size', fontSizes[size] || '16px');
            document.body.style.fontSize = fontSizes[size] || '16px';
            const token = localStorage.getItem('craneapp_auth_token');
            if (token) {
                try {
                    await fetch('/api/v1/users/all-settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({ settings: { fontSize: size } })
                    });
                } catch (e) {}
            }
        };

        // === ВЫБОР ЦВЕТА ===
        window.selectColor = async function(el) {
            const color = el.getAttribute('data-color');
            document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
            el.classList.add('selected');
            settings.accentColor = color;
            localStorage.setItem('craneapp_settings', JSON.stringify(settings));
            document.documentElement.style.setProperty('--accent-color', color);
            document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${color}, #9D00FF)`);
            const token = localStorage.getItem('craneapp_auth_token');
            if (token) {
                try {
                    await fetch('/api/v1/users/all-settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({ settings: { accentColor: color } })
                    });
                } catch (e) {}
            }
        };

        // === ОБНОВЛЕНИЕ ПРИ ВОЗВРАТЕ НА СТРАНИЦУ ===
        window.addEventListener('pageshow', () => {
            settings = loadSettings();
            updateColorSelection();
        });
        
        // Применяем язык при загрузке
        setTimeout(() => {
            if (window.i18n) {
                window.i18n.translatePage();
            }
        }, 100);