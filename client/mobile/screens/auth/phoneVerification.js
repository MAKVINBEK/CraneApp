const inputs = document.querySelectorAll('.code-input');
        const verifyBtn = document.getElementById('verifyBtn');
        const resendBtn = document.getElementById('resendBtn');
        const tr = (key, fallback, vars) => window.i18n?.t(key, vars) || fallback;

        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1 && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
                checkComplete();
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });
        });

        function checkComplete() {
            let code = '';
            inputs.forEach(input => code += input.value);
            return code.length === 6;
        }

        verifyBtn.addEventListener('click', async () => {
            let code = '';
            inputs.forEach(input => code += input.value);
            
            if (code.length !== 6) {
                alert(tr('enterSixDigitCode', 'Введите 6-значный код'));
                return;
            }

            verifyBtn.disabled = true;
            verifyBtn.textContent = tr('checking', 'Проверка...');

            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                window.location.href = '../chats/chats.html';
            } catch (err) {
                alert(tr('wrongCode', 'Неверный код'));
                verifyBtn.disabled = false;
                verifyBtn.textContent = tr('verify', 'Подтвердить');
            }
        });

        resendBtn.addEventListener('click', async () => {
            resendBtn.textContent = tr('sending', 'Отправка...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            resendBtn.textContent = tr('codeSent', 'Код отправлен');
            setTimeout(() => resendBtn.textContent = tr('resendCode', 'Отправить код повторно'), 3000);
        });
