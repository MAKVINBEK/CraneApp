const token = localStorage.getItem('craneapp_auth_token');

        const DEFAULTS = {
            privateChats: true, groups: true, channels: true, reactions: true,
            notificationsSound: true, vibrateOnCall: false, messagePreview: true,
            badgeChannels: true, badgeCount: true, newContacts: true
        };

        let s = { ...DEFAULTS };

        const MAP = {
            togPrivate: 'privateChats', togGroups: 'groups', togChannels: 'channels', togReactions: 'reactions',
            togSound: 'notificationsSound', togVibrate: 'vibrateOnCall', togPreview: 'messagePreview',
            togBadgeChannels: 'badgeChannels', togBadgeCount: 'badgeCount', togNewContacts: 'newContacts'
        };

        async function load() {
            const local = JSON.parse(localStorage.getItem('craneapp_notification_settings') || '{}');
            s = { ...DEFAULTS, ...local };
            try {
                const r = await fetch('/api/v1/users/all-settings', { headers: { Authorization: 'Bearer ' + token } });
                if (r.ok) { const d = await r.json(); if (d.notificationSettings) s = { ...s, ...d.notificationSettings }; }
            } catch (_) {}
            render();
        }

        function render() {
            Object.entries(MAP).forEach(([id, key]) => {
                const el = document.getElementById(id);
                if (el) el.classList.toggle('active', !!s[key]);
            });
        }

        function tog(el, key) {
            el.classList.toggle('active');
            s[key] = el.classList.contains('active');
            save();
            showToast(s[key] ? 'Включено' : 'Выключено');
        }

        async function save() {
            localStorage.setItem('craneapp_notification_settings', JSON.stringify(s));
            // Дублируем звуковые настройки в craneapp_sound_settings для notifications.js
            const soundSettings = JSON.parse(localStorage.getItem('craneapp_sound_settings') || '{}');
            soundSettings.notificationsSound = s.notificationsSound;
            soundSettings.notifVolume = s.notifVolume;
            soundSettings.mediaVolume = s.mediaVolume;
            localStorage.setItem('craneapp_sound_settings', JSON.stringify(soundSettings));
            try {
                await fetch('/api/v1/users/all-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ notificationSettings: s }) });
            } catch (_) {}
        }

        function showToast(msg) {
            const t = document.createElement('div');
            t.className = 'toast';
            t.innerHTML = '<span>✓</span><span>' + msg + '</span>';
            document.getElementById('toastContainer').appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2000);
        }

        load();