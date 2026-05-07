const token = localStorage.getItem('craneapp_auth_token');
let currentSessionId = null;

sessionStorage.removeItem('craneapp_session_registered');

function tr(key, fallback, vars) {
    const value = window.i18n?.t(key, vars);
    if (value && value !== key) return value;
    return fallback;
}

function getDeviceInfo() {
    const ua = navigator.userAgent;
    let device = { icon: '📱', name: tr('mobileDevice', 'Mobile device'), type: 'mobile' };

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

async function registerCurrentSession() {
    if (sessionStorage.getItem('craneapp_session_registered')) return;

    const device = getDeviceInfo();
    let clientIP = '';
    try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        if (ipRes.ok) {
            const d = await ipRes.json();
            clientIP = d.ip || '';
        }
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
    } catch (e) {
        console.warn('Session registration failed:', e);
    }
    return null;
}

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

function emptyDevicesHtml() {
    return `
        <div class="device-card">
            <div style="padding:20px;text-align:center;color:var(--text-muted);">
                <div style="font-size:36px;margin-bottom:8px;opacity:0.5;">🔌</div>
                <div>${tr('noOtherDevices', 'No other active devices')}</div>
            </div>
        </div>
    `;
}

function renderDevices(devices) {
    const container = document.getElementById('otherDevices');
    const terminateBtn = document.getElementById('terminateAllBtn');
    const currentDevice = getDeviceInfo();

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

    const locationEl = document.getElementById('currentLocation');
    if (locationEl) locationEl.textContent = current.location || '—';

    const others = devices.filter(d => !d.is_current);

    if (others.length === 0) {
        container.innerHTML = emptyDevicesHtml();
        terminateBtn.style.display = 'none';
        return;
    }

    terminateBtn.style.display = 'block';

    container.innerHTML = others.map(d => `
        <div class="device-card" data-id="${d.id}">
            <div class="device-header">
                <div class="device-icon">${getDeviceIcon(d.device_type)}</div>
                <div class="device-info">
                    <div class="device-name">${d.device_name || tr('device', 'Device')}</div>
                    <div class="device-status offline">${formatTime(d.last_active)}</div>
                </div>
            </div>
            <div class="device-details">
                <div class="device-detail">
                    <span class="device-detail-label">${tr('ipAddress', 'IP address')}</span>
                    <span>${maskIP(d.ip_address)}</span>
                </div>
                ${d.location ? `
                <div class="device-detail">
                    <span class="device-detail-label">${tr('location', 'Location')}</span>
                    <span>${d.location}</span>
                </div>
                ` : ''}
            </div>
            <div class="device-actions">
                <button class="terminate-btn" onclick="terminateDevice('${d.id}')">${tr('terminateSession', 'Terminate session')}</button>
            </div>
        </div>
    `).join('');
}

function getDeviceIcon(type) {
    const icons = {
        iphone: '📱',
        ipad: '📟',
        android: '📱',
        windows: '💻',
        mac: '💻',
        linux: '💻'
    };
    return icons[type] || '📱';
}

function maskIP(ip) {
    if (!ip) return '—';
    const parts = ip.split('.');
    if (parts.length === 4) return parts[0] + '.' + parts[1] + '.' + parts[2] + '.***';
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

    if (minutes < 1) return tr('justNow', 'just now');
    if (minutes < 60) return tr('minutesAgo', '{count} min. ago', { count: minutes });
    if (hours < 24) return tr('hoursAgo', '{count} h. ago', { count: hours });
    if (days < 7) return tr('daysAgo', '{count} d. ago', { count: days });

    return date.toLocaleDateString(window.i18n?.currentLang || undefined);
}

async function terminateDevice(sessionId) {
    if (!confirm(tr('terminateSessionConfirm', 'Terminate this device session?'))) return;

    try {
        const res = await fetch('/api/v1/users/devices/' + sessionId, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (res.ok) {
            const el = document.querySelector('[data-id="' + sessionId + '"]');
            if (el) el.remove();

            const remaining = document.querySelectorAll('#otherDevices .device-card');
            if (remaining.length === 0) {
                document.getElementById('otherDevices').innerHTML = emptyDevicesHtml();
                document.getElementById('terminateAllBtn').style.display = 'none';
            }

            showToast('success', tr('sessionTerminated', 'Session terminated'), '✓');
        }
    } catch (e) {
        showToast('error', tr('terminateError', 'Termination error'), '❌');
    }
}

async function terminateAll() {
    if (!confirm(tr('terminateAllConfirm', 'Terminate all other sessions?'))) return;

    try {
        const res = await fetch('/api/v1/users/devices/terminate-all', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (res.ok) {
            document.getElementById('otherDevices').innerHTML = emptyDevicesHtml();
            document.getElementById('terminateAllBtn').style.display = 'none';
            showToast('success', tr('allSessionsTerminated', 'All sessions terminated'), '✓');
        }
    } catch (e) {
        showToast('error', tr('error', 'Error'), '❌');
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

(async function init() {
    await registerCurrentSession();
    await loadDevices();
    if (window.i18n) window.i18n.translatePage();
})();

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
    if (qrTimer) {
        clearInterval(qrTimer);
        qrTimer = null;
    }
    if (qrPollTimer) {
        clearInterval(qrPollTimer);
        qrPollTimer = null;
    }
    currentQrToken = null;
}

async function generateQR() {
    const canvas = document.getElementById('qrCanvas');
    const expEl = document.getElementById('qrExpiry');
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#cccccc';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tr('generating', 'Generating...'), canvas.width / 2, canvas.height / 2);

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

        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = data.qrImage;

        let seconds = Math.floor((data.expiresAt - Date.now()) / 1000);
        expEl.textContent = tr('qrValidFor', 'Code valid for {time}', { time: '5:00' });
        expEl.style.cursor = 'default';
        expEl.onclick = null;

        qrTimer = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(qrTimer);
                expEl.textContent = tr('qrExpiredRefresh', 'Code expired - tap to refresh');
                expEl.style.cursor = 'pointer';
                expEl.onclick = generateQR;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(tr('expired', 'Expired'), canvas.width / 2, canvas.height / 2);
                return;
            }
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            expEl.textContent = tr('qrValidFor', 'Code valid for {time}', { time: m + ':' + (s < 10 ? '0' : '') + s });
        }, 1000);

        qrPollTimer = setInterval(async () => {
            if (!currentQrToken) return;
            try {
                const pollRes = await fetch('/api/v1/auth/qr-status/' + currentQrToken);
                const pollData = await pollRes.json();

                if (pollData.status === 'confirmed') {
                    clearInterval(qrPollTimer);
                    clearInterval(qrTimer);
                    closeQR();
                    showToast('success', tr('newDeviceConnected', 'New device connected!'), '✓');
                    setTimeout(() => loadDevices(), 1000);
                } else if (pollData.status === 'expired') {
                    clearInterval(qrPollTimer);
                }
            } catch (e) {}
        }, 2000);
    } catch (e) {
        expEl.textContent = tr('qrGenerationErrorRetry', 'Generation error. Tap to retry.');
        expEl.style.cursor = 'pointer';
        expEl.onclick = generateQR;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#FF4B4B';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tr('error', 'Error'), canvas.width / 2, canvas.height / 2);
    }
}
