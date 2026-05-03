const inputs = document.querySelectorAll('.code-input');
        const verifyBtn = document.getElementById('verifyBtn');
        const resendBtn = document.getElementById('resendBtn');

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
                alert('Введите 6-значный код');
                return;
            }

            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Проверка...';

            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                window.location.href = '../chats/chats.html';
            } catch (err) {
                alert('Неверный код');
                verifyBtn.disabled = false;
                verifyBtn.textContent = 'Подтвердить';
            }
        });

        resendBtn.addEventListener('click', async () => {
            resendBtn.textContent = 'Отправка...';
            await new Promise(resolve => setTimeout(resolve, 1000));
            resendBtn.textContent = 'Код отправлен';
            setTimeout(() => resendBtn.textContent = 'Отправить код повторно', 3000);
        });