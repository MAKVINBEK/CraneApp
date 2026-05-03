const token = localStorage.getItem('craneapp_auth_token');
        
        let settings = {
            notificationsVolume: 80,
            mediaVolume: 100,
            notificationsSound: true,
            messagesSound: true,
            sendSound: true,
            callsSound: true,
            vibrateOnCall: true,
            notificationSound: 'default',
            messageSound: 'default',
            ringtone: 'default'
        };
        
        const sounds = {
            notification: [
                { id: 'default', name: 'По умолчанию' },
                { id: 'note', name: 'Нота' },
                { id: 'ping', name: 'Пинг' },
                { id: 'pop', name: 'Поп' },
                { id: 'chord', name: 'Аккорд' },
                { id: 'gentle', name: 'Нежный' }
            ],
            message: [
                { id: 'default', name: 'По умолчанию' },
                { id: 'bubble', name: 'Пузырь' },
                { id: 'click', name: 'Клик' },
                { id: 'tap', name: 'Тап' }
            ],
            ringtone: [
                { id: 'default', name: 'По умолчанию' },
                { id: 'melody1', name: 'Мелодия 1' },
                { id: 'melody2', name: 'Мелодия 2' },
                { id: 'classic', name: 'Классика' }
            ]
        };
        
        async function loadSettings() {
            try {
                const res = await fetch('/api/v1/users/all-settings', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    settings = { ...settings, ...(data.soundSettings || {}) };
                }
            } catch (e) {
                const local = JSON.parse(localStorage.getItem('craneapp_sound_settings') || '{}');
                settings = { ...settings, ...local };
            }
            updateUI();
        }
        
        function updateUI() {
            document.getElementById('notificationsVolume').value = settings.notificationsVolume;
            document.getElementById('notificationsVolumeValue').textContent = settings.notificationsVolume + '%';
            document.getElementById('mediaVolume').value = settings.mediaVolume;
            document.getElementById('mediaVolumeValue').textContent = settings.mediaVolume + '%';
            
            updateToggle('toggleNotifications', settings.notificationsSound);
            updateToggle('toggleMessages', settings.messagesSound);
            updateToggle('toggleSend', settings.sendSound);
            updateToggle('toggleCalls', settings.callsSound);
            updateToggle('toggleVibrate', settings.vibrateOnCall);
            
            updateSoundLabel('notification', settings.notificationSound);
            updateSoundLabel('message', settings.messageSound);
            updateSoundLabel('ringtone', settings.ringtone);
        }
        
        function updateToggle(id, value) {
            const el = document.getElementById(id);
            if (!el) return;
            if (value) el.classList.add('active');
            else el.classList.remove('active');
        }
        
        function updateSoundLabel(type, soundId) {
            const soundList = sounds[type];
            const sound = soundList.find(s => s.id === soundId);
            const labelMap = {
                notification: 'notificationSoundValue',
                message: 'messageSoundValue',
                ringtone: 'ringtoneSoundValue'
            };
            const el = document.getElementById(labelMap[type]);
            if (el && sound) {
                el.textContent = sound.name;
            }
        }
        
        function updateVolume(type, value) {
            settings[type + 'Volume'] = parseInt(value);
            document.getElementById(type + 'VolumeValue').textContent = value + '%';
            // Сохранение только при onchange (отпускании), не при каждом движении
        }
        
        async function toggleSetting(el, key) {
            el.classList.toggle('active');
            settings[key] = el.classList.contains('active');
            await saveSettings();
            showToast(settings[key] ? 'Включено' : 'Выключено', '✓');
        }
        
        function openSoundPicker(type) {
            const soundList = sounds[type];
            const currentSound = settings[type + 'Sound'] || settings[type] || 'default';
            
            let html = soundList.map(s => `
                <div class="sound-item ${s.id === currentSound ? 'selected' : ''}" onclick="selectSound('${type}', '${s.id}')">
                    <span class="sound-name">${s.name}</span>
                    <div>
                        <button class="play-btn" onclick="event.stopPropagation(); playSound('${type}', '${s.id}')">▶</button>
                        ${s.id === currentSound ? '<span class="sound-check">✓</span>' : ''}
                    </div>
                </div>
            `).join('');
            
            showPickerModal('Выберите звук', html);
        }
        
        async function selectSound(type, soundId) {
            if (type === 'ringtone') {
                settings.ringtone = soundId;
            } else {
                settings[type + 'Sound'] = soundId;
            }
            
            await saveSettings();
            updateUI();
            closePickerModal();
            showToast('Звук изменён', '✓');
        }
        
        function playSound(type, soundId) {
            if (window.CraneSounds) {
                const isRingtone = type === 'ringtone';
                window.CraneSounds.play(soundId, settings.notificationsVolume, isRingtone);
            }
        }
        
        async function saveSettings() {
            localStorage.setItem('craneapp_sound_settings', JSON.stringify(settings));
            
            try {
                await fetch('/api/v1/users/all-settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ soundSettings: settings })
                });
            } catch (e) {}
        }
        
        function showPickerModal(title, content) {
            const overlay = document.createElement('div');
            overlay.className = 'picker-overlay';
            overlay.id = 'pickerOverlay';
            overlay.onclick = closePickerModal;
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;';
            
            const modal = document.createElement('div');
            modal.id = 'pickerModal';
            modal.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:var(--bg-secondary);border-radius:20px 20px 0 0;z-index:1001;max-height:60vh;overflow-y:auto;';
            modal.innerHTML = `
                <div style="padding:16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:17px;font-weight:700;">${title}</span>
                    <button style="background:none;border:none;color:var(--text-secondary);font-size:24px;cursor:pointer;" onclick="closePickerModal()">×</button>
                </div>
                <div>${content}</div>
            `;
            
            document.body.appendChild(overlay);
            document.body.appendChild(modal);
        }
        
        function closePickerModal() {
            if (window.CraneSounds) window.CraneSounds.stop();
            const overlay = document.getElementById('pickerOverlay');
            const modal = document.getElementById('pickerModal');
            if (overlay) overlay.remove();
            if (modal) modal.remove();
        }
        
        function showToast(message, icon) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }
        
        loadSettings();
        if (window.i18n) window.i18n.translatePage();