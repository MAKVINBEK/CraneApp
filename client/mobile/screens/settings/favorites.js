const token = localStorage.getItem('craneapp_auth_token');
if (!token) window.location.href = '../auth/login.html';

// Информация о боте для избранного
const FAVORITES_BOT = {
    id: 'favorites-bot',
    name: 'Избранное',
    avatar: '📝',
    status: 'Личные заметки'
};

let favorites = [];
let isSearchActive = false;
let searchQuery = '';

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadFavorites();
    setupEventListeners();
    updateSendButton();
});

// Загрузка избранных сообщений
async function loadFavorites() {
    try {
        const res = await fetch('/api/v1/favorites', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        favorites = data.favorites || [];
    } catch (e) {
        // Fallback: читаем из localStorage
        favorites = JSON.parse(localStorage.getItem('craneapp_favorites') || '[]');
    }
    renderMessages();
}

// Сохранение избранных сообщений
async function saveFavorites() {
    try {
        await fetch('/api/v1/favorites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ favorites })
        });
    } catch (e) {
        // Fallback: сохраняем в localStorage
        localStorage.setItem('craneapp_favorites', JSON.stringify(favorites));
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    const msgInput = document.getElementById('msgInput');
    const searchInput = document.getElementById('searchInput');
    
    // Обработчик ввода сообщения
    msgInput.addEventListener('input', updateSendButton);
    msgInput.addEventListener('keydown', handleInputKeydown);
    
    // Обработчик поиска
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderMessages();
    });
    
    // Закрытие панели вложений при клике вне её
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('attachmentPanel');
        if (!panel.contains(e.target) && !e.target.closest('.attach-btn')) {
            panel.classList.remove('show');
        }
    });
}

// Обработка клавиш в поле ввода
function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendFavorite();
    }
}

// Отправка сообщения в избранное
async function sendFavorite() {
    const msgInput = document.getElementById('msgInput');
    const content = msgInput.innerText.trim();
    
    if (!content) return;
    
    const newFavorite = {
        id: 'fav-' + Date.now(),
        content: content,
        type: 'text',
        createdAt: new Date().toISOString(),
        senderId: 'me',
        senderName: 'Вы'
    };
    
    // Добавляем в начало массива
    favorites.unshift(newFavorite);
    
    // Очищаем поле ввода
    msgInput.innerText = '';
    updateSendButton();
    
    // Перерисовываем сообщения
    renderMessages();
    
    // Сохраняем
    await saveFavorites();
    
    // Показываем уведомление
    showToast('Заметка сохранена', '✅');
}

// Отрисовка сообщений
function renderMessages() {
    const messagesContainer = document.getElementById('messages');
    
    // Фильтрация сообщений при поиске
    let filteredFavorites = favorites;
    if (isSearchActive && searchQuery) {
        filteredFavorites = favorites.filter(fav => 
            fav.content.toLowerCase().includes(searchQuery)
        );
    }
    
    if (filteredFavorites.length === 0 && !isSearchActive) {
        messagesContainer.innerHTML = `
            <div class="system-message">
                <div class="system-text">📝 Ваши личные заметки</div>
                <div class="system-subtext">Сохраняйте важные мысли, идеи и ссылки здесь</div>
            </div>`;
        return;
    }
    
    if (filteredFavorites.length === 0 && isSearchActive) {
        messagesContainer.innerHTML = `
            <div class="system-message">
                <div class="system-text">Ничего не найдено</div>
                <div class="system-subtext">Попробуйте изменить поисковый запрос</div>
            </div>`;
        return;
    }
    
    messagesContainer.innerHTML = filteredFavorites.map(fav => {
        const isSent = fav.senderId === 'me';
        const time = formatTime(fav.createdAt);
        
        if (isSent) {
            return `
                <div class="message sent" data-message-id="${fav.id}">
                    <div class="message-content">
                        <div class="message-bubble">
                            <div class="message-text">${escHtml(fav.content)}</div>
                        </div>
                        <div class="message-time">${time}</div>
                    </div>
                </div>`;
        } else {
            return `
                <div class="message" data-message-id="${fav.id}">
                    <div class="message-avatar">📝</div>
                    <div class="message-content">
                        <div class="message-bubble">
                            <div class="message-text">${escHtml(fav.content)}</div>
                        </div>
                        <div class="message-time">${time}</div>
                    </div>
                </div>`;
        }
    }).join('');
    
    // Прокрутка вниз
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Обновление кнопки отправки
function updateSendButton() {
    const msgInput = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');
    const hasContent = msgInput.innerText.trim().length > 0;
    
    sendBtn.disabled = !hasContent;
}

// Переключение поиска
function toggleSearch() {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    
    isSearchActive = !isSearchActive;
    
    if (isSearchActive) {
        searchBar.style.display = 'flex';
        searchInput.focus();
    } else {
        searchBar.style.display = 'none';
        searchInput.value = '';
        searchQuery = '';
    }
    
    renderMessages();
}

// Очистка поиска
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    searchQuery = '';
    renderMessages();
}

