const token = localStorage.getItem('craneapp_auth_token');

        const DEFAULTS = {
            powerSave: false,
            autoLow: true,
            animations: true,
            autoGif: true,
            animStickers: true,
            bgSync: true,
            autoDownload: true
        };

        let settings = { ...DEFAULTS };

        // Загружаем настройки
        async function load() {
            const local = JSON.parse(localStorage.getItem('craneapp_power_settings') || '{}');
            settings = { ...DEFAULTS, ...local };

            try {
                const res = await fetch('/api/v1/users/all-settings', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.powerSettings) settings = { ...settings, ...data.powerSettings };
                }
            } catch (e) {}

            updateUI();
            loadBattery();
        }

        function updateUI() {
            Object.keys(settings).forEach(key => {
                const el = document.getElementById('toggle' + key.charAt(0).toUpperCase() + key.slice(1));
                if (el) el.classList.toggle('active', !!settings[key]);
            });
            applyPowerSave(settings.powerSave);
        }

        function toggle(key) {
            const elId = 'toggle' + key.charAt(0).toUpperCase() + key.slice(1);
            const el = document.getElementById(elId);
            if (!el) return;
            el.classList.toggle('active');
            settings[key] = el.classList.contains('active');

            // Если включили режим энергосбережения — выключаем всё тяжёлое
            if (key === 'powerSave' && settings.powerSave) {
                ['animations', 'autoGif', 'animStickers', 'bgSync', 'autoDownload'].forEach(k => {
                    settings[k] = false;
                    const e = document.getElementById('toggle' + k.charAt(0).toUpperCase() + k.slice(1));
                    if (e) e.classList.remove('active');
                });
            }

            applyPowerSave(settings.powerSave);
            save();
            showToast(settings[key] ? 'Включено' : 'Выключено', '✓');
        }

        function applyPowerSave(enabled) {
            // Применяем CSS класс на body для отключения анимаций
            if (enabled || !settings.animations) {
                document.documentElement.style.setProperty('--transition-speed', '0s');
                localStorage.setItem('craneapp_reduce_motion', '1');
            } else {
                document.documentElement.style.removeProperty('--transition-speed');
                localStorage.removeItem('craneapp_reduce_motion');
            }
        }

        async function save() {
            localStorage.setItem('craneapp_power_settings', JSON.stringify(settings));
            try {
                await fetch('/api/v1/users/all-settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ powerSettings: settings })
                });
            } catch (e) {}
        }

        // Battery API
        function loadBattery() {
            if (!navigator.getBattery) {
                document.getElementById('batteryCard').style.display = 'none';
                return;
            }
            navigator.getBattery().then(battery => {
                updateBattery(battery);
                battery.addEventListener('levelchange', () => updateBattery(battery));
                battery.addEventListener('chargingchange', () => updateBattery(battery));
            }).catch(() => {
                document.getElementById('batteryCard').style.display = 'none';
            });
        }

        function updateBattery(battery) {
            const level = Math.round(battery.level * 100);
            const charging = battery.charging;

            document.getElementById('batteryLevel').textContent = level + '%';
            document.getElementById('batteryStatus').textContent = charging ? '⚡ Зарядка' : (level <= 20 ? '⚠️ Низкий заряд' : 'Работает от батареи');
            document.getElementById('batteryFill').style.width = level + '%';
            document.getElementById('batteryFill').style.background = level <= 20 ? '#FF4B4B' : level <= 50 ? '#FFA500' : '#00C864';
            document.getElementById('batteryIcon').textContent = charging ? '🔌' : level <= 20 ? '🪫' : '🔋';

            // Авто-включение при низком заряде
            if (settings.autoLow && level <= 20 && !charging && !settings.powerSave) {
                settings.powerSave = true;
                document.getElementById('togglePowerSave').classList.add('active');
                applyPowerSave(true);
                save();
                showToast('Режим энергосбережения включён автоматически', '🔋');
            }
        }

        function showToast(msg, icon) {
            const t = document.createElement('div');
            t.className = 'toast';
            t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
            document.getElementById('toastContainer').appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2000);
        }

        load();