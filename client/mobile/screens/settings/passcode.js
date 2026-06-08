window.__isPasscodePage = true;

const token = localStorage.getItem('craneapp_auth_token');
        if (!token) window.location.href = '../auth/login.html';

        let passcodeEnabled = false;
        let passcodeTimeout = 60;
        let overlayMode = null; // 'set', 'confirm', 'verify-disable', 'verify-change', 'confirm-change'
        let inputBuffer = '';
        let firstPasscode = '';

        const timeoutOptions = [
            { value: 0, label: 'Сразу' },
            { value: 60, label: '1 минуту' },
            { value: 300, label: '5 минут' },
            { value: 3600, label: '1 час' },
            { value: 0, label: 'Никогда', special: 'never' }
        ];

        const timeoutLabels = {
            0: 'Сразу',
            60: '1 минуту',
            300: '5 минут',
            3600: '1 час',
            '-1': 'Никогда'
        };

        async function loadSettings() {
            try {
                const res = await fetch('/api/v1/users/passcode', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    passcodeEnabled = data.enabled;
                    passcodeTimeout = data.timeout;
                }
            } catch (e) {
                passcodeEnabled = localStorage.getItem('craneapp_passcode_enabled') === 'true';
                passcodeTimeout = parseInt(localStorage.getItem('craneapp_passcode_timeout') || '60');
            }
            updateUI();
        }

        function updateUI() {
            const toggle = document.getElementById('passcodeToggle');
            const statusText = document.getElementById('passcodeStatusText');
            const changeItem = document.getElementById('changePasscodeItem');
            const timeoutSection = document.getElementById('timeoutSection');
            const infoHeader = document.getElementById('infoHeader');
            const infoSection = document.getElementById('infoSection');

            if (passcodeEnabled) {
                toggle.classList.add('active');
                statusText.textContent = 'Включён';
                changeItem.style.display = 'flex';
                timeoutSection.style.display = 'block';
                infoHeader.style.display = 'block';
                infoSection.style.display = 'block';
            } else {
                toggle.classList.remove('active');
                statusText.textContent = 'Защитите приложение 4-значным кодом';
                changeItem.style.display = 'none';
                timeoutSection.style.display = 'none';
                infoHeader.style.display = 'none';
                infoSection.style.display = 'none';
            }

            document.getElementById('timeoutValue').textContent = timeoutLabels[passcodeTimeout] || '1 минуту';
        }

        function togglePasscode() {
            if (passcodeEnabled) {
                openOverlay('verify-disable', 'Введите текущий код', 'Для отключения защиты');
            } else {
                openOverlay('set', 'Создайте код-пароль', 'Введите 4 цифры');
            }
        }

        function openChangePasscode() {
            openOverlay('verify-change', 'Введите текущий код', 'Для изменения кода');
        }

        // ---- Overlay ----
        function openOverlay(mode, title, subtitle) {
            overlayMode = mode;
            inputBuffer = '';
            firstPasscode = '';
            document.getElementById('overlayTitle').textContent = title;
            document.getElementById('overlaySubtitle').textContent = subtitle;
            updateDots();
            document.getElementById('passcodeOverlay').classList.add('active');
        }

        function closeOverlay() {
            document.getElementById('passcodeOverlay').classList.remove('active');
            inputBuffer = '';
            firstPasscode = '';
            overlayMode = null;
        }

        function numpadPress(digit) {
            if (inputBuffer.length >= 4) return;
            inputBuffer += digit;
            updateDots();
            if (inputBuffer.length === 4) {
                setTimeout(() => handlePasscodeComplete(), 150);
            }
        }

        function numpadDelete() {
            if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1);
                updateDots();
            }
        }

        function updateDots(state) {
            for (let i = 0; i < 4; i++) {
                const dot = document.getElementById('dot' + i);
                dot.classList.remove('filled', 'error');
                if (state === 'error') dot.classList.add('error');
                else if (i < inputBuffer.length) dot.classList.add('filled');
            }
        }

        async function handlePasscodeComplete() {
            if (overlayMode === 'set') {
                firstPasscode = inputBuffer;
                inputBuffer = '';
                document.getElementById('overlayTitle').textContent = 'Повторите код';
                document.getElementById('overlaySubtitle').textContent = 'Введите код ещё раз';
                updateDots();
                overlayMode = 'confirm';
            } else if (overlayMode === 'confirm') {
                if (inputBuffer === firstPasscode) {
                    await setPasscode(inputBuffer);
                } else {
                    shakeAndReset('Коды не совпадают');
                }
            } else if (overlayMode === 'verify-disable') {
                const ok = await verifyPasscode(inputBuffer);
                if (ok) {
                    await disablePasscode(inputBuffer);
                } else {
                    shakeAndReset('Неверный код');
                }
            } else if (overlayMode === 'verify-change') {
                const ok = await verifyPasscode(inputBuffer);
                if (ok) {
                    firstPasscode = '';
                    inputBuffer = '';
                    document.getElementById('overlayTitle').textContent = 'Новый код-пароль';
                    document.getElementById('overlaySubtitle').textContent = 'Введите новый 4-значный код';
                    updateDots();
                    overlayMode = 'set-new';
                } else {
                    shakeAndReset('Неверный код');
                }
            } else if (overlayMode === 'set-new') {
                firstPasscode = inputBuffer;
                inputBuffer = '';
                document.getElementById('overlayTitle').textContent = 'Повторите новый код';
                document.getElementById('overlaySubtitle').textContent = 'Введите код ещё раз';
                updateDots();
                overlayMode = 'confirm-new';
            } else if (overlayMode === 'confirm-new') {
                if (inputBuffer === firstPasscode) {
                    await setPasscode(inputBuffer);
                } else {
                    shakeAndReset('Коды не совпадают');
                }
            }
        }

        function shakeAndReset(message) {
            updateDots('error');
            const dots = document.getElementById('passcodeDots');
            dots.classList.add('shake');
            setTimeout(() => {
                dots.classList.remove('shake');
                inputBuffer = '';
                updateDots();
            }, 500);
            showToast(message, '❌', true);
        }

        async function setPasscode(code) {
            try {
                const res = await fetch('/api/v1/users/passcode/set', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ passcode: code })
                });
                if (res.ok) {
                    passcodeEnabled = true;
                    localStorage.setItem('craneapp_passcode_enabled', 'true');
                    sessionStorage.setItem('craneapp_unlocked', 'true'); // уже разблокировано
                    closeOverlay();
                    updateUI();
                    showToast('Код-пароль установлен', '✓');
                } else {
                    shakeAndReset('Ошибка сервера');
                }
            } catch (e) {
                passcodeEnabled = true;
                localStorage.setItem('craneapp_passcode_enabled', 'true');
                localStorage.setItem('craneapp_passcode', code);
                sessionStorage.setItem('craneapp_unlocked', 'true');
                closeOverlay();
                updateUI();
                showToast('Код-пароль установлен', '✓');
            }
        }

        async function verifyPasscode(code) {
            try {
                const res = await fetch('/api/v1/users/passcode/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ passcode: code })
                });
                return res.ok;
            } catch (e) {
                // Offline fallback
                return localStorage.getItem('craneapp_passcode') === code;
            }
        }

        async function disablePasscode(code) {
            try {
                const res = await fetch('/api/v1/users/passcode/disable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ passcode: code })
                });
                if (res.ok) {
                    passcodeEnabled = false;
                    localStorage.setItem('craneapp_passcode_enabled', 'false');
                    localStorage.removeItem('craneapp_passcode');
                    closeOverlay();
                    updateUI();
                    showToast('Код-пароль отключён', '✓');
                } else {
                    shakeAndReset('Ошибка сервера');
                }
            } catch (e) {
                passcodeEnabled = false;
                localStorage.setItem('craneapp_passcode_enabled', 'false');
                localStorage.removeItem('craneapp_passcode');
                closeOverlay();
                updateUI();
                showToast('Код-пароль отключён', '✓');
            }
        }

        // ---- Timeout Picker ----
        function openTimeoutPicker() {
            const options = [
                { value: 0, label: 'Сразу' },
                { value: 60, label: '1 минуту' },
                { value: 300, label: '5 минут' },
                { value: 3600, label: '1 час' },
                { value: -1, label: 'Никогда' }
            ];

            const container = document.getElementById('pickerOptions');
            container.innerHTML = options.map(o => `
                <div class="picker-option ${o.value === passcodeTimeout ? 'selected' : ''}" onclick="selectTimeout(${o.value})">
                    <span>${o.label}</span>
                    ${o.value === passcodeTimeout ? '<span>✓</span>' : ''}
                </div>
            `).join('');

            document.getElementById('pickerOverlay').classList.add('active');
            setTimeout(() => document.getElementById('pickerModal').classList.add('active'), 10);
        }

        async function selectTimeout(value) {
            passcodeTimeout = value;
            localStorage.setItem('craneapp_passcode_timeout', value);

            try {
                await fetch('/api/v1/users/passcode/timeout', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ timeout: value })
                });
            } catch (e) {}

            updateUI();
            closePicker();
            showToast('Сохранено', '✓');
        }

        function closePicker() {
            document.getElementById('pickerOverlay').classList.remove('active');
            document.getElementById('pickerModal').classList.remove('active');
        }

        function showToast(message, icon, isError) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast' + (isError ? ' error' : '');
            toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }

        loadSettings();
        if (window.i18n) window.i18n.translatePage();