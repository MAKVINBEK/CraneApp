const token = localStorage.getItem('craneapp_auth_token');
        let currentSessionId = null;
        let devicesSocket = null;
        let heartbeatInterval = null;
        
        // Сбрасываем флаг при каждом открытии страницы устройств
        // чтобы гарантировать актуальные данные
        sessionStorage.removeItem('craneapp_session_registered');
        
        // Определение устройства
        function getDeviceInfo() {
            const ua = navigator.userAgent;
            let device = { icon: '📱', name: 'Мобильное устройство', type: 'mobile' };
            
            if (/iPhone/.test(ua)) {
                device = { icon: '📱', name: 'iPhone', type: 'iphone' };
            } else if (/iPad/.test(ua)) {
                device = { icon: '📟', name: 'iPad', type: 'ipad' };
            } else if (/Android/.test(ua)) {
                device = { icon: '📱', name: 'Android', type: 'android' };
            } else if (/Windows/.test(ua)) {
                device = { icon: '💻', name: 'Windows PC', type: 'windows' };
            } else if (/Mac/.test(ua)) {
                device = { icon: '💻', name: 'Mac', type: 'mac' };
            } else if (/Linux/.test(ua)) {
                device = { icon: '💻', name: 'Linux', type: 'linux' };
            }
            
            return device;
        }
        
        // Регистрация текущей сессии
        async function registerCurrentSession() {
            // Если уже зарегистрировали в этой вкладке — не повторяем
            if (sessionStorage.getItem('craneapp_session_registered')) return;

            const device = getDeviceInfo();

            // Получаем публичный IP на клиенте
            let clientIP = '';
            try {
                const ipRes = await fetch('https://api.ipify.org?format=json');
                if (ipRes.ok) { const d = await ipRes.json(); clientIP = d.ip || ''; }
            } catch (_) {}

            try {
                const res = await fetch('/api/v1/users/devices/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ deviceName: device.name, deviceType: device.type, userAgent: navigator.userAgent, clientIP })
                });
                if (res.ok) {
                    const data = await res.json();
                    currentSessionId = data.sessionId;
                    sessionStorage.setItem('craneapp_session_registered', '1');
                    return data;
                }
            } catch (e) { console.warn('Session registration failed:', e); }
            return null;
        }
        
        // Загрузка списка устройств
        async function loadDevices() {
            try {
                const res = await fetch('/api/v1/users/devices', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    renderDevices(data.devices || []);
                } else {
                    renderDevices([]);
                }
            } catch (e) {
                console.error('Load devices error:', e);
                renderDevices([]);
            }
        }
        
        function renderDevices(devices) {
            const container = document.getElementById('otherDevices');
            const terminateBtn = document.getElementById('terminateAllBtn');
            const currentDevice = getDeviceInfo();
            
            // Текущее устройство
            const current = devices.find(d => d.is_current) || {
                device_name: currentDevice.name,
                device_type: currentDevice.type,
                last_active: new Date().toISOString(),
                is_current: true
            };
            
            document.getElementById('currentIcon').textContent = currentDevice.icon;
            document.getElementById('currentName').textContent = current.device_name || currentDevice.name;
            document.getElementById('currentLastActive').textContent = formatTime(current.last_active);
            document.getElementById('currentIP').textContent = current.ip_address ? maskIP(current.ip_address) : '—';
            
            // Показываем город если есть
            const locationEl = document.getElementById('currentLocation');
            if (locationEl) locationEl.textContent = current.location || '—';
            
            // Другие устройства
            const others = devices.filter(d => !d.is_current);
            
            if (others.length === 0) {
                container.innerHTML = `
                    <div class="device-card">
                        <div style="padding:20px;text-align:center;color:var(--text-muted);">
                            <div style="font-size:36px;margin-bottom:8px;opacity:0.5;">🔌</div>
                            <div>Нет других активных устройств</div>
                        </div>
                    </div>
                `;
                terminateBtn.style.display = 'none';
                return;
            }
            
            terminateBtn.style.display = 'block';
            
            container.innerHTML = others.map(d => `
                <div class="device-card" data-id="${d.id}">
                    <div class="device-header">
                        <div class="device-icon">${getDeviceIcon(d.device_type)}</div>
                        <div class="device-info">
                            <div class="device-name">${d.device_name || 'Устройство'}</div>
                            <div class="device-status offline">${formatTime(d.last_active)}</div>
                        </div>
                    </div>
                    <div class="device-details">
                        <div class="device-detail">
                            <span class="device-detail-label">IP-адрес</span>
                            <span>${maskIP(d.ip_address)}</span>
                        </div>
                        ${d.location ? `
                        <div class="device-detail">
                            <span class="device-detail-label">Местоположение</span>
                            <span>${d.location}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="device-actions">
                        <button class="terminate-btn" onclick="terminateDevice('${d.id}')">Завершить сеанс</button>
                    </div>
                </div>
            `).join('');
        }
        
        function getDeviceIcon(type) {
            const icons = {
                'iphone': '📱',
                'ipad': '📟',
                'android': '📱',
                'windows': '💻',
                'mac': '💻',
                'linux': '💻'
            };
            return icons[type] || '📱';
        }
        
        function maskIP(ip) {
            if (!ip) return '—';
            const parts = ip.split('.');
            if (parts.length === 4) {
                return parts[0] + '.' + parts[1] + '.' + parts[2] + '.***';
            }
            return '***';
        }
        
        function formatTime(dateStr) {
            if (!dateStr) return '—';
            
            const date = new Date(dateStr);
            const now = new Date();
            const diff = now - date;
            
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            
            if (minutes < 1) return 'Только что';
            if (minutes < 60) return minutes + ' мин. назад';
            if (hours < 24) return hours + ' ч. назад';
            if (days < 7) return days + ' дн. назад';
            
            return date.toLocaleDateString('ru');
        }
        
        // WebSocket для реального времени
        function connectDevicesSocket() {
            if (devicesSocket && devicesSocket.readyState === WebSocket.OPEN) return;
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/devices?token=${token}`;
            
            devicesSocket = new WebSocket(wsUrl);
            
            devicesSocket.onopen = () => {
                console.log('Devices WebSocket connected');
                startHeartbeat();
            };
            
            devicesSocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleDeviceUpdate(data);
                } catch (e) {
                    console.error('Error parsing device update:', e);
                }
            };
            
            devicesSocket.onclose = () => {
                console.log('Devices WebSocket disconnected');
                stopHeartbeat();
                // Переподключение через 5 секунд
                setTimeout(connectDevicesSocket, 5000);
            };
            
            devicesSocket.onerror = (error) => {
                console.error('Devices WebSocket error:', error);
            };
        }
        
        function handleDeviceUpdate(data) {
            switch (data.type) {
                case 'device_connected':
                    showToast('Новое устройство подключено', '📱');
                    loadDevices();
                    break;
                case 'device_disconnected':
                    showToast('Устройство отключено', '📱');
                    loadDevices();
                    break;
                case 'device_terminated':
                    showToast('Сеанс завершен', '📱');
                    loadDevices();
                    break;
                case 'devices_updated':
                    loadDevices();
                    break;
                case 'heartbeat':
                    // Ответ на heartbeat
                    if (devicesSocket && devicesSocket.readyState === WebSocket.OPEN) {
                        devicesSocket.send(JSON.stringify({ type: 'heartbeat_response' }));
                    }
                    break;
            }
        }
        
        function startHeartbeat() {
            stopHeartbeat();
            heartbeatInterval = setInterval(() => {
                if (devicesSocket && devicesSocket.readyState === WebSocket.OPEN) {
                    devicesSocket.send(JSON.stringify({ type: 'heartbeat' }));
                }
            }, 30000); // Каждые 30 секунд
        }
        
        function stopHeartbeat() {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
        }
        
        // Завершить одну сессию
        async function terminateDevice(sessionId) {
            if (!confirm(window.i18n?.t('terminateSessionConfirm') || 'Завершить сеанс на этом устройстве?')) return;
            
            try {
                const res = await fetch('/api/v1/users/devices/' + sessionId, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                if (res.ok) {
                    // Отправляем WebSocket событие
                    if (devicesSocket && devicesSocket.readyState === WebSocket.OPEN) {
                        devicesSocket.send(JSON.stringify({ 
                            type: 'device_terminated',
                            sessionId: sessionId 
                        }));
                    }
                    
                    const el = document.querySelector('[data-id="' + sessionId + '"]');
                    if (el) el.remove();
                    
                    // Проверяем остальные
                    const remaining = document.querySelectorAll('#otherDevices .device-card');
                    if (remaining.length === 0) {
                        document.getElementById('otherDevices').innerHTML = `
                            <div class="device-card">
                                <div style="padding:20px;text-align:center;color:var(--text-muted);">
                                    <div style="font-size:36px;margin-bottom:8px;opacity:0.5;">🔌</div>
                                    <div>Нет других активных устройств</div>
                                </div>
                            </div>
                        `;
                        document.getElementById('terminateAllBtn').style.display = 'none';
                    }
                    
                    showToast('success', 'Сеанс завершён', '✓');
                }
            } catch (e) {
                showToast('error', 'Ошибка завершения', '❌');
            }
        }
        
        // Завершить все остальные сессии
        async function terminateAll() {
            if (!confirm(window.i18n?.t('terminateAllConfirm') || 'Завершить все остальные сеансы?')) return;
            
            try {
                const res = await fetch('/api/v1/users/devices/terminate-all', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                if (res.ok) {
                    // Отправляем WebSocket событие
                    if (devicesSocket && devicesSocket.readyState === WebSocket.OPEN) {
                        devicesSocket.send(JSON.stringify({ 
                            type: 'all_devices_terminated'
                        }));
                    }
                    
                    document.getElementById('otherDevices').innerHTML = `
                        <div class="device-card">
                            <div style="padding:20px;text-align:center;color:var(--text-muted);">
                                <div style="font-size:36px;margin-bottom:8px;opacity:0.5;">🔌</div>
                                <div>Нет других активных устройств</div>
                            </div>
                        </div>
                    `;
                    document.getElementById('terminateAllBtn').style.display = 'none';
                    showToast('success', 'Все сеансы завершены', '✓');
                }
            } catch (e) {
                showToast('error', 'Ошибка', '❌');
            }
        }
        
        function showToast(type, message, icon) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }
        
        // Очистка при закрытии страницы
        window.addEventListener('beforeunload', () => {
            if (devicesSocket) {
                devicesSocket.close();
                devicesSocket = null;
            }
            stopHeartbeat();
        });
        
        // ── ИНИЦИАЛИЗАЦИЯ ───────────────────────────────────────────────────────
        (async () => {
            await registerCurrentSession();
            await loadDevices();
            
            // Подключаем WebSocket для реального времени
            connectDevicesSocket();
            
            if (window.i18n) window.i18n.translatePage();
        })();

        // ── QR-вход ───────────────────────────────────────────────────────
        let qrTimer = null;
        let qrPollTimer = null;
        let currentQrToken = null;

        function showQR() {
            const overlay = document.getElementById('qrOverlay');
            overlay.style.display = 'flex';
            generateQR();
        }

        function closeQR() {
            document.getElementById('qrOverlay').style.display = 'none';
            if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
            if (qrPollTimer) { clearInterval(qrPollTimer); qrPollTimer = null; }
            currentQrToken = null;
        }

        async function generateQR() {
            const canvas = document.getElementById('qrCanvas');
            const expEl = document.getElementById('qrExpiry');
            const ctx = canvas.getContext('2d');

            // Показываем спиннер пока грузим
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#cccccc';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Генерация...', canvas.width / 2, canvas.height / 2);

            if (qrTimer) clearInterval(qrTimer);
            if (qrPollTimer) clearInterval(qrPollTimer);

            try {
                const res = await fetch('/api/v1/auth/qr-token', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({})
                });

                if (!res.ok) throw new Error('Server error');

                const data = await res.json();
                currentQrToken = data.qrToken;

                // Рисуем настоящий QR из base64 PNG
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                };
                img.src = data.qrImage;

                // Таймер обратного отсчёта
                let seconds = Math.floor((data.expiresAt - Date.now()) / 1000);
                expEl.textContent = 'Код действителен 5:00';
                expEl.style.cursor = 'default';
                expEl.onclick = null;

                qrTimer = setInterval(() => {
                    seconds--;
                    if (seconds <= 0) {
                        clearInterval(qrTimer);
                        expEl.textContent = 'Код истёк — нажмите для обновления';
                        expEl.style.cursor = 'pointer';
                        expEl.onclick = generateQR;
                        // Затемняем QR
                        ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.fillStyle = '#fff';
                        ctx.font = 'bold 14px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText('Истёк', canvas.width / 2, canvas.height / 2);
                        return;
                    }
                    const m = Math.floor(seconds / 60);
                    const s = seconds % 60;
                expEl.textContent = window.i18n?.t('qrValidFor', { time: m + ':' + (s < 10 ? '0' : '') + s }) || ('Код действителен ' + m + ':' + (s < 10 ? '0' : '') + s);
                }, 1000);

                // Polling — проверяем подтверждён ли QR каждые 2 секунды
                qrPollTimer = setInterval(async () => {
                    if (!currentQrToken) return;
                    try {
                        const pollRes = await fetch('/api/v1/auth/qr-status/' + currentQrToken);
                        const pollData = await pollRes.json();

                        if (pollData.status === 'confirmed') {
                            clearInterval(qrPollTimer);
                            clearInterval(qrTimer);
                            closeQR();
                            showToast('success', 'Новое устройство подключено!', '✓');
                            setTimeout(() => loadDevices(), 1000);
                        } else if (pollData.status === 'expired') {
                            clearInterval(qrPollTimer);
                        }
                    } catch (e) {}
                }, 2000);

            } catch (e) {
                expEl.textContent = 'Ошибка генерации. Нажмите для повтора.';
                expEl.style.cursor = 'pointer';
                expEl.onclick = generateQR;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#FF4B4B';
                ctx.font = '13px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Ошибка', canvas.width / 2, canvas.height / 2);
            }
        }
