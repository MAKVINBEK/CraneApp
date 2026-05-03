const token = localStorage.getItem('craneapp_auth_token');
        if (!token) window.location.href = '../auth/login.html';

        const DEFAULTS = {
            autoplayGifs: true,
            saveDrafts: true,
            analytics: false,
            developerMode: false
        };

        let settings = { ...DEFAULTS };

        // ── Dev log ───────────────────────────────────────────────────────
        const devLogs = [];
        const origConsoleLog = console.log;
        const origConsoleWarn = console.warn;
        const origConsoleError = console.error;

        function patchConsole() {
            console.log = (...a) => { origConsoleLog(...a); addLog('LOG', a); };
            console.warn = (...a) => { origConsoleWarn(...a); addLog('WARN', a); };
            console.error = (...a) => { origConsoleError(...a); addLog('ERR', a); };
        }

        function addLog(level, args) {
            const time = new Date().toLocaleTimeString();
            devLogs.push(`[${time}] ${level}: ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`);
            if (devLogs.length > 100) devLogs.shift();
            updateDevPanel();
        }

        function updateDevPanel() {
            const el = document.getElementById('devLog');
            if (!el) return;
            el.textContent = devLogs.length ? devLogs.join('\n') : 'Нет записей';
            el.scrollTop = el.scrollHeight;
        }

        function copyDevLog() {
            navigator.clipboard?.writeText(devLogs.join('\n')).then(() => showToast('Скопировано', '✓'));
        }

        function clearDevLog() {
            devLogs.length = 0;
            updateDevPanel();
            showToast('Лог очищен', '✓');
        }

        // ── Загрузка ──────────────────────────────────────────────────────
        async function loadSettings() {
            const cached = JSON.parse(localStorage.getItem('craneapp_advanced_settings') || '{}');
            settings = { ...DEFAULTS, ...cached };
            updateUI();

            try {
                const res = await fetch('/api/v1/users/all-settings', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    settings = { ...DEFAULTS, ...(data.advancedSettings || {}) };
                    localStorage.setItem('craneapp_advanced_settings', JSON.stringify(settings));
                }
            } catch (e) {}
            updateUI();
        }

        function updateUI() {
            updateToggle('toggleGif',       settings.autoplayGifs);
            updateToggle('toggleDrafts',    settings.saveDrafts);
            updateToggle('toggleAnalytics', settings.analytics);
            updateToggle('toggleDevMode',   settings.developerMode);

            const devPanel = document.getElementById('devPanel');
            if (settings.developerMode) {
                devPanel.style.display = 'block';
                patchConsole();
                updateDevPanel();
                addLog('INFO', ['Режим разработчика включён']);
                addLog('INFO', ['User-Agent: ' + navigator.userAgent]);
                addLog('INFO', ['localStorage keys: ' + Object.keys(localStorage).join(', ')]);
            } else {
                devPanel.style.display = 'none';
                console.log = origConsoleLog;
                console.warn = origConsoleWarn;
                console.error = origConsoleError;
            }
        }

        function updateToggle(id, value) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.toggle('active', !!value);
        }

        async function toggleSetting(el, key) {
            el.classList.toggle('active');
            settings[key] = el.classList.contains('active');
            await saveSettings();
            updateUI();
            showToast(settings[key] ? 'Включено' : 'Выключено', '✓');
        }

        async function saveSettings() {
            localStorage.setItem('craneapp_advanced_settings', JSON.stringify(settings));
            try {
                await fetch('/api/v1/users/all-settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ advancedSettings: settings })
                });
            } catch (e) {}
        }

        async function exportData() {
            try {
                const res = await fetch('/api/v1/users/export', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'craneapp_export_' + new Date().toISOString().split('T')[0] + '.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('Данные экспортированы', '✓');
                } else {
                    showToast('Ошибка экспорта', '❌');
                }
            } catch (e) {
                showToast('Ошибка сети', '❌');
            }
        }

        async function resetSettings() {
            if (!confirm('Сбросить расширенные настройки?')) return;
            settings = { ...DEFAULTS };
            await saveSettings();
            updateUI();
            showToast('Настройки сброшены', '✓');
        }

        function showToast(message, icon) {
            const t = document.createElement('div');
            t.className = 'toast';
            t.innerHTML = `<span>${icon}</span><span>${message}</span>`;
            document.getElementById('toastContainer').appendChild(t);
            setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.3s'; setTimeout(()=>t.remove(),300); }, 2000);
        }

        loadSettings();
        if (window.i18n) window.i18n.translatePage();