function toggleFaq(el) {
            el.classList.toggle('open');
        }
        
        function contactSupport() {
            window.location.href = '../chats/chats.html?chat=craneapp_bot';
        }
        
        function openCraneAppBotChat() {
            window.location.href = '../chats/chats.html?chat=craneapp_bot';
        }

        // Modal functions
        function openModal(title, content) {
            document.getElementById('modalTitle').textContent = title;
            document.getElementById('modalBody').innerHTML = content;
            document.getElementById('docModal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        
        function closeModal() {
            document.getElementById('docModal').classList.remove('active');
            document.body.style.overflow = '';
        }
        
        function showDocs() {
            openModal('📖 Документация CraneApp', `
                <div style="line-height:1.6;">
                    <h3>Добро пожаловать в CraneApp!</h3>
                    <p>CraneApp — это современный мессенджер с акцентом на скорость, безопасность и простоту использования.</p>
                    
                    <h4>Основные функции:</h4>
                    <ul style="margin:10px 0; padding-left:20px;">
                        <li><b>Чаты и группы</b> — общайтесь с друзьями и создавайте сообщества</li>
                        <li><b>Каналы</b> — подписывайтесь на интересные каналы</li>
                        <li><b>Голосовые и видео звонки</b> — бесплатные звонки через интернет</li>
                        <li><b>Файлы и медиа</b> — отправляйте фото, видео, документы</li>
                        <li><b>CraneApp Bot</b> — официальный бот для уведомлений</li>
                    </ul>
                    
                    <h4>Команды бота:</h4>
                    <p><code>/start</code> — начать работу с ботом<br>
                    <code>/help</code> — список команд</p>
                    
                    <p style="margin-top:20px; color:#888;">Версия 1.0.0 | 2026 CraneApp</p>
                </div>
            `);
        }
        
        function showPrivacy() {
            openModal('🔒 Политика конфиденциальности', `
                <div style="line-height:1.6;">
                    <h3>Политика конфиденциальности CraneApp</h3>
                    <p><b>Последнее обновление:</b> 23 апреля 2026 г.</p>
                    
                    <h4>1. Собираемые данные</h4>
                    <p>Мы собираем минимум данных:</p>
                    <ul style="margin:10px 0; padding-left:20px;">
                        <li>Имя пользователя и никнейм</li>
                        <li>Адрес электронной почты</li>
                        <li>IP-адрес для безопасности</li>
                        <li>Содержание сообщений (для доставки)</li>
                    </ul>
                    
                    <h4>2. Использование данных</h4>
                    <p>Данные используются только для:</p>
                    <ul style="margin:10px 0; padding-left:20px;">
                        <li>Работы мессенджера</li>
                        <li>Безопасности аккаунта</li>
                        <li>Технической поддержки</li>
                    </ul>
                    
                    <h4>3. Защита данных</h4>
                    <p>Мы используем шифрование для защиты ваших сообщений. Данные хранятся на защищённых серверах.</p>
                    
                    <h4>4. Удаление данных</h4>
                    <p>Вы можете удалить свой аккаунт в любой момент через настройки.</p>
                    
                    <p style="margin-top:20px; color:#888;"> 2026 CraneApp Team</p>
                </div>
            `);
        }
        
        function showTerms() {
            openModal('📜 Условия использования', `
                <div style="line-height:1.6;">
                    <h3>Условия использования CraneApp</h3>
                    <p><b>Действуют с:</b> 23 апреля 2026 г.</p>
                    
                    <h4>1. Принятие условий</h4>
                    <p>Используя CraneApp, вы соглашаетесь с этими условиями.</p>
                    
                    <h4>2. Правила поведения</h4>
                    <p>Запрещается:</p>
                    <ul style="margin:10px 0; padding-left:20px;">
                        <li>Спам и массовая рассылка</li>
                        <li>Распространение вредоносного ПО</li>
                        <li>Оскорбления и домогательства</li>
                        <li>Незаконная деятельность</li>
                        <li>Обход блокировок</li>
                    </ul>
                    
                    <h4>3. Аккаунты</h4>
                    <p>Вы несёте ответственность за безопасность своего аккаунта. Не передавайте пароль третьим лицам.</p>
                    
                    <h4>4. Прекращение использования</h4>
                    <p>Мы можем заблокировать аккаунт за нарушение правил.</p>
                    
                    <h4>5. Ограничение ответственности</h4>
                    <p>CraneApp предоставляется "как есть". Мы не несём ответственность за потерю данных.</p>
                    
                    <p style="margin-top:20px; color:#888;"> 2026 CraneApp Team</p>
                </div>
            `);
        }
        
        // Close modal on outside click
        document.getElementById('docModal').addEventListener('click', function(e) {
            if (e.target.id === 'docModal') closeModal();
        });
        
        if (window.i18n) window.i18n.translatePage();