// Показать дополнительные опции
function showMoreOptions() {
    // Здесь можно добавить меню с опциями:
    // - Очистить все заметки
    // - Экспорт заметок
    // - Настройки
    showToast('Дополнительные опции скоро', '🔧');
}

// Открыть панель вложений
function openAttachmentPanel() {
    const panel = document.getElementById('attachmentPanel');
    panel.classList.toggle('show');
}

// Закрыть панель вложений
function closeAttachmentPanel() {
    const panel = document.getElementById('attachmentPanel');
    panel.classList.remove('show');
}

// Обработка выбора фото
function handlePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const newFavorite = {
            id: 'fav-' + Date.now(),
            content: e.target.result,
            type: 'image',
            createdAt: new Date().toISOString(),
            senderId: 'me',
            senderName: 'Вы'
        };
        
        favorites.unshift(newFavorite);
        renderMessages();
        await saveFavorites();
        showToast('Фото сохранено', '📷');
    };
    reader.readAsDataURL(file);
    
    // Очищаем input
    event.target.value = '';
    closeAttachmentPanel();
}

// Обработка выбора файла
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const newFavorite = {
        id: 'fav-' + Date.now(),
        content: file.name,
        type: 'file',
        fileName: file.name,
        fileSize: file.size,
        createdAt: new Date().toISOString(),
        senderId: 'me',
        senderName: 'Вы'
    };
    
    favorites.unshift(newFavorite);
    renderMessages();
    await saveFavorites();
    showToast('Файл сохранен', '📎');
    
    // Очищаем input
    event.target.value = '';
    closeAttachmentPanel();
}

// Начать запись голоса
function startVoiceRecording() {
    showToast('Запись голоса скоро', '🎤');
    closeAttachmentPanel();
}

// Переключение эмодзи
function toggleEmojiPicker() {
    showToast('Эмодзи скоро', '😊');
}

// Удаление избранного сообщения
async function removeFavorite(messageId) {
    const index = favorites.findIndex(fav => fav.id === messageId);
    if (index !== -1) {
        favorites.splice(index, 1);
        renderMessages();
        await saveFavorites();
        showToast('Заметка удалена', '🗑️');
    }
}

// Форматирование времени
function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    
    if (diff < 86400000 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 7 * 86400000) {
        return d.toLocaleDateString('ru', { weekday: 'short' });
    }
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

// Экранирование HTML
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Показать уведомление
function showToast(msg, icon = '✓') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => { 
        t.style.opacity = '0'; 
        t.style.transition = 'opacity 0.3s'; 
        setTimeout(() => t.remove(), 300); 
    }, 2000);
}

// Контекстное меню для сообщений
document.addEventListener('contextmenu', (e) => {
    const messageEl = e.target.closest('.message');
    if (!messageEl) return;
    
    e.preventDefault();
    const messageId = messageEl.dataset.messageId;
    if (messageId) {
        // Показать контекстное меню с опциями:
        // - Копировать
        // - Удалить
        // - Поделиться
        removeFavorite(messageId);
    }
});