const token = localStorage.getItem('craneapp_auth_token');

        const DEFAULTS = {
            reduceCallTraffic: false,
            saveEditedPhotos: true, pauseMusicOnRecord: true, raiseToListen: true,
            showAdultContent: true,
            savePrivate: 'no', saveGroups: 'no', saveChannels: 'no'
        };

        let s = { ...DEFAULTS };
        let storageData = { messages: 0, media: 0, files: 0, cache: 0 };

        const TOG_MAP = {
            togCallTraffic: 'reduceCallTraffic',
            togSaveEdited: 'saveEditedPhotos',
            togPauseMusic: 'pauseMusicOnRecord',
            togRaiseToListen: 'raiseToListen',
            togAdult: 'showAdultContent'
        };

        const SAVE_LABELS = { no: 'Нет', yes: 'Да', photos: 'Фото', all: 'Все' };
        const SAVE_OPTIONS = ['no','photos','all'];

        async function load() {
            const local = JSON.parse(localStorage.getItem('craneapp_data_settings') || '{}');
            s = { ...DEFAULTS, ...local };

            // Проверяем статус разработчика
            const userData = JSON.parse(localStorage.getItem('craneapp_user_data') || '{}');
            const devUsernames = ['adm1', 'admin', 'admin1', 'qzlfee'];
            if (devUsernames.includes((userData.username || '').toLowerCase())) {
                const devBanner = document.createElement('div');
                devBanner.style.cssText = 'margin:12px;padding:14px 16px;background:linear-gradient(135deg,rgba(255,0,127,.15),rgba(157,0,255,.15));border:1px solid rgba(255,0,127,.3);border-radius:12px;font-size:14px;line-height:1.5;';
                devBanner.innerHTML = '<div style="font-weight:700;margin-bottom:4px;background:linear-gradient(135deg,#FF007F,#9D00FF);-webkit-background-clip:text;-webkit-text-fill-color:transparent">🔧 Разработчик CraneApp</div>'
                    + '<div style="color:var(--text-secondary)">У вас есть доступ к командам разработчика. Откройте чат с ботом CraneApp и введите /help для списка команд.</div>';
                document.querySelector('.content').insertBefore(devBanner, document.querySelector('.content').firstChild);
            }
            try {
                const [sr, dr] = await Promise.all([
                    fetch('/api/v1/users/all-settings', { headers: { Authorization: 'Bearer ' + token } }),
                    fetch('/api/v1/users/storage', { headers: { Authorization: 'Bearer ' + token } })
                ]);
                if (sr.ok) { const d = await sr.json(); if (d.storageSettings) s = { ...s, ...d.storageSettings }; }
                if (dr.ok) { const d = await dr.json(); storageData = d.storage || storageData; }
            } catch (_) {}
            render();
        }

        function render() {
            Object.entries(TOG_MAP).forEach(([id, key]) => {
                const el = document.getElementById(id);
                if (el) el.classList.toggle('active', !!s[key]);
            });
            document.getElementById('savePrivateVal').textContent = SAVE_LABELS[s.savePrivate] || 'Нет';
            document.getElementById('saveGroupsVal').textContent = SAVE_LABELS[s.saveGroups] || 'Нет';
            document.getElementById('saveChannelsVal').textContent = SAVE_LABELS[s.saveChannels] || 'Нет';

            const total = storageData.messages + storageData.media + storageData.files + storageData.cache;
            document.getElementById('totalSize').textContent = formatSize(total);
        }

        function tog(el, key) {
            el.classList.toggle('active');
            s[key] = el.classList.contains('active');
            save();
            toast(s[key] ? 'Включено' : 'Выключено');
        }

        // Picker
        let currentPickerKey = null;
        function showPicker(key) {
            currentPickerKey = key;
            const titles = { mobile: 'Мобильная сеть', wifi: 'Wi-Fi', savePrivate: 'Личные чаты', saveGroups: 'Группы', saveChannels: 'Каналы' };
            document.getElementById('pickerTitle').textContent = titles[key] || 'Выберите';

            let options = [];
            if (['savePrivate','saveGroups','saveChannels'].includes(key)) {
                options = SAVE_OPTIONS.map(v => ({
                    label: SAVE_LABELS[v],
                    value: v,
                    selected: s[key] === v
                }));
            } else {
                options = [
                    { label: 'Медиа (10 МБ), Файлы (1.0 МБ)', value: 'low', selected: true },
                    { label: 'Медиа (50 МБ), Файлы (5.0 МБ)', value: 'medium' },
                    { label: 'Без ограничений', value: 'high' }
                ];
            }

            document.getElementById('pickerOptions').innerHTML = options.map(o =>
                '<div onclick="selectOption(\'' + o.value + '\')" style="padding:14px 16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:15px">'
                + '<span>' + o.label + '</span>'
                + (o.selected ? '<span style="color:var(--accent-color)">✓</span>' : '')
                + '</div>'
            ).join('');

            document.getElementById('pickerOverlay').style.display = 'block';
            document.getElementById('pickerModal').style.display = 'block';
        }

        function selectOption(value) {
            if (['savePrivate','saveGroups','saveChannels'].includes(currentPickerKey)) {
                s[currentPickerKey] = value;
                save();
                render();
            }
            closePicker();
            toast('Сохранено');
        }

        function closePicker() {
            document.getElementById('pickerOverlay').style.display = 'none';
            document.getElementById('pickerModal').style.display = 'none';
        }

        function resetAutoDownload() {
            document.getElementById('mobileDesc').textContent = 'Медиа (10 МБ), Файлы (1.0 МБ)';
            document.getElementById('wifiDesc').textContent = 'Медиа (15 МБ), Файлы (3.0 МБ)';
            toast('Настройки сброшены');
        }

        function showStorageDetail() {
            const total = storageData.messages + storageData.media + storageData.files + storageData.cache;
            alert('Использование памяти: ' + formatSize(total)
                + '\n\nСообщения: ' + formatSize(storageData.messages)
                + '\nМедиа: ' + formatSize(storageData.media)
                + '\nФайлы: ' + formatSize(storageData.files)
                + '\nКэш: ' + formatSize(storageData.cache));
        }

        function showTrafficDetail() {
            toast('Статистика трафика недоступна');
        }

        async function save() {
            localStorage.setItem('craneapp_data_settings', JSON.stringify(s));
            try {
                await fetch('/api/v1/users/all-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ storageSettings: s }) });
            } catch (_) {}
        }

        async function exportData() {
            toast('Подготовка данных...');
            try {
                const res = await fetch('/api/v1/users/export', { headers: { Authorization: 'Bearer ' + token } });
                if (!res.ok) throw new Error();
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'craneapp_export_' + new Date().toISOString().slice(0,10) + '.json';
                a.click();
                URL.revokeObjectURL(url);
                toast('Данные экспортированы');
            } catch (e) {
                toast('Ошибка экспорта', true);
            }
        }

        function formatSize(b) {            if (!b) return '0 Б';
            if (b < 1024) return b + ' Б';
            if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' КБ';
            if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' МБ';
            return (b / 1024 / 1024 / 1024).toFixed(2) + ' ГБ';
        }

        function toast(msg, err) {
            const t = document.createElement('div');
            t.className = 'toast' + (err ? ' err' : '');
            t.innerHTML = '<span>' + (err ? '⚠️' : '✓') + '</span><span>' + msg + '</span>';
            document.getElementById('toastContainer').appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2000);
        }

        load();