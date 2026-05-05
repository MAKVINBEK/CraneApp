// ============================================
        // REACTIONS
        // ============================================
        const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉'];

        let reactionPickerEl = null;
        let reactionFullPickerEl = null;
        let reactionTargetMessageId = null;

        function toggleReactionFromMenu(emoji) {
            document.getElementById('messageContextMenu').classList.remove('active');
            if (!isValidUUID(currentMessageId)) return;
            toggleReaction(currentMessageId, emoji);
        }

        function openReactionPickerFromMenu() {
            if (!isValidUUID(currentMessageId)) return;
            const msgId = currentMessageId;
            document.getElementById('messageContextMenu').classList.remove('active');
            setTimeout(() => showFullEmojiPicker(msgId), 50);
        }

        // Подсвечиваем уже поставленные реакции в контекстном меню
        function updateContextMenuReactions(messageId) {
            const msg = messagesData[messageId];
            if (!msg || !msg.reactions) return;
            const myReactions = new Set(msg.reactions.filter(r => r.myReaction).map(r => r.emoji));
            document.querySelectorAll('.context-reaction-btn[onclick*="toggleReactionFromMenu"]').forEach(btn => {
                const emoji = btn.textContent.trim();
                btn.classList.toggle('active-reaction', myReactions.has(emoji));
            });
        }

        function createReactionsElement(messageId, reactions) {
            const el = document.createElement('div');
            el.className = 'message-reactions';
            el.dataset.messageId = messageId;
            reactions.forEach(r => {
                const badge = document.createElement('div');
                badge.className = 'reaction-badge' + (r.myReaction ? ' my-reaction' : '');
                badge.innerHTML = `<span>${r.emoji}</span><span class="reaction-count">${r.count}</span>`;
                badge.onclick = (e) => { e.stopPropagation(); toggleReaction(messageId, r.emoji); };
                el.appendChild(badge);
            });
            return el;
        }

        function updateMessageReactions(messageId, reactions) {
            const msgEl = document.querySelector('[data-message-id="' + messageId + '"]');
            if (!msgEl) return;
            
            const old = msgEl.querySelector('.message-reactions');
            if (old) old.remove();
            
            if (reactions && reactions.length > 0) {
                const reactionsData = reactions.map(r => ({
                    emoji: r.emoji,
                    count: parseInt(r.count),
                    myReaction: r.my_reaction || r.myReaction
                }));
                const el = createReactionsElement(messageId, reactionsData);
                const timeEl = msgEl.querySelector('.msg-time');
                if (timeEl) msgEl.insertBefore(el, timeEl);
                else msgEl.appendChild(el);
            }
        }

        function showReactionPicker(e, messageId) {
            e.stopPropagation();
            closeReactionPicker();
            reactionTargetMessageId = messageId;
            
            reactionPickerEl = document.createElement('div');
            reactionPickerEl.className = 'reaction-picker';
            
            QUICK_REACTIONS.forEach(emoji => {
                const btn = document.createElement('div');
                btn.className = 'reaction-picker-emoji';
                btn.textContent = emoji;
                btn.onclick = (ev) => { ev.stopPropagation(); toggleReaction(messageId, emoji); closeReactionPicker(); };
                reactionPickerEl.appendChild(btn);
            });
            
            const more = document.createElement('div');
            more.className = 'reaction-picker-more';
            more.textContent = '＋';
            more.onclick = (ev) => { ev.stopPropagation(); showFullEmojiPicker(messageId); };
            reactionPickerEl.appendChild(more);
            
            document.body.appendChild(reactionPickerEl);
            
            const msgEl = document.querySelector('[data-message-id="' + messageId + '"]');
            if (msgEl) {
                const rect = msgEl.getBoundingClientRect();
                const pickerW = 320;
                let left = rect.left;
                if (left + pickerW > window.innerWidth) left = window.innerWidth - pickerW - 8;
                if (left < 8) left = 8;
                const top = Math.max(8, rect.top - 60);
                reactionPickerEl.style.left = left + 'px';
                reactionPickerEl.style.top = top + 'px';
            }
        }

        function showFullEmojiPicker(messageId) {
            closeReactionPicker();
            reactionTargetMessageId = messageId;
            
            reactionFullPickerEl = document.createElement('div');
            reactionFullPickerEl.className = 'reaction-full-picker';
            
            const grid = document.createElement('div');
            grid.className = 'reaction-full-picker-grid';
            
            const allCategories = ['smileys', 'animals', 'food', 'activities', 'travel', 'objects', 'symbols'];
            let allEmojis = [];
            allCategories.forEach(cat => {
                if (window.EmojiData && window.EmojiData[cat]) allEmojis = allEmojis.concat(window.EmojiData[cat]);
            });
            if (allEmojis.length === 0) allEmojis = QUICK_REACTIONS;
            
            allEmojis.slice(0, 200).forEach(emoji => {
                const btn = document.createElement('div');
                btn.className = 'reaction-full-picker-emoji';
                btn.textContent = emoji;
                btn.onclick = (e) => { e.stopPropagation(); toggleReaction(messageId, emoji); closeFullEmojiPicker(); };
                grid.appendChild(btn);
            });
            
            reactionFullPickerEl.appendChild(grid);
            document.body.appendChild(reactionFullPickerEl);
            
            // Центрируем по экрану
            const pickerW = 300;
            const pickerH = 280;
            reactionFullPickerEl.style.left = Math.max(8, (window.innerWidth - pickerW) / 2) + 'px';
            reactionFullPickerEl.style.top = Math.max(8, (window.innerHeight - pickerH) / 2) + 'px';
        }

        function closeReactionPicker() {
            if (reactionPickerEl) { reactionPickerEl.remove(); reactionPickerEl = null; }
        }

        function closeFullEmojiPicker() {
            if (reactionFullPickerEl) { reactionFullPickerEl.remove(); reactionFullPickerEl = null; }
        }

        async function toggleReaction(messageId, emoji) {
            if (!isValidUUID(messageId)) return;
            try {
                const res = await fetch('/api/v1/messages/' + messageId + '/reactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ emoji })
                });
                const data = await res.json();
                if (data.reactions !== undefined) {
                    updateMessageReactions(messageId, data.reactions);
                }
            } catch (err) {
                console.error('Reaction error:', err);
            }
        }

        document.addEventListener('click', function(e) {
            if (reactionPickerEl && !reactionPickerEl.contains(e.target)) closeReactionPicker();
            if (reactionFullPickerEl && !reactionFullPickerEl.contains(e.target)) closeFullEmojiPicker();
        });

        // ============================================
        // INIT
        // ============================================
        const token = localStorage.getItem('craneapp_auth_token');
        let user = JSON.parse(localStorage.getItem('craneapp_user_data') || '{}');
        function tr(key, fallback, vars) {
            return window.i18n?.t(key, vars) || fallback;
        }
        function tc(key, count, fallback) {
            return window.i18n?.tc ? window.i18n.tc(key, count) : (fallback || (count + ' ' + pluralMembers(count)));
        }

        // Инициализируем E2E шифрование
        if (token && window.E2E) {
            window.E2E.init(token).then(ok => {
                if (ok) console.log('🔐 E2E encryption ready');
            });
        }
        
        if (!token) {
            window.location.href = '../auth/login.html';
        }

        let activeChat = null;
        let allChats = [];
        let chatUsers = {};
        let searchTimeout = null;
        let currentMessageId = null;
        let currentMessageElement = null;
        let replyingTo = null;
        let messagesData = {};
        let currentPreviewMediaUrl = null;
        
        let currentEmojiCategory = 'smileys';

        // ── Проверка наличия камеры ────────────────────────────────────────
        let cameraAvailable = false;

        (async function checkCamera() {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
                const devices = await navigator.mediaDevices.enumerateDevices();
                cameraAvailable = devices.some(d => d.kind === 'videoinput');
            } catch (_) {
                cameraAvailable = false;
            }
            // Если камеры нет — скрываем кнопку кружка навсегда
            if (!cameraAvailable) {
                const btn = document.getElementById('videoNoteBtn');
                if (btn) btn.style.display = 'none';
            }
        })();
        
        let stickerPacks = [];
        let currentStickerPackId = null;
        let newPackIconData = null;
        
        let savedGifs = [];
        
        let ws = null;
        let wsReconnectTimer = null;

        // ============================================
        // PIN & ARCHIVE CHATS
        // ============================================
        
        let currentContextChatId = null;
        let archivedChats = [];
        let pinnedChatIds = new Set();

        // ============================================
        // SIDE MENU
        // ============================================
        function openSideMenu() {
            document.getElementById('sideMenuOverlay').classList.add('active');
            document.getElementById('sideMenu').classList.add('active');
        }

        function closeSideMenu() {
            document.getElementById('sideMenuOverlay').classList.remove('active');
            document.getElementById('sideMenu').classList.remove('active');
        }

        // ============================================
        // SETTINGS / ABOUT HUBS
        // ============================================
        function openSettingsHub() {
            closeSideMenu();
            const hub = document.getElementById('settingsHub');
            if (hub) hub.classList.add('active');
        }
        function closeSettingsHub() {
            const hub = document.getElementById('settingsHub');
            if (hub) hub.classList.remove('active');
        }
        function openAboutHub() {
            closeSideMenu();
            const hub = document.getElementById('aboutHub');
            if (hub) hub.classList.add('active');
        }
        function closeAboutHub() {
            const hub = document.getElementById('aboutHub');
            if (hub) hub.classList.remove('active');
        }

        // ESC закрывает хабы (на десктопе)
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeSettingsHub();
                closeAboutHub();
            }
        });

        // ============================================
        // VIDEO CALLS (старт + входящие)
        // ============================================
        let _incomingCall = null;

        // Координация звонков между вкладками одного браузера
        const _callTabChannel = (typeof BroadcastChannel !== 'undefined')
            ? new BroadcastChannel('crane_calls') : null;
        if (_callTabChannel) {
            _callTabChannel.onmessage = (e) => {
                if (!e.data) return;
                if (e.data.type === 'call_tab_handled' && _incomingCall && _incomingCall.roomId === e.data.roomId) {
                    try { _stopRingtone(); } catch(_) {}
                    _hideIncomingCallBanner();
                    _incomingCall = null;
                }
            };
        }

        function _genRoomId() { return 'rm_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

        let _activeCallRoomId = null;
        let _activeCallTitle = '';
        let _activeCallTitleKey = '';

        function _getActiveCallTitle() {
            if (_activeCallTitleKey === 'audioCall') return tr('audioCall', 'Аудиозвонок');
            if (_activeCallTitleKey === 'videoCall') return tr('videoCall', 'Видеозвонок');
            return _activeCallTitle || tr('activeCallTitle', 'Звонок активен');
        }

        function _renderActiveCallBar() {
            const bar = document.getElementById('activeCallBar');
            if (!bar) return;

            const titleEl = document.getElementById('activeCallBarTitle');
            const statusEl = bar.querySelector('.active-call-status');
            const returnBtn = bar.querySelector('.active-call-return');
            const endBtn = bar.querySelector('.active-call-end');

            if (titleEl) titleEl.textContent = _getActiveCallTitle();
            if (statusEl) statusEl.textContent = tr('callInProgress', 'Идёт звонок');
            if (returnBtn) returnBtn.textContent = tr('returnToCall', 'Вернуться');
            if (endBtn) endBtn.title = tr('endCall', 'Завершить звонок');
        }

        function _openCallWindow(roomId, type, title, kind) {
            const url = '../calls/call.html?room=' + encodeURIComponent(roomId)
                + '&type=' + encodeURIComponent(type || 'group')
                + '&kind=' + encodeURIComponent(kind || 'video')
                + (title ? '&title=' + encodeURIComponent(title) : '')
                + '&embedded=1';
            _activeCallRoomId = roomId;
            _activeCallTitleKey = title ? '' : (kind === 'audio' ? 'audioCall' : 'videoCall');
            _activeCallTitle = title || '';
            document.getElementById('callFrame').src = url;
            _showCallPanel();
        }

        function _showCallPanel() {
            const _panel = document.getElementById('callPanel');
            _panel.classList.remove('minimized');
            _panel.style.display = 'flex';
            document.getElementById('activeCallBar').style.display = 'none';
            document.getElementById('noChat').style.display = 'none';
            const chatView = document.getElementById('chatView');
            chatView.classList.remove('active');
            document.body.classList.remove('chat-open');
            document.body.classList.add('call-open');
        }

        function _hideCallPanel() {
            document.body.classList.remove('call-open');
            const _panel = document.getElementById('callPanel');
            _panel.style.display = 'flex'; // iframe должен продолжать работать
            _panel.classList.add('minimized');
            if (_activeCallRoomId) {
                const bar = document.getElementById('activeCallBar');
                _renderActiveCallBar();
                bar.style.display = 'flex';
            }
            // Восстанавливаем предыдущий вид
            if (typeof activeChat !== 'undefined' && activeChat) {
                document.getElementById('chatView').classList.add('active');
                document.body.classList.add('chat-open');
            } else {
                document.getElementById('noChat').style.display = '';
            }
        }

        function _endCall(fromBar) {
            document.body.classList.remove('call-open');
            if (fromBar) {
                // Команда завершить — передаём в iframe
                try { document.getElementById('callFrame').contentWindow.postMessage({ type: 'crane_hangup' }, '*'); } catch(_) {}
            }
            _activeCallRoomId = null;
            _activeCallTitle = '';
            _activeCallTitleKey = '';
            const _panel = document.getElementById('callPanel');
            _panel.classList.remove('minimized');
            _panel.style.display = 'none';
            document.getElementById('callFrame').src = '';
            document.getElementById('activeCallBar').style.display = 'none';
            if (typeof activeChat !== 'undefined' && activeChat) {
                document.getElementById('chatView').classList.add('active');
                document.body.classList.add('chat-open');
            } else {
                document.getElementById('noChat').style.display = '';
            }
        }

        // Сообщения от iframe (call.html)
        window.addEventListener('message', (e) => {
            if (!e.data || typeof e.data !== 'object') return;
            if (e.data.type === 'crane_call_ended') _endCall(false);
            if (e.data.type === 'crane_call_minimize') _hideCallPanel();
            if (e.data.type === 'crane_add_peer') {
                _hideCallPanel();
                try { showToast && showToast('info', tr('chooseChatAndCall', 'Выберите чат и нажмите кнопку звонка')); } catch(_) {}
            }
        });

        async function _createCallRoom(type, chatId, title) {
            try {
                const token = localStorage.getItem('craneapp_auth_token');
                const res = await fetch('/api/v1/calls/rooms', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, chatId, title })
                });
                if (!res.ok) throw new Error('Failed');
                const data = await res.json();
                return data.room.id;
            } catch (e) {
                // Фолбэк — клиентский ID, /calls/call.html сам создаст комнату
                return _genRoomId();
            }
        }

        async function _startCallFromChat(kind) {
            if (!activeChat) { try { showToast && showToast('info','Выберите чат'); } catch(_){} return; }

            // Если уже идёт звонок — приглашаем собеседника присоединиться к нему
            if (_activeCallRoomId) {
                if (activeChat.type === 'group') {
                    try { showToast && showToast('info', tr('groupAddUnsupported', 'Групповое добавление из меню чата пока не поддерживается')); } catch(_){}
                    return;
                }
                const peerId = chatUsers[activeChat.id]?.id;
                if (!peerId || peerId === user.id) {
                    try { showToast && showToast('info', tr('peerNotFound', 'Не удалось найти собеседника')); } catch(_){}
                    return;
                }
                try {
                    const ws = window.craneWs || window.ws;
                    if (ws && ws.readyState === 1) {
                        ws.send(JSON.stringify({
                            type: 'call_invite', to: peerId, roomId: _activeCallRoomId,
                            callType: 'group', kind,
                            fromName: user.firstName || user.username, fromAvatar: user.avatarUrl || null,
                            title: _activeCallTitle
                        }));
                        try { showToast && showToast('success', tr('inviteSent', 'Приглашение отправлено')); } catch(_){}
                    }
                } catch(_) {}
                _showCallPanel();
                return;
            }

            const _callBtn = document.getElementById(kind === 'audio' ? 'audioCallBtn' : 'videoCallBtn');
            const isGroup = activeChat.type === 'group';
            const kindLabel = kind === 'audio' ? tr('audioCall', 'Аудиозвонок') : tr('videoCall', 'Видеозвонок');
            const title = activeChat.name || (isGroup ? tr('groupCall', 'Групповой звонок') : kindLabel);
            const roomId = await _createCallRoom(isGroup ? 'group' : 'p2p', activeChat.id, title);
            try {
                const ws = window.craneWs || window.ws;
                if (ws && ws.readyState === 1) {
                    // Для личного чата берём ID собеседника из chatUsers
                    let targets = [];
                    if (!isGroup) {
                        const peerId = chatUsers[activeChat.id]?.id;
                        if (peerId && peerId !== user.id) targets = [peerId];
                    } else {
                        // Для группы — запрашиваем участников через API
                        try {
                            const token = localStorage.getItem('craneapp_auth_token');
                            const r = await fetch('/api/v1/chats/' + activeChat.id + '/members', {
                                headers: { 'Authorization': 'Bearer ' + token }
                            });
                            if (r.ok) {
                                const d = await r.json();
                                targets = (d.members || []).map(m => m.id || m.userId).filter(id => id && id !== user.id);
                            }
                        } catch(_) {}
                    }
                    if (targets.length === 0) {
                        try { showToast('Не удалось найти собеседника'); } catch(_){}
                    }
                    const invitePayloads = targets.map(to => ({
                        type: 'call_invite', to, roomId,
                        kind, fromName: user.firstName || user.username, fromAvatar: user.avatarUrl || null,
                        title
                    }));
                    // Отправляем сразу, потом повторяем 2 раза с интервалом 3 сек
                    // (защита от zombie-соединений на мобильных сетях)
                    function sendInvites() {
                        const w = window.craneWs || window.ws;
                        if (w && w.readyState === WebSocket.OPEN) {
                            invitePayloads.forEach(p => w.send(JSON.stringify(p)));
                        }
                    }
                    sendInvites();
                    const retryInvite1 = setTimeout(sendInvites, 3000);
                    const retryInvite2 = setTimeout(sendInvites, 6000);
                    // Отменяем повторы если собеседник ответил
                    const cancelRetry = () => { clearTimeout(retryInvite1); clearTimeout(retryInvite2); };
                    window._cancelCallInviteRetry = cancelRetry;
                }
            } catch (_) {}
            _openCallWindow(roomId, isGroup ? 'group' : 'p2p', title, kind);
        }

        function startVideoCallFromChat() { return _startCallFromChat('video'); }
        function startAudioCallFromChat() { return _startCallFromChat('audio'); }

        // Рингтон через WebAudio (имитация классического звонка) + вибрация
        let _ringtoneCtx = null, _ringtoneTimer = null, _vibrateTimer = null;
        function _startRingtone(){
            _stopRingtone();
            try {
                _ringtoneCtx = new (window.AudioContext || window.webkitAudioContext)();
                const ctx = _ringtoneCtx;
                // Классическая двухтоновая мелодия звонка (пара звуковых импульсов, потом пауза)
                const ring = () => {
                    if (!_ringtoneCtx) return;
                    const t0 = ctx.currentTime;
                    [0, 0.5].forEach(off => {
                        const o1 = ctx.createOscillator();
                        const g1 = ctx.createGain();
                        o1.type = 'sine';
                        o1.frequency.value = 440;
                        g1.gain.setValueAtTime(0, t0 + off);
                        g1.gain.linearRampToValueAtTime(0.55, t0 + off + 0.04);
                        g1.gain.setValueAtTime(0.55, t0 + off + 0.32);
                        g1.gain.linearRampToValueAtTime(0, t0 + off + 0.40);
                        const o2 = ctx.createOscillator();
                        const g2 = ctx.createGain();
                        o2.type = 'sine';
                        o2.frequency.value = 480;
                        g2.gain.setValueAtTime(0, t0 + off);
                        g2.gain.linearRampToValueAtTime(0.45, t0 + off + 0.04);
                        g2.gain.setValueAtTime(0.45, t0 + off + 0.32);
                        g2.gain.linearRampToValueAtTime(0, t0 + off + 0.40);
                        o1.connect(g1).connect(ctx.destination);
                        o2.connect(g2).connect(ctx.destination);
                        o1.start(t0 + off); o1.stop(t0 + off + 0.42);
                        o2.start(t0 + off); o2.stop(t0 + off + 0.42);
                    });
                };
                ring();
                _ringtoneTimer = setInterval(ring, 2000);
                // Вибрация на мобильных — паттерн как у звонка
                if (navigator.vibrate) {
                    const vibrate = () => navigator.vibrate([400, 200, 400, 1000]);
                    vibrate();
                    _vibrateTimer = setInterval(vibrate, 2000);
                }
            } catch(_){}
        }
        function _stopRingtone(){
            if (_ringtoneTimer) { clearInterval(_ringtoneTimer); _ringtoneTimer = null; }
            if (_vibrateTimer) { clearInterval(_vibrateTimer); _vibrateTimer = null; }
            if (navigator.vibrate) { try { navigator.vibrate(0); } catch(_){} }
            if (_ringtoneCtx) { try { _ringtoneCtx.close(); } catch(_){} _ringtoneCtx = null; }
        }

        function _showIncomingCall(payload) {
            if (_incomingCall && _incomingCall.roomId === payload.roomId) return;
            _incomingCall = payload;
            const banner = document.getElementById('incomingCallBanner');
            const nameEl = document.getElementById('incomingName');
            const avEl = document.getElementById('incomingAvatar');
            const kindLabel = document.getElementById('incomingKindLabel');
            const kindIcon = document.getElementById('incomingKindIcon');
            if (!banner) return;
            nameEl.textContent = payload.fromName || payload.title || tr('unknownUser', 'Неизвестный');
            const initial = (payload.fromName || '?').charAt(0).toUpperCase();
            avEl.innerHTML = payload.fromAvatar
                ? '<img src="'+payload.fromAvatar+'" alt="">'
                : initial;
            const isAudio = payload.kind === 'audio';
        kindLabel.textContent = isAudio ? tr('audioCall', 'Аудиозвонок') : tr('videoCall', 'Видеозвонок');
            kindIcon.innerHTML = isAudio
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
            banner.classList.add('show');
            try { _startRingtone(); } catch(_){}
            // Авто-скрытие через 35 сек
            clearTimeout(_showIncomingCall._t);
            _showIncomingCall._t = setTimeout(() => rejectIncomingCall(), 35000);
        }

        function _hideIncomingCallBanner(){
            const banner = document.getElementById('incomingCallBanner');
            if (banner) banner.classList.remove('show');
            clearTimeout(_showIncomingCall._t);
        }

        function acceptIncomingCall() {
            if (!_incomingCall) return;
            const c = _incomingCall;
            try {
                const ws = window.craneWs || window.ws;
                if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({ type:'call_invite_response', to: c.from, roomId: c.roomId, accepted: true }));
                }
            } catch(_){}
            try { _stopRingtone(); } catch(_){}
            _hideIncomingCallBanner();
            // Сообщаем другим вкладкам — они прекратят звонить
            try { _callTabChannel && _callTabChannel.postMessage({ type: 'call_tab_handled', roomId: c.roomId }); } catch(_) {}
            const kind = (c.kind === 'audio') ? 'audio' : 'video';
            const callType = c.callType || 'p2p';
            _openCallWindow(c.roomId, callType, c.title || c.fromName || (kind === 'audio' ? tr('audioCall', 'Аудиозвонок') : tr('videoCall', 'Видеозвонок')), kind);
            _incomingCall = null;
        }

        function rejectIncomingCall() {
            try { _stopRingtone(); } catch(_){}
            if (!_incomingCall) { _hideIncomingCallBanner(); return; }
            const c = _incomingCall;
            try {
                const ws = window.craneWs || window.ws;
                if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({ type:'call_invite_response', to: c.from, roomId: c.roomId, accepted: false }));
                }
            } catch(_){}
            // Сообщаем другим вкладкам — они прекратят звонить
            try { _callTabChannel && _callTabChannel.postMessage({ type: 'call_tab_handled', roomId: c.roomId }); } catch(_) {}
            _hideIncomingCallBanner();
            _incomingCall = null;
        }

        async function startInstantMeeting() {
            const title = 'Встреча — ' + (user.firstName || user.username || 'CraneApp');
            const roomId = await _createCallRoom('group', null, title);
            _openCallWindow(roomId, 'group', title);
        }
        function joinMeetingByLink() {
            const url = prompt('Вставьте ссылку или ID комнаты:');
            if (!url) return;
            let roomId = url.trim();
            try {
                if (roomId.includes('?')) {
                    const u = new URL(roomId, location.origin);
                    roomId = u.searchParams.get('room') || roomId;
                }
            } catch(_) {}
            if (!roomId) return;
            _openCallWindow(roomId, 'group', 'Встреча');
        }

        // Глобальный перехват входящих звонков из WebSocket
        // (вешается после инициализации основного WS-клиента)
        window.__handleIncomingCallMessage = function(msg) {
            if (msg && msg.type === 'call_incoming') {
                _showIncomingCall(msg);
                return true;
            }
            return false;
        };

        // ============================================
        // SECTION TABS (ЛС / Чаты / Каналы / Сообщества / Встречи)
        // ============================================
        let currentSection = 'dms';
        function switchSection(section) {
            currentSection = section;
            document.querySelectorAll('.rail-tab').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === section);
            });
            // Заголовок sidebar
            const titleEl = document.querySelector('.sidebar .top-header .top-title');
            if (titleEl) {
                const titles = {
                    dms: tr('privateMessages', 'Личные сообщения'),
                    chats: tr('chats', 'Чаты'),
                    channels: tr('channels', 'Каналы'),
                    communities: tr('communities', 'Сообщества'),
                    meetings: tr('meetings', 'Встречи')
                };
                titleEl.textContent = titles[section] || tr('chats', 'Чаты');
            }
            applySectionFilter(section);
        }

        function applySectionFilter(section) {
            const list = document.getElementById('chatList');
            if (!list) return;

            // Заглушка для нереализованных разделов
            let placeholder = document.getElementById('sectionPlaceholder');
            if (!placeholder) {
                placeholder = document.createElement('div');
                placeholder.id = 'sectionPlaceholder';
                placeholder.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;text-align:center;color:var(--rd-text-2,rgba(235,235,245,0.72));font-family:var(--font-geologica,sans-serif);';
            }

            const showPlaceholder = (icon, title, subtitle) => {
                placeholder.innerHTML =
                    '<div style="width:72px;height:72px;border-radius:20px;background:var(--rd-bg-elev,rgba(28,28,32,0.72));border:1px solid var(--rd-stroke,rgba(255,255,255,0.08));display:flex;align-items:center;justify-content:center;margin-bottom:16px;">' + icon + '</div>' +
                    '<div style="font-size:17px;font-weight:700;color:var(--rd-text,#fff);letter-spacing:-0.01em;margin-bottom:6px;">' + title + '</div>' +
                    '<div style="font-size:13px;color:var(--rd-text-3,rgba(235,235,245,0.46));max-width:260px;line-height:1.45;">' + subtitle + '</div>';
                Array.from(list.children).forEach(ch => {
                    if (ch.id !== 'sectionPlaceholder') ch.style.display = 'none';
                });
                if (!placeholder.parentElement) list.appendChild(placeholder);
                placeholder.style.display = 'flex';
            };

            const restoreList = () => {
                if (placeholder.parentElement) placeholder.style.display = 'none';
                Array.from(list.children).forEach(ch => {
                    if (ch.id !== 'sectionPlaceholder') ch.style.display = '';
                });
            };

            const dmIcon = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
            const groupIcon = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
            const channelIcon = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-8v18l-18-8z"/></svg>';
            const commIcon = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18z"/></svg>';
            const meetIcon = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';

            if (section === 'channels') {
                showPlaceholder(channelIcon, 'Каналы', 'Раздел в разработке. Скоро вы сможете создавать каналы и подписываться на них.');
            } else if (section === 'communities') {
                showPlaceholder(commIcon, 'Сообщества', 'Раздел в разработке. Скоро вы сможете объединять чаты и каналы в сообщества.');
            } else if (section === 'meetings') {
                Array.from(list.children).forEach(ch => {
                    if (ch.id !== 'sectionPlaceholder') ch.style.display = 'none';
                });
                if (!placeholder.parentElement) list.appendChild(placeholder);
                placeholder.style.display = 'flex';
                placeholder.innerHTML =
                    '<div style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,#9b82ff,#5a8bff);display:flex;align-items:center;justify-content:center;margin-bottom:18px;box-shadow:0 14px 36px rgba(90,139,255,0.36);">' + meetIcon + '</div>' +
                    '<div style="font-size:18px;font-weight:700;color:var(--rd-text,#fff);letter-spacing:-0.01em;margin-bottom:6px;">Встречи</div>' +
                    '<div style="font-size:13px;color:var(--rd-text-3,rgba(235,235,245,0.46));max-width:280px;line-height:1.45;margin-bottom:18px;">Создайте видеовстречу и пригласите участников по ссылке. До 5 человек.</div>' +
                    '<button onclick="startInstantMeeting()" style="height:46px;padding:0 24px;border-radius:12px;border:none;background:linear-gradient(135deg,#9b82ff,#5a8bff);color:#fff;font-family:Geologica,sans-serif;font-weight:600;font-size:14px;letter-spacing:-0.01em;cursor:pointer;box-shadow:0 12px 28px rgba(90,139,255,0.32);">+ Начать встречу</button>' +
                    '<button onclick="joinMeetingByLink()" style="margin-top:10px;height:42px;padding:0 22px;border-radius:12px;border:1px solid var(--rd-stroke,rgba(255,255,255,0.1));background:transparent;color:var(--rd-text,#fff);font-family:Geologica,sans-serif;font-weight:500;font-size:13.5px;cursor:pointer;">Войти по ссылке…</button>';
            } else {
                // dms / chats — фильтруем уже отрендеренные элементы списка
                restoreList();
                const items = list.querySelectorAll('.chat-item');
                items.forEach(it => {
                    const type = (it.dataset.chatType || 'private').toLowerCase();
                    const isPrivate = type === 'private' || type === 'dm' || type === 'personal';
                    if (section === 'dms') it.style.display = isPrivate ? '' : 'none';
                    else if (section === 'chats') it.style.display = isPrivate ? 'none' : '';
                });
                if (items.length === 0) {
                    showPlaceholder(section === 'dms' ? dmIcon : groupIcon,
                        section === 'dms' ? tr('directMessagesEmpty', 'Личных сообщений пока нет') : tr('groupChatsEmpty', 'Групповых чатов пока нет'),
                        'Создайте новый чат, нажав «+» в правом верхнем углу.');
                }
            }
        }

        // Применяем фильтр после загрузки списка
        const _origObserverTarget = document.getElementById('chatList');
        if (_origObserverTarget) {
            const _mo = new MutationObserver(() => applySectionFilter(currentSection));
            _mo.observe(_origObserverTarget, { childList: true, subtree: false });
        }

        function updateSideMenuProfile() {
            const nameEl = document.getElementById('sideMenuName');
            const usernameEl = document.getElementById('sideMenuUsername');
            const avatarEl = document.getElementById('sideMenuAvatar');
            
            nameEl.textContent = user.firstName || tr('user', 'Пользователь');
            usernameEl.textContent = user.username ? '@' + user.username : '@username';

            // Badge + Premium
            const badgesHtml = renderBadges(user.badges || [], user.isBot, user.isPremium, user.isFake, user.isScam);
            if (badgesHtml) {
                nameEl.innerHTML = (user.firstName || tr('user', 'Пользователь')) + badgesHtml;
            } else {
                nameEl.textContent = user.firstName || tr('user', 'Пользователь');
            }            
            if (user.avatarUrl && (user.avatarUrl.startsWith('data:image') || user.avatarUrl.startsWith('http') || user.avatarUrl.startsWith('/'))) {
                avatarEl.innerHTML = '<img src="' + user.avatarUrl + '" alt="">';
            } else {
                avatarEl.innerHTML = '<span>' + (user.firstName || '👤')[0].toUpperCase() + '</span>';
            }
        }
            
        function logout() {
            closeSideMenu();
            if (confirm(window.i18n?.t('logoutConfirm') || 'Выйти из аккаунта?')) {
                localStorage.removeItem('craneapp_auth_token');
                localStorage.removeItem('craneapp_user_data');
                openTwoFactorModal();
            }
        }

        function openTwoFactorModal() {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 99999;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
            `;
            
            const iframe = document.createElement('iframe');
            iframe.src = '../auth/twoFactorModal.html';
            iframe.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 400px;
                height: 600px;
                max-width: 90vw;
                max-height: 90vh;
                border: none;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            `;
            
            modal.appendChild(iframe);
            document.body.appendChild(modal);
            
            // Обработка сообщений из iframe
            window.addEventListener('message', function handleModalMessage(event) {
                if (event.data.type === 'auth-success') {
                    localStorage.setItem('craneapp_auth_token', event.data.token);
                    modal.remove();
                    window.removeEventListener('message', handleModalMessage);
                    // Перезагружаем страницу для обновления состояния
                    window.location.reload();
                } else if (event.data.type === 'auth-cancelled') {
                    modal.remove();
                    window.removeEventListener('message', handleModalMessage);
                }
            });
            
            // Закрытие по клику на фон
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.remove();
                    window.removeEventListener('message', handleModalMessage);
                }
            });
        }

        // ============================================
        // MODALS
        // ============================================
        function openSearchModal() {
            document.getElementById('searchModal').classList.add('active');
            setTimeout(() => document.getElementById('modalSearchInput').focus(), 100);
        }

               function closeSearchModal() {
            document.getElementById('searchModal').classList.remove('active');
            document.getElementById('modalSearchInput').value = '';
            document.getElementById('modalResults').innerHTML = '<div class="modal-empty"><div class="modal-empty-icon">👥</div><div>' + tr('writeUsernameForSearch', 'Введите юзернейм для поиска') + '</div></div>';
            document.getElementById('modalStatus').classList.remove('visible');
        }

        function openCreateModal() {
            document.getElementById('createModal').classList.add('active');
        }

        function closeCreateModal() {
            document.getElementById('createModal').classList.remove('active');
        }

        document.getElementById('searchModal').addEventListener('click', function(e) { 
            if (e.target.id === 'searchModal') closeSearchModal(); 
        });
        
        document.getElementById('createModal').addEventListener('click', function(e) { 
            if (e.target.id === 'createModal') closeCreateModal(); 
        });

        // ============================================
        // USER PROFILE MODAL (Telegram-style)
        // ============================================
        function toggleProfileMenu() {
            const menu = document.getElementById('profileMenu');
            menu.classList.toggle('active');
        }
        
        function switchProfileTab(tab) {
            // Убираем active у всех табов
            document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.profile-tab-pane').forEach(p => p.classList.remove('active'));
            
            // Добавляем active нужному табу
            document.querySelector(`.profile-tab[data-tab="${tab}"]`).classList.add('active');
            document.getElementById(`tab-${tab}`).classList.add('active');
        }
        
        // Текущий пользователь профиля
        let currentProfileUser = null;

        function toggleProfileNotifications() {
            const checkbox = document.getElementById('profileNotifications');
            if (!currentProfileUser) return;
            
            // Сохраняем в localStorage
            const notifications = JSON.parse(localStorage.getItem('chatNotifications') || '{}');
            notifications[currentProfileUser.id] = checkbox.checked;
            localStorage.setItem('chatNotifications', JSON.stringify(notifications));
            
            showToast('success', checkbox.checked ? (window.i18n?.t('notificationsOn') || 'Уведомления включены') : (window.i18n?.t('notificationsOff') || 'Уведомления отключены'), '🔔');
        }
        
        function reportUser() {
            toggleProfileMenu();
            if (!currentProfileUser) return;
            
            // Открываем модальное окно с формой жалобы
            document.getElementById('reportReason').value = 'spam';
            document.getElementById('reportDescription').value = '';
            document.getElementById('reportModal').classList.add('active');
        }
        
        function closeReportModal() {
            document.getElementById('reportModal').classList.remove('active');
        }
        
        async function submitReport() {
            if (!currentProfileUser) return;
            
            const reason = document.getElementById('reportReason').value;
            const description = document.getElementById('reportDescription').value;
            
            if (!reason) {
                showToast('error', tr('chooseReason', 'Выберите причину'), '❌');
                return;
            }
            
            try {
                const res = await fetch('/api/v1/reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ 
                        reportedUserId: currentProfileUser.id,
                        reason,
                        description
                    })
                });
                
                if (res.ok) {
                    showToast('success', tr('reportSent', 'Жалоба отправлена'), '📮');
                    closeReportModal();
                } else {
                    showToast('error', tr('sendError', 'Ошибка отправки'), '❌');
                }
            } catch (err) {
                showToast('error', tr('networkError', 'Ошибка сети'), '❌');
            }
        }
        
        function copyProfileUsername() {
            if (!currentProfileUser) return;
            const username = currentProfileUser.username || '';
            if (!username) {
                showToast('error', tr('noUsername', 'Нет юзернейма'), '❌');
                return;
            }
            navigator.clipboard.writeText('@' + username).then(() => {
                showToast('success', tr('usernameCopied', 'Юзернейм скопирован'), '📋');
            }).catch(() => {
                showToast('error', tr('copyError', 'Ошибка копирования'), '❌');
            });
        }
        
        async function openQrCodeModal() {
            if (!currentProfileUser) return;
            if (currentProfileUser.isBlocked) {
                showToast('error', tr('blockedQrError', 'Нельзя открыть QR-код заблокированного пользователя'), '❌');
                return;
            }
            const username = currentProfileUser.username || '';
            if (!username) {
                showToast('error', tr('noUsername', 'Нет юзернейма'), '❌');
                return;
            }
            
            const modal = document.getElementById('qrCodeModal');
            const qrImage = document.getElementById('qrCodeImage');
            const qrUsername = document.getElementById('qrCodeUsername');
            
            qrUsername.textContent = '@' + username;
            qrImage.innerHTML = '<div style="width: 200px; height: 200px; background: var(--bg-tertiary); border-radius: 12px; display: flex; align-items: center; justify-content: center;"><span style="color: var(--text-muted);">' + tr('loading', 'Загрузка...') + '</span></div>';
            modal.classList.add('active');
            
            try {
                // Генерируем QR-код через API
                const res = await fetch('/api/v1/users/qr-code?username=' + encodeURIComponent(username), {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                
                if (data.qrCode) {
                    qrImage.innerHTML = `<img src="${data.qrCode}" style="width: 200px; height: 200px; border-radius: 12px;">`;
                } else {
                    qrImage.innerHTML = '<div style="width: 200px; height: 200px; background: var(--bg-tertiary); border-radius: 12px; display: flex; align-items: center; justify-content: center;"><span style="color: var(--text-muted);">' + tr('error', 'Ошибка') + '</span></div>';
                }
            } catch (err) {
                qrImage.innerHTML = '<div style="width: 200px; height: 200px; background: var(--bg-tertiary); border-radius: 12px; display: flex; align-items: center; justify-content: center;"><span style="color: var(--text-muted);">' + tr('networkError', 'Ошибка сети') + '</span></div>';
            }
        }
        
        function closeQrCodeModal() {
            document.getElementById('qrCodeModal').classList.remove('active');
        }
        
        async function archiveUser() {
            toggleProfileMenu();
            if (!currentProfileUser) return;
            
            // Ищем чат с пользователем
            const chatWithUser = allChats.find(c => {
                const cu = chatUsers[c.id];
                return cu && cu.id === currentProfileUser.id;
            });
            
            if (!chatWithUser) {
                showToast('error', tr('chatNotFound', 'Чат не найден'), '❌');
                return;
            }
            
            // Архивируем через API
            try {
                const res = await fetch(`/api/v1/chats/${chatWithUser.id}/archive`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (res.ok) {
                    showToast('success', tr('chatArchived', 'Чат архивирован'), '📁');
                    await loadArchivedChats();
                    loadChats();
                } else {
                    showToast('error', tr('archiveError', 'Ошибка архивирования'), '❌');
                }
            } catch (err) {
                showToast('error', tr('networkError', 'Ошибка сети'), '❌');
            }
        }
        
        // Переменная для хранения данных при добавлении в папку
        let folderSelectChatId = null;
        let folderSelectData = [];

        async function addToFolder() {
            toggleProfileMenu();
            if (!currentProfileUser) return;
            
            // Ищем чат с пользователем
            const chatWithUser = allChats.find(c => {
                const cu = chatUsers[c.id];
                return cu && cu.id === currentProfileUser.id;
            });
            
            if (!chatWithUser) {
                showToast('error', tr('chatNotFound', 'Чат не найден'), '❌');
                return;
            }
            
            folderSelectChatId = chatWithUser.id;
            await openFolderSelectModal();
        }

        async function openFolderSelectModal() {
            const modal = document.getElementById('folderSelectModal');
            const list = document.getElementById('folderSelectList');
            
            list.innerHTML = '<div class="folder-loading">' + tr('loadingFolders', 'Загрузка папок...') + '</div>';
            modal.classList.add('active');
            
            try {
                const res = await fetch('/api/v1/users/folders', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                folderSelectData = data.folders || [];
                
                if (folderSelectData.length === 0) {
                    list.innerHTML = '<div class="folder-empty">' + tr('noFoldersSettings', 'У вас нет папок.<br>Создайте их в настройках.') + '</div>';
                    return;
                }
                
                list.innerHTML = '';
                folderSelectData.forEach((folder, index) => {
                    const item = document.createElement('div');
                    item.className = 'folder-item';
                    item.onclick = () => selectFolder(index);
                    const isInFolder = folder.chats && folder.chats.includes(folderSelectChatId);
                    item.innerHTML = `
                        <div class="folder-item-icon">${folder.icon || '📂'}</div>
                        <div class="folder-item-info">
                            <div class="folder-item-name">${folder.name}</div>
                            <div class="folder-item-count">${folder.chats ? folder.chats.length : 0} чатов ${isInFolder ? '(уже в папке)' : ''}</div>
                        </div>
                        ${isInFolder ? '✓' : ''}
                    `;
                    list.appendChild(item);
                });
            } catch (err) {
                list.innerHTML = '<div class="folder-empty">' + tr('folderLoadError', 'Ошибка загрузки папок') + '</div>';
            }
        }

        async function selectFolder(index) {
            if (!folderSelectChatId || index < 0 || index >= folderSelectData.length) return;
            
            const folder = folderSelectData[index];
            if (!folder.chats) folder.chats = [];
            
            if (folder.chats.includes(folderSelectChatId)) {
                showToast('info', tr('chatAlreadyInFolder', 'Чат уже в этой папке'), '📂');
                closeFolderSelectModal();
                return;
            }
            
            folder.chats.push(folderSelectChatId);
            
            try {
                await fetch('/api/v1/users/folders', {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token 
                    },
                    body: JSON.stringify({ folders: folderSelectData })
                });
                
                showToast('success', `Чат добавлен в папку "${folder.name}"`, '📂');
                closeFolderSelectModal();
            } catch (err) {
                showToast('error', tr('saveError', 'Ошибка сохранения'), '❌');
            }
        }

        function closeFolderSelectModal() {
            document.getElementById('folderSelectModal').classList.remove('active');
            folderSelectChatId = null;
        }

        function createNewFolder() {
            closeFolderSelectModal();
            showToast('info', tr('folderCreateInSettings', 'Создание папок в настройках'), '📂');
        }
        
        // Загрузка данных для табов профиля
        function loadProfileMedia(userId) {
            const grid = document.getElementById('profileMediaGrid');
            grid.innerHTML = '';
            
            // Ищем медиа в сообщениях с этим пользователем
            const media = [];
            Object.values(messagesData).forEach(msg => {
                if ((msg.senderId === userId || msg.chatId === activeChat?.id) && 
                    (msg.type === 'image' || msg.type === 'photo' || msg.type === 'video')) {
                    media.push(msg);
                }
            });
            
            if (media.length === 0) {
                grid.innerHTML = '<div class="profile-empty">' + tr('noMediaFiles', 'Нет медиафайлов') + '</div>';
                return;
            }
            
            media.slice(0, 20).forEach(m => {
                const div = document.createElement('div');
                div.className = 'profile-media-item';
                if (m.mediaUrl || m.fileUrl) {
                    div.innerHTML = `<img src="${m.mediaUrl || m.fileUrl}" loading="lazy">`;
                    div.onclick = () => window.open(m.mediaUrl || m.fileUrl, '_blank');
                }
                grid.appendChild(div);
            });
        }
        
        function loadProfileFiles(userId) {
            const list = document.getElementById('profileFilesList');
            list.innerHTML = '';
            
            const files = Object.values(messagesData).filter(msg => 
                (msg.senderId === userId || msg.chatId === activeChat?.id) && 
                msg.type === 'file'
            );
            
            if (files.length === 0) {
                list.innerHTML = '<div class="profile-empty">' + tr('noFiles', 'Нет файлов') + '</div>';
                return;
            }
            
            files.slice(0, 20).forEach(f => {
                const div = document.createElement('div');
                div.className = 'profile-file-item';
                div.innerHTML = `
                    <div class="file-icon">📄</div>
                    <div class="file-info">
                        <div class="file-name">${f.fileName || tr('fileMedia', 'Файл')}</div>
                        <div class="file-size">${f.fileSize || ''}</div>
                    </div>
                `;
                if (f.fileUrl) {
                    div.onclick = () => window.open(f.fileUrl, '_blank');
                }
                list.appendChild(div);
            });
        }
        
        function loadProfileLinks(userId) {
            const list = document.getElementById('profileLinksList');
            list.innerHTML = '';
            
            const links = [];
            Object.values(messagesData).forEach(msg => {
                if (msg.senderId === userId || msg.chatId === activeChat?.id) {
                    const content = msg.content || msg.text || '';
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    const matches = content.match(urlRegex);
                    if (matches) links.push(...matches);
                }
            });
            
            if (links.length === 0) {
                list.innerHTML = '<div class="profile-empty">' + tr('noLinks', 'Нет ссылок') + '</div>';
                return;
            }
            
            [...new Set(links)].slice(0, 20).forEach(url => {
                const div = document.createElement('div');
                div.className = 'profile-link-item';
                div.innerHTML = `<div class="link-url">🔗 ${url.substring(0, 50)}${url.length > 50 ? '...' : ''}</div>`;
                div.onclick = () => window.open(url, '_blank');
                list.appendChild(div);
            });
        }
        
        function loadProfileGroups(userId) {
            const list = document.getElementById('profileGroupsList');
            list.innerHTML = '';
            
            // Ищем группы где есть оба пользователя
            const commonGroups = allChats.filter(c => {
                if (c.type !== 'group') return false;
                const members = c.members || [];
                return members.includes(userId) && members.includes(user?.id);
            });
            
            if (commonGroups.length === 0) {
                list.innerHTML = '<div class="profile-empty">' + tr('noCommonGroups', 'Нет общих групп') + '</div>';
                return;
            }
            
            commonGroups.forEach(g => {
                const div = document.createElement('div');
                div.className = 'profile-group-item';
                div.innerHTML = `
                    <div class="group-avatar">👥</div>
                    <div class="group-info">
                        <div class="group-name">${g.name}</div>
                        <div class="group-members">${g.members?.length || 0} участников</div>
                    </div>
                `;
                div.onclick = () => {
                    closeUserProfileModal();
                    openChat(g.id, g.name);
                };
                list.appendChild(div);
            });
        }
        
        function openUserProfileModal(userData) {
            const avatarEl = document.getElementById('profileAvatar');
            const nameEl = document.getElementById('profileName');
            const usernameEl = document.getElementById('profileUsername');
            const statusEl = document.getElementById('profileStatus');
            const bioLine = document.getElementById('profileBioLine');
            const chatBtn = document.getElementById('profileChatBtn');

            // Убираем старое описание и используем новое
            const bioEl = document.getElementById('profileBio');

            // Проверяем заблокирован ли пользователь
            const isBlocked = userData.isBlocked || false;

            // Аватарка пользователя
            if (isBlocked) {
                // SVG иконка призрака для заблокированных
                avatarEl.innerHTML = '<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18v-6a3 3 0 0 1 6 0v6"/><path d="M6 18a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v6z"/><path d="M12 2a5 5 0 0 0-5 5v2h10V7a5 5 0 0 0-5-5z"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="16" r="1"/></svg>';
            } else if (userData.username === 'craneapp_bot') {
                // Журавль для бота CraneApp
                avatarEl.innerHTML = '<img src="/logo.png" alt="">';
            } else if (userData.avatarUrl && (userData.avatarUrl.startsWith('data:image') || userData.avatarUrl.startsWith('http') || userData.avatarUrl.startsWith('/'))) {
                avatarEl.innerHTML = '<img src="' + userData.avatarUrl + '" alt="">';
            } else if (userData.isBot) {
                avatarEl.innerHTML = '<span style="font-size: 60px;">🤖</span>';
            } else {
                avatarEl.innerHTML = '<span>' + (userData.name || userData.username || '👤')[0].toUpperCase() + '</span>';
            }

            nameEl.textContent = isBlocked ? (window.i18n?.t('blockedAccount') || 'Заблокированный аккаунт') : (userData.name || window.i18n?.t('user') || 'Пользователь');
            usernameEl.textContent = isBlocked ? '' : ('@' + (userData.username || 'unknown'));
            statusEl.textContent = isBlocked ? (window.i18n?.t('accountBlocked') || 'Аккаунт заблокирован') : (userData.online ? (window.i18n?.t('online') || 'онлайн') : (userData.isBot ? (window.i18n?.t('bot') || 'бот') : (window.i18n?.t('lastSeenRecently') || 'был(а) недавно')));
            statusEl.style.color = isBlocked ? '#FF4B4B' : (userData.isBot ? 'var(--accent-color)' : (userData.online ? 'var(--success-color)' : 'var(--text-muted)'));
            
            // Описание (только если есть)
            if (bioLine) {
                bioLine.textContent = userData.bio || '';
                bioLine.style.display = userData.bio ? 'block' : 'none';
            }
            // Совместимость со старым кодом
            if (bioEl) {
                if (userData.bio) {
                    bioEl.innerHTML = userData.bio;
                    bioEl.style.display = 'block';
                } else {
                    bioEl.style.display = 'none';
                }
            }

            // Кнопка чата — только для других пользователей (не себя, не ботов, не заблокированных)
            if (chatBtn && userData.id && userData.id !== user.id && !userData.isBot && !isBlocked) {
                chatBtn.style.display = 'flex';
                // Проверяем есть ли уже чат с этим пользователем
                const existingChat = allChats.find(c => {
                    const cu = chatUsers[c.id];
                    return cu && cu.id === userData.id;
                });
            chatBtn.querySelector('span').textContent = existingChat ? (window.i18n?.t('goToChat') || 'Перейти в чат') : (window.i18n?.t('startChat') || 'Начать переписку');
                chatBtn.onclick = () => profileStartChat(userData.id, userData.name || userData.username, existingChat);
            } else if (chatBtn) {
                chatBtn.style.display = 'none';
            }

            // Кнопка копирования юзернейма — скрываем для заблокированных
            const copyBtn = document.querySelector('.profile-copy-btn');
            if (copyBtn) {
                copyBtn.style.display = isBlocked ? 'none' : 'flex';
            }

            // Кнопки действий для разработчиков — при просмотре активных жалоб или если пользователь замучен/забанен
            const adminActions = document.getElementById('profileAdminActions');
            const isDevUser = ['adm1','admin','admin1','qzlfee'].includes((user.username||'').toLowerCase());
            const isFromActiveReport = userData.fromReport && userData.reportStatus !== 'resolved';
            const isMuted = userData.isMuted || false;

            if (adminActions && isDevUser && userData.id && userData.id !== user.id && (isFromActiveReport || isMuted || isBlocked)) {
                adminActions.style.display = 'flex';

                // Показываем/скрываем кнопки в зависимости от статуса
                const muteBtn = document.getElementById('muteBtn');
                const unmuteBtn = document.getElementById('unmuteBtn');
                const blockBtn = document.getElementById('blockBtn');
                const unblockBtn = document.getElementById('unblockBtn');

                if (muteBtn && unmuteBtn) {
                    muteBtn.style.display = isMuted ? 'none' : 'flex';
                    unmuteBtn.style.display = isMuted ? 'flex' : 'none';
                }
                if (blockBtn && unblockBtn) {
                    blockBtn.style.display = isBlocked ? 'none' : 'flex';
                    unblockBtn.style.display = isBlocked ? 'flex' : 'none';
                }
            } else if (adminActions) {
                adminActions.style.display = 'none';
            }
            
            // Закрываем меню если открыто
            const menu = document.getElementById('profileMenu');
            if (menu) menu.classList.remove('active');
            
            // Сохраняем текущего пользователя профиля
            currentProfileUser = userData;
            
            // Загружаем настройку уведомлений
            const notifications = JSON.parse(localStorage.getItem('chatNotifications') || '{}');
            document.getElementById('profileNotifications').checked = notifications[userData.id] !== false;
            
            // Загружаем данные для табов
            loadProfileMedia(userData.id);
            loadProfileFiles(userData.id);
            loadProfileLinks(userData.id);
            loadProfileGroups(userData.id);
            
            // Показываем первый таб
            switchProfileTab('media');
            
            document.getElementById('userProfileModal').classList.add('active');
        }

        async function profileStartChat(userId, name, existingChat) {
            closeUserProfileModal();
            if (existingChat) {
                openChat(existingChat.id, existingChat.name);
                return;
            }
            try {
                const res = await fetch('/api/v1/chats/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ type: 'private', participants: [userId] })
                });
                const data = await res.json();
                if (data.chatId) {
                    await loadChats();
                    openChat(data.chatId, name);
                }
            } catch (e) {
                showToast('error', 'Ошибка', '❌');
            }
        }

        function closeUserProfileModal() {
            document.getElementById('userProfileModal').classList.remove('active');
        }

        function openChatUserProfile() {
            if (!activeChat) return;
            
            if (activeChat.type === 'group' || activeChat.type === 'channel') {
                openGroupInfoModal(activeChat.id);
                return;
            }

            const chatUser = chatUsers[activeChat.id];
            if (chatUser) {
                openUserProfileModal({
                    id: chatUser.id,
                    name: chatUser.name,
                    username: chatUser.username,
                    avatarUrl: chatUser.av,
                    bio: chatUser.bio || '',
                    online: chatUser.isOnline,
                    isBot: chatUser.isBot || false,
                    isBlocked: chatUser.isBlocked || false,
                    isMuted: chatUser.isMuted || false
                });
            } else {
                showToast('info', tr('userDataUnavailable', 'Данные пользователя недоступны'), '⚠️');
            }
        }

        async function openGroupInfoModal(chatId) {
            const chat = allChats.find(c => c.id === chatId);
            if (!chat) return;

            let members = [];
            try {
                const res = await fetch('/api/v1/chats/' + chatId + '/members', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    members = data.members || [];
                }
            } catch (_) {}

            const av = chat.avatarUrl && isImage(chat.avatarUrl)
                ? '<img src="' + chat.avatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
                : '<span style="font-size:32px;">' + (chat.name[0] || '💬') + '</span>';

            const membersHtml = members.map(m => {
                const mName = m.first_name || m.username || tr('user', 'Пользователь');
                const mAv = m.avatar_url && isImage(m.avatar_url)
                    ? '<img src="' + m.avatar_url + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
                    : '<span style="font-size:16px;font-weight:600;">' + mName[0].toUpperCase() + '</span>';
                const onlineDot = m.is_online && !m.is_bot ? '<span style="width:8px;height:8px;border-radius:50%;background:#00E676;display:inline-block;margin-left:6px;flex-shrink:0;"></span>' : '';
                const roleLabel = m.role === 'owner' ? '<span style="font-size:11px;color:var(--accent-color);margin-left:4px;">' + (window.i18n?.t('creator') || 'Создатель') + '</span>' : '';
                const isMe = m.id === user.id;
                const isBot = m.is_bot;
                const clickable = !isMe && !isBot;
                const clickAttr = clickable
                    ? `onclick="closeGroupInfoAndOpenProfile('${m.id}','${mName}','${m.username || ''}','${m.avatar_url || ''}',${!!m.is_online})"`
                    : '';
                return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-color);cursor:${clickable ? 'pointer' : 'default'};" ${clickAttr}>
                    <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#FF007F,#9D00FF);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;overflow:hidden;">${mAv}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:15px;font-weight:600;display:flex;align-items:center;flex-wrap:wrap;gap:2px;">${mName}${roleLabel}${onlineDot}</div>
                        <div style="font-size:13px;color:var(--text-muted);">@${m.username || ''}</div>
                    </div>
                </div>`;
            }).join('');

            let modal = document.getElementById('groupInfoModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'groupInfoModal';
                modal.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(4px);';
                modal.onclick = e => { if (e.target === modal) modal.remove(); };
                document.body.appendChild(modal);
            }

            modal.innerHTML = `
                <div style="background:var(--bg-secondary,#111);border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;animation:slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1);">
                    <div style="display:flex;align-items:center;justify-content:flex-end;padding:16px 20px 0;">
                        <button onclick="document.getElementById('groupInfoModal').remove()" style="background:rgba(255,255,255,0.08);border:none;color:var(--text-primary);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;">×</button>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;padding:8px 20px 20px;text-align:center;">
                        <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#FF007F,#9D00FF);display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;overflow:hidden;margin-bottom:12px;">${av}</div>
                        <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;">${chat.name}</div>
                        <div style="font-size:14px;color:var(--text-muted);margin-top:4px;">${members.length} ${pluralMembers(members.length)}</div>
                    </div>
                    <div style="margin:0 12px 20px;background:rgba(255,255,255,0.04);border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);">
                        <div style="padding:10px 16px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);">${tr('members', 'Участники')}</div>
                        ${membersHtml || '<div style="padding:16px;color:var(--text-muted);text-align:center;">' + tr('noMembers', 'Нет участников') + '</div>'}
                    </div>
                </div>`;
            modal.style.display = 'flex';
        }

        function closeGroupInfoAndOpenProfile(id, name, username, avatarUrl, isOnline) {
            const modal = document.getElementById('groupInfoModal');
            if (modal) modal.remove();
            openUserProfileModal({ id, name, username, avatarUrl, online: isOnline });
        }

        document.getElementById('userProfileModal').addEventListener('click', function(e) { 
            if (e.target.id === 'userProfileModal') closeUserProfileModal(); 
        });

        // ============================================
        // MEDIA PREVIEW
        // ============================================
        function openMediaPreview(url, type) {
            currentPreviewMediaUrl = url;
            const contentEl = document.getElementById('mediaPreviewContent');
            
            if (type === 'video') {
                contentEl.innerHTML = '<video src="' + url + '" controls autoplay style="max-width:100%;max-height:100%;border-radius:4px;"></video>';
            } else {
                contentEl.innerHTML = '<img src="' + url + '" alt="" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;user-select:none;" draggable="false">';
            }
            
            document.getElementById('mediaPreviewOverlay').classList.add('active');
        }

        function closeMediaPreview(event) {
            if (event && event.target !== document.getElementById('mediaPreviewOverlay')) return;
            const contentEl = document.getElementById('mediaPreviewContent');
            const video = contentEl.querySelector('video');
            if (video) video.pause();
            contentEl.innerHTML = '';
            document.getElementById('mediaPreviewOverlay').classList.remove('active');
            currentPreviewMediaUrl = null;
        }

        function downloadMedia() {
            if (!currentPreviewMediaUrl) return;
            const a = document.createElement('a');
            a.href = currentPreviewMediaUrl;
            a.download = 'media_' + Date.now();
            a.click();
            showToast('success', 'Загрузка началась', '📥');
        }

        function downloadCurrentMedia() {
            document.getElementById('messageContextMenu').classList.remove('active');
            const msg = messagesData[currentMessageId];
            if (!msg || !msg.mediaUrl) return;
            const a = document.createElement('a');
            a.href = msg.mediaUrl;
            a.download = 'photo_' + Date.now();
            a.click();
            showToast('success', tr('downloadStarted', 'Загрузка началась'), '📥');
        }

        async function copyMessagePhoto() {
            document.getElementById('messageContextMenu').classList.remove('active');
            const msg = messagesData[currentMessageId];
            if (!msg || !msg.mediaUrl) return;
            try {
                // Пробуем скопировать в буфер обмена как изображение
                const res = await fetch(msg.mediaUrl);
                const blob = await res.blob();
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                showToast('success', tr('photoCopied', 'Фото скопировано'), '📋');
            } catch (_) {
                // Fallback — копируем URL
                navigator.clipboard.writeText(msg.mediaUrl).catch(() => {});
                showToast('success', tr('linkCopied', 'Ссылка скопирована'), '📋');
            }
        }

        function copyMediaLink() {
            if (!currentPreviewMediaUrl) return;
            
            if (currentPreviewMediaUrl.startsWith('data:')) {
                showToast('success', tr('mediaCopiedBuffer', 'Медиа сохранено в буфер'), '📋');
            } else {
                navigator.clipboard.writeText(currentPreviewMediaUrl);
                showToast('success', tr('linkCopied', 'Ссылка скопирована'), '📋');
            }
        }

        // ============================================
        // ATTACHMENT PANEL (как в Telegram)
        // ============================================
        function toggleAttachmentPanel() {
            const panel = document.getElementById('attachmentPanel');
            const btn = document.getElementById('mediaBtn');
            
            if (panel.classList.contains('active')) {
                panel.classList.remove('active');
                btn.classList.remove('active');
            } else {
                // Закрываем другие панели
                closeEmojiPicker();
                closeMediaPanel();
                panel.classList.add('active');
                btn.classList.add('active');
            }
        }

        function closeAttachmentPanel() {
            document.getElementById('attachmentPanel').classList.remove('active');
            document.getElementById('mediaBtn').classList.remove('active');
        }

        function openFilePicker() {
            closeAttachmentPanel();
            document.getElementById('fileInput').click();
        }

        function shareLocation() {
            closeAttachmentPanel();
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const locationUrl = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
                        const locationText = tr('myLocationMessage', '📍 Моя геопозиция: {url}', { url: locationUrl });
                        sendMessage(locationText);
                    },
                    (err) => showToast('error', tr('geolocationError', 'Не удалось получить геопозицию'), '❌')
                );
            } else {
                showToast('error', tr('geolocationUnsupported', 'Геолокация не поддерживается'), '❌');
            }
        }

        function shareContact() {
            closeAttachmentPanel();
            // Открываем модал выбора контакта
            showContactPicker();
        }

        // ============================================
        // MEDIA PANEL
        // ============================================
        function toggleMediaPanel() {
            const panel = document.getElementById('mediaPanel');
            const overlay = document.getElementById('mediaPanelOverlay');
            const btn = document.getElementById('mediaBtn');
            
            if (panel.classList.contains('active')) {
                closeMediaPanel();
            } else {
                panel.classList.add('active');
                overlay.classList.add('active');
                btn.classList.add('active');
            }
        }

        function closeMediaPanel() {
            document.getElementById('mediaPanel').classList.remove('active');
            document.getElementById('mediaPanelOverlay').classList.remove('active');
            document.getElementById('mediaBtn').classList.remove('active');
        }

        function openCamera() {
            closeMediaPanel();
            document.getElementById('cameraInput').click();
        }

        function openGallery() {
            closeAttachmentPanel();
            document.getElementById('galleryInput').click();
        }


        function openStickerPicker() {
            closeMediaPanel();
            document.getElementById('stickerModal').classList.add('active');
            loadStickerPacks();
        }

        function closeStickerModal() {
            document.getElementById('stickerModal').classList.remove('active');
        }

        function openCreatePackModal() {
            document.getElementById('createPackModal').classList.add('active');
        }

        function closeCreatePackModal() {
            document.getElementById('createPackModal').classList.remove('active');
            document.getElementById('newPackName').value = '';
            document.getElementById('newPackDesc').value = '';
            document.getElementById('newPackIcon').innerHTML = '<span>🎨</span>';
            newPackIconData = null;
        }

        document.getElementById('stickerModal').addEventListener('click', function(e) {
            if (e.target.id === 'stickerModal') closeStickerModal();
        });
        
        document.getElementById('createPackModal').addEventListener('click', function(e) { 
            if (e.target.id === 'createPackModal') closeCreatePackModal(); 
        });

        // ============================================
        // FILE HANDLING
        // ============================================
        // FILE HANDLING
        // ============================================
        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
        let _pendingMediaDataUrl = null;
        let _pendingMediaType = null;

        function handleFileSelect(input) {
            const file = input.files[0];
            if (!file) return;
            input.value = '';

            if (file.size > MAX_FILE_SIZE) {
                showToast('error', tr('fileTooLarge50', 'Файл слишком большой. Максимум 50 МБ'), '❌');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                const dataUrl = e.target.result;
                const type = file.type.startsWith('video') ? 'video' : 'image';
                showMediaSendPreview(dataUrl, type);
            };
            reader.readAsDataURL(file);
        }

        function handleGifSelect(input) {
            const file = input.files[0];
            if (!file) return;
            input.value = '';

            if (file.size > MAX_FILE_SIZE) {
                showToast('error', 'Файл слишком большой. Максимум 50 МБ', '❌');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                uploadFile(e.target.result, 'gif').then(function(url) {
                    if (url) {
                        saveGif(url, file.name);
                        showToast('success', tr('gifAdded', 'GIF добавлен'), '✓');
                    } else {
                        showToast('error', tr('loadingError', 'Ошибка загрузки'), '❌');
                    }
                }).catch(function() {
                    showToast('error', tr('loadingError', 'Ошибка загрузки'), '❌');
                });
            };
            reader.readAsDataURL(file);
        }

        function showMediaSendPreview(dataUrl, type) {
            _pendingMediaDataUrl = dataUrl;
            _pendingMediaType = type;

            const content = document.getElementById('mediaSendPreviewContent');
            const caption = document.getElementById('mediaSendCaption');
            caption.innerText = '';

            if (type === 'video') {
                content.innerHTML = '<video src="' + dataUrl + '" controls style="max-width:100%;max-height:55vh;border-radius:12px;"></video>';
            } else {
                content.innerHTML = '<img src="' + dataUrl + '" style="max-width:100%;max-height:55vh;border-radius:12px;object-fit:contain;">';
            }

            const modal = document.getElementById('mediaSendPreview');
            modal.style.display = 'flex';
            setTimeout(() => caption.focus(), 100);

            // Закрыть по Escape
            function onEsc(e) {
                if (e.key === 'Escape') { cancelMediaSend(); document.removeEventListener('keydown', onEsc); }
            }
            document.addEventListener('keydown', onEsc);
        }

        function cancelMediaSend() {
            _pendingMediaDataUrl = null;
            _pendingMediaType = null;
            document.getElementById('mediaSendPreview').style.display = 'none';
        }

        function confirmMediaSend() {
            if (!_pendingMediaDataUrl || !_pendingMediaType) return;
            const dataUrl = _pendingMediaDataUrl;
            const type = _pendingMediaType;
            const caption = document.getElementById('mediaSendCaption').innerText.trim();
            document.getElementById('mediaSendPreview').style.display = 'none';
            _pendingMediaDataUrl = null;
            _pendingMediaType = null;

            if (type === 'gif') {
                saveGif(dataUrl);
                sendGifMessage(dataUrl, caption);
            } else {
                sendMediaMessage(dataUrl, type, caption);
            }
        }

        function handlePackIconSelect(input) {
            const file = input.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                newPackIconData = e.target.result;
                document.getElementById('newPackIcon').innerHTML = '<img src="' + newPackIconData + '" alt="">';
            };
            reader.readAsDataURL(file);
            input.value = '';
        }

        function handleStickerSelect(input) {
            const file = input.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                addStickerToCurrentPack(e.target.result);
            };
            reader.readAsDataURL(file);
            input.value = '';
        }

        // ============================================
        // SEND MEDIA MESSAGES
        // ============================================
        function sendMediaMessage(dataUrl, type, caption) {
            if (!activeChat) return;
            
            const tempId = 'temp-' + Date.now();
            const msg = {
                id: tempId,
                senderId: user.id,
                type: type,
                mediaUrl: dataUrl,
                content: caption || '',
                time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                senderName: user.firstName || 'Вы',
                pending: true
            };
            
            messagesData[tempId] = msg;
            (async () => {
                const el = await createMessageElement(msg);
                document.getElementById('messages').appendChild(el);
                scrollToBottom();
            })();
            
            uploadFile(dataUrl, type).then(function(url) {
                if (url) {
                    sendMediaToServer(url, type, tempId, caption);
                }
            });
        }

        function sendGifMessage(dataUrl, caption) {
            if (!activeChat) return;

            setTimeout(function() {
                var tempId = 'temp-' + Date.now();
                var msg = {
                    id: tempId,
                    senderId: user.id,
                    type: 'gif',
                    mediaUrl: dataUrl,
                    content: caption || '',
                    time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                    senderName: user.firstName || 'Вы',
                    pending: true
                };

                messagesData[tempId] = msg;
                document.getElementById('messages').appendChild(createMessageElement(msg));
                
                setTimeout(function() {
                    scrollToBottom();
                    sendMediaToServer(dataUrl, 'gif', tempId, caption);
                }, 100);
            }, 100);
        }

        function sendStickerMessage(stickerUrl) {
            if (!activeChat) return;
            
            closeStickerModal();
            
            const tempId = 'temp-' + Date.now();
            const msg = {
                id: tempId,
                senderId: user.id,
                type: 'sticker',
                mediaUrl: stickerUrl,
                time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                senderName: user.firstName || 'Вы',
                pending: true
            };
            
            messagesData[tempId] = msg;
            (async () => {
                const el = await createMessageElement(msg);
                document.getElementById('messages').appendChild(el);
                scrollToBottom();
            })();
            
            if (stickerUrl.startsWith('data:')) {
                uploadFile(stickerUrl, 'sticker').then(function(url) {
                    if (url) {
                        sendMediaToServer(url, 'sticker', tempId);
                    }
                });
            } else {
                sendMediaToServer(stickerUrl, 'sticker', tempId);
            }
        }

        async function uploadFile(dataUrl, type) {
            try {
                const res = await fetch('/api/v1/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ file: dataUrl, type: type })
                });
                const data = await res.json();
                return data.url;
            } catch (err) {
                console.error('Upload error:', err);
                showToast('error', tr('loadingError', 'Ошибка загрузки'), '❌');
                return null;
            }
        }

        function sendMediaToServer(mediaUrl, mediaType, tempId, caption) {
            if (!activeChat) return;

            fetch('/api/v1/messages/' + activeChat.id, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    content: caption || '',
                    type: mediaType,
                    mediaUrl: mediaUrl,
                    mediaType: mediaType
                })
            }).then(function(res) {
                return res.json();
            }).then(function(data) {
                if (data.message) {
                    _confirmMessage(tempId, data.message);
                }
            }).catch(function(err) {
                showToast('error', tr('sendError', 'Ошибка отправки'), '❌');
            });
        }

        // Подтвердить сообщение: убрать pending, заменить часы на галочку
        function _confirmMessage(tempId, serverMessage) {
            const tempEl = document.querySelector('[data-message-id="' + tempId + '"]');
            if (!tempEl) return;
            tempEl.dataset.messageId = serverMessage.id;
            tempEl.classList.remove('pending');
            const span = tempEl.querySelector('.msg-time span');
            if (span) {
                span.innerHTML = '<svg width="12" height="10" viewBox="0 0 12 10" fill="none" style="opacity:.7"><path d="M1 5l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            }
            delete messagesData[tempId];
            messagesData[serverMessage.id] = serverMessage;
        }

        async function createMessageElement(m) {
            const div = document.createElement('div');
            const isOutgoing = m.senderId === user.id || m.outgoing;
            const isBotMessage = m.senderUsername === 'craneapp_bot' || m.isBot === true;
            const isGroup = activeChat && activeChat.type === 'group';

            div.className = 'message ' + (isOutgoing ? 'outgoing' : 'incoming');
            if (m.pending) div.classList.add('pending');
            if (isBotMessage) div.classList.add('bot-message');
            div.dataset.messageId = m.id;

            div.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                // Читаем актуальный ID из dataset (он обновляется после отправки)
                const actualId = div.dataset.messageId || m.id;
                showMessageContextMenu(e, actualId, div, m.content || '', m.senderName || tr('user', 'Пользователь'));
            });

            let pressTimer;
            div.addEventListener('touchstart', function(e) {
                pressTimer = setTimeout(function() {
                    const actualId = div.dataset.messageId || m.id;
                    showMessageContextMenu(e.touches[0], actualId, div, m.content || '', m.senderName || tr('user', 'Пользователь'));
                }, 500);
            });
            div.addEventListener('touchend', function() { clearTimeout(pressTimer); });
            div.addEventListener('touchmove', function() { clearTimeout(pressTimer); });

            // ── Аватарка и имя отправителя в группах ──────────────────
            if (isGroup && !isOutgoing) {
                const senderName = m.senderFirstName || m.sender?.firstName || m.senderName || '';
                const senderIsBot = m.senderUsername === 'craneapp_bot' || m.isBot || m.sender?.isBot;
                const senderBadgeHtml = renderBadges(
                    m.senderBadges || (m.senderBadge ? [m.senderBadge] : []) || m.sender?.badges || [],
                    senderIsBot,
                    m.senderIsPremium || m.sender?.isPremium,
                    false, false
                );
                // Source avatar if provided, otherwise fallback to camera indicator if available
                const senderAv = m.senderAvatar
                    || m.sender?.avatarUrl
                    || m.sender?.avatar
                    || m.senderAvatarUrl
                    || m.avatarUrl
                    || '';
                const initial = senderName ? senderName[0].toUpperCase() : '';
                const camAvailable = typeof window.__CAMERA_HAS__ !== 'undefined' ? window.__CAMERA_HAS__ : false;
                // Для бота показываем 🤖, для остальных - аватарку или камеру/инициал
                const avatarContent = senderIsBot
                    ? '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:28px;">🤖</span>'
                    : senderAv
                        ? `<img src="${senderAv}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                        : camAvailable
                            ? '<span class="camera-icon" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%">📷</span>'
                            : (initial || '?');

                const wrapper = document.createElement('div');
                wrapper.className = 'msg-group-wrapper';
                wrapper.innerHTML = `
                    <div class="msg-sender-avatar">${avatarContent}</div>
                    <div class="msg-group-content">
                        <div class="msg-sender-name">${senderName}${senderBadgeHtml}</div>
                    </div>
                `;
                // Сообщение будет добавлено внутрь msg-group-content
                const contentDiv = wrapper.querySelector('.msg-group-content');
                // Переносим div внутрь wrapper
                div.classList.add('group-msg');
                contentDiv.appendChild(div);

                // Reply preview
                const replyData = m.replyToData || (m.replyToMessageId ? {
                    senderName: m.replyToSenderName || (messagesData[m.replyToMessageId] ? (messagesData[m.replyToMessageId].senderFirstName || messagesData[m.replyToMessageId].senderName || messagesData[m.replyToMessageId].sender?.firstName) : null) || tr('user', 'Пользователь'),
                    content: m.replyToContent || (messagesData[m.replyToMessageId] ? messagesData[m.replyToMessageId].content : '') || ''
                } : null);
                if (replyData) {
                    const rp = document.createElement('div');
                    rp.className = 'msg-reply-preview';
                    rp.innerHTML = `
                    <div class="msg-reply-header">
                        <svg class="msg-reply-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9 14 4 9 9 4"/>
                            <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
                        </svg>
                        <span class="msg-reply-label">Ответ</span>
                        <span class="msg-reply-sender">${replyData.senderName}</span>
                    </div>
                    <div class="msg-reply-text">${(replyData.content||'').substring(0,80)}</div>
                `;
                    rp.onclick = function(e) {
                        e.stopPropagation();
                        const rid = m.replyToMessageId || m.replyToData?.messageId;
                        if (rid) {
                            const t = document.querySelector('[data-message-id="'+rid+'"]');
                            if (t) { t.scrollIntoView({behavior:'smooth',block:'center'}); t.classList.add('highlight'); setTimeout(()=>t.classList.remove('highlight'),1500); }
                        }
                    };
                    div.insertBefore(rp, div.firstChild);
                }

                await addMessageContent(div, m);
                return wrapper;
            }

            // ── Reply preview (не группа) ──────────────────────────────
            const replyData = m.replyToData || (m.replyToMessageId ? {
                senderName: m.replyToSenderName || (messagesData[m.replyToMessageId] ? (messagesData[m.replyToMessageId].senderFirstName || messagesData[m.replyToMessageId].senderName || messagesData[m.replyToMessageId].sender?.firstName) : null) || tr('user', 'Пользователь'),
                content: m.replyToContent || (messagesData[m.replyToMessageId] ? messagesData[m.replyToMessageId].content : '') || ''
            } : null);
            if (replyData) {
                const rp = document.createElement('div');
                rp.className = 'msg-reply-preview';
                rp.innerHTML = `
                    <div class="msg-reply-header">
                        <svg class="msg-reply-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9 14 4 9 9 4"/>
                            <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
                        </svg>
                        <span class="msg-reply-label">Ответ</span>
                        <span class="msg-reply-sender">${replyData.senderName}</span>
                    </div>
                    <div class="msg-reply-text">${(replyData.content||'').substring(0,80)}</div>
                `;
                rp.onclick = function(e) {
                    e.stopPropagation();
                    const rid = m.replyToMessageId || m.replyToData?.messageId;
                    if (rid) {
                        const t = document.querySelector('[data-message-id="'+rid+'"]');
                        if (t) { t.scrollIntoView({behavior:'smooth',block:'center'}); t.classList.add('highlight'); setTimeout(()=>t.classList.remove('highlight'),1500); }
                    }
                };
                div.appendChild(rp);
            }

            addMessageContent(div, m);
            return div;
        }

        async function addMessageContent(div, m) {
            // Метка "Переслано от ..." — стиль как в Telegram
            if (m.forwardFrom) {
                const fwd = document.createElement('div');
                fwd.style.cssText = 'border-left:3px solid var(--accent-color);padding:4px 8px;margin-bottom:6px;border-radius:0 4px 4px 0;background:rgba(255,0,127,0.06);';
                fwd.innerHTML = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:1px;">Переслано от</div>'
                    + '<div style="font-size:13px;color:var(--accent-color);font-weight:600;">' + m.forwardFrom + '</div>';
                div.appendChild(fwd);
            }
            if (m.type === 'image' || m.type === 'photo') {
                div.classList.add('media-only');
                const img = document.createElement('img');
                img.className = 'message-media';
                img.src = m.mediaUrl;
                img.onclick = function() { openMediaPreview(m.mediaUrl, 'image'); };
                div.appendChild(img);
                if (m.content) {
                    div.classList.remove('media-only');
                    const cap = document.createElement('div');
                    cap.className = 'message-caption';
                    cap.textContent = m.content;
                    div.appendChild(cap);
                }
            } else if (m.type === 'video') {
                const video = document.createElement('video');
                video.className = 'message-media';
                video.src = m.mediaUrl;
                video.controls = true;
                video.onclick = function() { openMediaPreview(m.mediaUrl, 'video'); };
                div.appendChild(video);
                if (m.content) {
                    const cap = document.createElement('div');
                    cap.className = 'message-caption';
                    cap.textContent = m.content;
                    div.appendChild(cap);
                }
            } else if (m.type === 'gif') {
                div.classList.add('media-only');
                const img = document.createElement('img');
                img.className = 'message-gif';
                img.src = m.mediaUrl;
                img.onclick = function() { openMediaPreview(m.mediaUrl, 'gif'); };
                div.appendChild(img);
                if (m.content) {
                    div.classList.remove('media-only');
                    const cap = document.createElement('div');
                    cap.className = 'message-caption';
                    cap.textContent = m.content;
                    div.appendChild(cap);
                }
            } else if (m.type === 'sticker') {
                div.classList.add('sticker-only');
                const img = document.createElement('img');
                img.className = 'message-sticker';
                img.src = m.mediaUrl;
                img.onclick = function() { openMediaPreview(m.mediaUrl, 'image'); };
                div.appendChild(img);
            } else if (m.type === 'voice') {
                const duration = m.voiceDuration || m.voice_duration || 0;
                const player = createVoicePlayer(m.mediaUrl, duration);
                div.appendChild(player);
            } else if (m.type === 'video_note') {
                const noteEl = createVideoNoteElement(m.mediaUrl, m.voiceDuration || 0);
                div.appendChild(noteEl);
            } else if (m.type === 'call') {
                let callData = {};
                try { callData = JSON.parse(m.content || '{}'); } catch(_) {}
                const isOutgoingCall = (m.sender_id || m.senderId) === user.id;
                const isVideo = callData.callKind !== 'audio';
                const isMissed = callData.status === 'missed';
                const dur = callData.duration || 0;
                const durStr = dur > 0
                    ? (Math.floor(dur/60) + ':' + String(dur%60).padStart(2,'0'))
                    : '';
                const label = isMissed
                    ? (isOutgoingCall ? 'Звонок без ответа' : 'Пропущенный звонок')
                    : (isVideo ? 'Видеозвонок' : 'Аудиозвонок');
                const callIcon = isVideo
                    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'
                    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.84a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.63 16l.36.95z"/></svg>';
                const callEl = document.createElement('div');
                callEl.style.cssText = 'display:flex;align-items:center;gap:9px;padding:2px 0;';
                const iconWrap = document.createElement('span');
                iconWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;flex-shrink:0;'
                    + (isMissed ? 'background:rgba(255,75,98,0.15);color:#ff4b62;' : 'background:rgba(155,130,255,0.15);color:#9b82ff;');
                iconWrap.innerHTML = callIcon;
                const textWrap = document.createElement('span');
                textWrap.style.cssText = 'display:flex;flex-direction:column;gap:1px;';
                const labelEl = document.createElement('span');
                labelEl.style.cssText = 'font-size:13.5px;font-weight:600;' + (isMissed ? 'color:#ff4b62;' : '');
                labelEl.textContent = label;
                textWrap.appendChild(labelEl);
                if (durStr) {
                    const durEl = document.createElement('span');
                    durEl.style.cssText = 'font-size:11px;opacity:.6;';
                    durEl.textContent = durStr;
                    textWrap.appendChild(durEl);
                }
                callEl.appendChild(iconWrap);
                callEl.appendChild(textWrap);
                div.appendChild(callEl);
            } else {
                const textSpan = document.createElement('span');
                textSpan.className = 'message-text';
                // Обработка зашифрованных сообщений
                let displayContent = m.content || m.text || '';
                
                // Если сообщение зашифровано и есть contentPlain, используем его
                if (m.isEncrypted && m.contentPlain) {
                    displayContent = m.contentPlain;
                } else if (m.isEncrypted && !m.contentPlain && window.E2E && m.encryptionIv) {
                    // Пробуем расшифровать, если есть E2E и IV
                    try {
                        displayContent = await window.E2E.decrypt(m.content, m.encryptionIv, activeChat ? activeChat.id : 'unknown', token);
                    } catch (e) {
                        displayContent = '🔒 Зашифрованное сообщение';
                    }
                }
                
                // Убираем префикс "↪️ Переслано от X:\n" если есть forwardFrom
                if (m.forwardFrom && displayContent.startsWith('↪️ Переслано от ')) {
                    const nlIdx = displayContent.indexOf('\n');
                    if (nlIdx !== -1) displayContent = displayContent.substring(nlIdx + 1);
                }
                textSpan.innerHTML = renderFormattedText(displayContent);
                div.appendChild(textSpan);
            }
            
            const timeDiv = document.createElement('div');
            timeDiv.className = 'msg-time';
            const timeText = m.time || (m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '');
            const isOutgoingMsg = m.senderId === user.id || m.outgoing;
            if (isOutgoingMsg) {
                // Глазик: pending = часы, sent = одна галочка, read = две галочки
                let statusIcon = '';
                if (m.pending) {
                    statusIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.6"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
                } else if (m.isRead) {
                    statusIcon = '<svg width="16" height="10" viewBox="0 0 16 10" fill="none" style="color:var(--accent-color)"><path d="M1 5l3 3 5-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 5l3 3 5-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                } else {
                    statusIcon = '<svg width="12" height="10" viewBox="0 0 12 10" fill="none" style="opacity:.7"><path d="M1 5l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                }
                timeDiv.innerHTML = timeText + ' <span style="display:inline-flex;align-items:center;margin-left:2px;vertical-align:middle">' + statusIcon + '</span>';
            } else {
                timeDiv.textContent = timeText;
            }
            div.appendChild(timeDiv);
            
            // Реакции
            if (m.reactions && m.reactions.length > 0) {
                const reactionsEl = createReactionsElement(m.id, m.reactions);
                div.appendChild(reactionsEl);
            }
            
            return div;
        }

        // ============================================
        // EMOJI PICKER
        // ============================================
        function toggleEmojiPicker() {
            const picker = document.getElementById('emojiPicker');
            const btn = document.getElementById('emojiBtn');

            if (!picker) {
                console.error('emojiPicker element not found');
                return;
            }

            if (picker.classList.contains('active')) {
                closeEmojiPicker();
            } else {
                picker.classList.add('active');
                btn.classList.add('active');

                // Закрываем другие панели
                closeMediaPanel();
                closeAttachmentPanel();
                renderEmojiPicker();
            }
        }

        function closeEmojiPicker() {
            document.getElementById('emojiPicker').classList.remove('active');
            document.getElementById('emojiBtn').classList.remove('active');
        }

        function switchEmojiTab(tab, btn) {
            console.log('Switching to tab:', tab);
            // Update tab buttons
            document.querySelectorAll('.emoji-tab').forEach(function(b) {
                b.classList.remove('active');
            });
            if (btn) btn.classList.add('active');

            const emojiTab = document.getElementById('emojiTabContent');
            const gifTab = document.getElementById('gifTabContent');
            const stickerTab = document.getElementById('stickerTabContent');
            emojiTab.style.display = tab === 'emoji' ? 'flex' : 'none';
            gifTab.style.display = tab === 'gif' ? 'flex' : 'none';
            stickerTab.style.display = tab === 'sticker' ? 'flex' : 'none';
            if (tab === 'gif') {
                console.log('Loading GIFs...');
                loadGifs('');
            }
            if (tab === 'sticker') loadStickers();
        }

        // ── GIF в эмодзи-пикере ───────────────────────────────────────────
        let gifDebounce;
        let currentGifTab = 'all'; // 'all' or 'favorites'

        function switchGifTab(tab) {
            currentGifTab = tab;
            const btnAll = document.getElementById('gifTabAll');
            const btnFav = document.getElementById('gifTabFavorites');

            if (tab === 'all') {
                btnAll.style.background = 'var(--accent-color)';
                btnAll.style.color = '#fff';
                btnFav.style.background = 'var(--bg-tertiary)';
                btnFav.style.color = 'var(--text-primary)';
            } else {
                btnFav.style.background = 'var(--accent-color)';
                btnFav.style.color = '#fff';
                btnAll.style.background = 'var(--bg-tertiary)';
                btnAll.style.color = 'var(--text-primary)';
            }

            loadGifs(document.getElementById('gifSearch') ? document.getElementById('gifSearch').value : '');
        }

        function searchGifs(q) {
            clearTimeout(gifDebounce);
            gifDebounce = setTimeout(function() { loadGifs(q); }, 300);
        }

        async function loadGifs(query) {
            const grid = document.getElementById('emojiGifGrid');
            if (!grid) return;

            try {
                const endpoint = currentGifTab === 'favorites' ? '/api/v1/gifs/favorites' : '/api/v1/gifs';
                const res = await fetch(endpoint, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });

                if (!res.ok) throw new Error('Failed to load GIFs');
                const data = await res.json();
                const allGifs = data.gifs || [];

                const filtered = query
                    ? allGifs.filter(function(g) { return (g.name || '').toLowerCase().includes(query.toLowerCase()); })
                    : allGifs;

                grid.innerHTML = '';
                if (!filtered.length) {
                    const message = currentGifTab === 'favorites'
                        ? tr('noFavoriteGifs', 'Нет избранных GIF')
                        : tr('noGifsAdd', 'Нет GIF. Нажмите «+ GIF» чтобы добавить');
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted)">'
                        + '<div style="font-size:32px;opacity:.4;margin-bottom:8px">🎞️</div>'
                        + '<div style="font-size:13px">' + message + '</div></div>';
                    return;
                }

                const limitedGifs = currentGifTab === 'favorites' ? filtered.slice(0, 50) : filtered;

                limitedGifs.forEach(function(gif) {
                    const item = document.createElement('div');
                    item.style.cssText = 'cursor:pointer;border-radius:8px;background:var(--bg-tertiary);position:relative;';

                    const img = document.createElement('img');
                    img.src = gif.url;
                    img.style.cssText = 'width:100%;height:auto;display:block;';
                    img.loading = 'lazy';
                    img.onclick = function() {
                        setTimeout(function() {
                            closeEmojiPicker();
                            sendGifMessage(gif.url);
                        }, 50);
                    };

                    const favBtn = document.createElement('button');
                    favBtn.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.5);border:none;color:#fff;border-radius:50%;width:24px;height:24px;font-size:14px;cursor:pointer;';
                    favBtn.textContent = currentGifTab === 'favorites' ? '−' : '★';
                    favBtn.onclick = function(e) {
                        e.stopPropagation();
                        toggleGifFavorite(gif);
                    };

                    item.appendChild(img);
                    item.appendChild(favBtn);
                    grid.appendChild(item);
                });
            } catch (error) {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted)">' + tr('loadingError', 'Ошибка загрузки') + '</div>';
            }
        }

        async function toggleGifFavorite(gif) {
            try {
                const method = currentGifTab === 'favorites' ? 'DELETE' : 'POST';
                await fetch('/api/v1/gifs/' + gif.id + '/favorite', {
                    method: method,
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                loadGifs(document.getElementById('gifSearch') ? document.getElementById('gifSearch').value : '');
            } catch (error) {
                showToast('error', tr('error', 'Ошибка'), '❌');
            }
        }

        // ── Стикеры в эмодзи-пикере ───────────────────────────────────────
        var emojiCurrentPackIdx = null;

        function loadStickers() {
            loadStickerPacks();
            emojiRenderPacksList();
        }

        function emojiRenderPacksList() {
            const container = document.getElementById('emojiStickerPacks');
            if (!container) return;
            container.innerHTML = '';

            // Рендерим все паки (теперь только личные)
            stickerPacks.forEach(function(pack, i) {
                const btn = document.createElement('button');
                const isActive = emojiCurrentPackIdx === i;
                btn.style.cssText = 'background:' + (isActive ? 'var(--accent-color)' : 'var(--bg-tertiary)') + ';border:none;border-radius:8px;padding:4px 10px;font-size:12px;color:' + (isActive ? '#fff' : 'var(--text-primary)') + ';cursor:pointer;white-space:nowrap;flex-shrink:0;';
                btn.textContent = pack.name;
                btn.onclick = function(e) {
                    e.stopPropagation();
                    emojiCurrentPackIdx = i;
                    emojiRenderPacksList();
                };
                container.appendChild(btn);
            });

            emojiRenderStickerGrid();
        }

        function emojiRenderStickerGrid() {
            const grid = document.getElementById('emojiStickerGrid');
            const nameEl = document.getElementById('emojiStickerPackName');
            const addBtn = document.getElementById('emojiAddStickerBtn');
            if (!grid) return;
            if (emojiCurrentPackIdx === null || !stickerPacks[emojiCurrentPackIdx]) {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);font-size:13px">' + tr('choosePackOrCreate', 'Выберите пак или создайте новый') + '</div>';
                if (nameEl) {
                    nameEl.setAttribute('data-i18n', 'choosePack');
                    nameEl.textContent = tr('choosePack', 'Выберите пак');
                }
                if (addBtn) addBtn.style.display = 'none';
                return;
            }
            const pack = stickerPacks[emojiCurrentPackIdx];
            if (nameEl) {
                nameEl.removeAttribute('data-i18n');
                nameEl.textContent = pack.name;
            }
            // Показываем кнопку добавления только для личных паков
            if (addBtn) addBtn.style.display = !pack.isCommon ? 'block' : 'none';
            grid.innerHTML = '';
            (pack.stickers || []).forEach(function(url, si) {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'position:relative;border-radius:8px;overflow:hidden;cursor:pointer;aspect-ratio:1;background:var(--bg-tertiary);';
                const img = document.createElement('img');
                img.src = url;
                img.style.cssText = 'width:100%;height:100%;object-fit:contain;padding:4px;';
                img.onclick = function() { closeEmojiPicker(); sendStickerMessage(url); };
                // Кнопка удаления только для личных паков
                if (!pack.isCommon) {
                    const del = document.createElement('button');
                    del.textContent = '×';
                    del.style.cssText = 'position:absolute;top:2px;right:2px;background:rgba(0,0,0,.65);border:none;color:#fff;border-radius:50%;width:16px;height:16px;font-size:11px;cursor:pointer;line-height:1;';
                    del.onclick = async function(e) {
                        e.stopPropagation();
                        try {
                            // Получаем ID стикера из данных пака
                            const stickerId = pack.stickerIds ? pack.stickerIds[si] : null;
                            if (!stickerId) {
                                // Fallback: удаляем по индексу локально
                                stickerPacks[emojiCurrentPackIdx].stickers.splice(si, 1);
                                emojiRenderStickerGrid();
                                return;
                            }
                            const res = await fetch('/api/v1/stickers/packs/' + pack.id + '/stickers/' + stickerId, {
                                method: 'DELETE',
                                headers: { 'Authorization': 'Bearer ' + token }
                            });
                            if (res.ok) {
                                stickerPacks[emojiCurrentPackIdx].stickers.splice(si, 1);
                                if (stickerPacks[emojiCurrentPackIdx].stickerIds) {
                                    stickerPacks[emojiCurrentPackIdx].stickerIds.splice(si, 1);
                                }
                                emojiRenderStickerGrid();
                            }
                        } catch (error) {
                            console.error('Delete sticker error:', error);
                        }
                    };
                    wrap.appendChild(del);
                }
                // Контекстное меню для стикера
                wrap.oncontextmenu = function(e) {
                    e.preventDefault();
                    showStickerContextMenu(e, pack, url);
                };
                wrap.appendChild(img);
                grid.appendChild(wrap);
            });
            if (!pack.stickers || !pack.stickers.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--text-muted);font-size:13px">' + (pack.isCommon ? (window.i18n?.t('stickersSoon') || 'Скоро здесь появятся стикеры') : (window.i18n?.t('noStickers') || 'Нет стикеров. Нажмите «+ Стикер»')) + '</div>';
            }
        }

        function emojiAddStickerToPack() {
            if (emojiCurrentPackIdx === null) { showToast('error', tr('choosePack', 'Выберите пак'), '❌'); return; }
            // Переключаем currentStickerPackId чтобы addStickerToCurrentPack работал правильно
            currentStickerPackId = emojiCurrentPackIdx;
            document.getElementById('stickerInput').click();
        }

        function emojiOpenCreatePack() {
            openCreatePackModal();
        }

        function showStickerContextMenu(e, pack, stickerUrl) {
            e.preventDefault();
            e.stopPropagation();

            // Удаляем старое меню если есть
            const oldMenu = document.getElementById('stickerContextMenu');
            if (oldMenu) oldMenu.remove();

            const menu = document.createElement('div');
            menu.id = 'stickerContextMenu';
            menu.style.cssText = 'position:fixed;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:1000;min-width:200px;padding:4px 0;';

            // Копировать ссылку на стикер-пак
            const copyLinkItem = document.createElement('div');
            copyLinkItem.style.cssText = 'padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text-primary);transition:background 0.1s;';
            copyLinkItem.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>' + tr('copyLink', 'Скопировать ссылку') + '</span>';
            copyLinkItem.onclick = function() {
                const link = window.location.origin + '/stickers/' + pack.id;
                navigator.clipboard.writeText(link).then(function() {
                    showToast('success', tr('linkCopied', 'Ссылка скопирована'), '📋');
                });
                menu.remove();
            };
            copyLinkItem.onmouseover = function() { this.style.background = 'var(--bg-tertiary)'; };
            copyLinkItem.onmouseout = function() { this.style.background = 'transparent'; };
            menu.appendChild(copyLinkItem);

            // Добавить стикер-пак в мои (только для общих паков)
            if (pack.isCommon) {
                const addToMyItem = document.createElement('div');
                addToMyItem.style.cssText = 'padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text-primary);transition:background 0.1s;';
                addToMyItem.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><span>' + tr('addToMyStickers', 'Добавить в мои стикеры') + '</span>';
                addToMyItem.onclick = function() {
                    addStickerPackToPersonal(pack);
                    menu.remove();
                };
                addToMyItem.onmouseover = function() { this.style.background = 'var(--bg-tertiary)'; };
                addToMyItem.onmouseout = function() { this.style.background = 'transparent'; };
                menu.appendChild(addToMyItem);
            }

            // Позиционируем меню
            const x = e.clientX;
            const y = e.clientY;
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';

            document.body.appendChild(menu);

            // Закрытие при клике вне меню
            setTimeout(function() {
                document.addEventListener('click', function closeMenu(e) {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 0);
        }

        function addStickerPackToPersonal(pack) {
            // Проверяем, не добавлен ли уже
            const personalPacks = stickerPacks.filter(p => !p.isCommon);
            const alreadyExists = personalPacks.some(p => p.name === pack.name);

            if (alreadyExists) {
                showToast('error', tr('packAlreadyAdded', 'Этот пак уже добавлен'), '❌');
                return;
            }

            // Создаем копию пака для личных
            const newPack = {
                id: 'personal_' + Date.now(),
                name: pack.name,
                icon: pack.icon,
                stickers: [...(pack.stickers || [])],
                isCommon: false
            };

            stickerPacks.push(newPack);
            saveStickerPacks();
            renderStickerPacksList();
            emojiRenderPacksList();
            showToast('success', tr('stickerPackAdded', 'Стикерпак добавлен'), '✨');
        }

        function renderEmojiPicker() {
            renderEmojiCategories();
            // Рендерим текущую категорию или smileys по умолчанию
            renderEmojis(currentEmojiCategory || 'smileys');
        }

        function renderEmojiCategories() {
            const container = document.getElementById('emojiCategories');
            container.innerHTML = '';
            
            const categories = ['recent', 'smileys', 'animals', 'food', 'activities', 'travel', 'objects', 'symbols'];
            
            categories.forEach(function(cat) {
                const btn = document.createElement('button');
                btn.className = 'emoji-cat' + (cat === currentEmojiCategory ? ' active' : '');
                btn.innerHTML = window.EmojiCategories && window.EmojiCategories[cat] ? window.EmojiCategories[cat].icon : '😀';
                btn.onclick = function() {
                    currentEmojiCategory = cat;
                    document.querySelectorAll('.emoji-cat').forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    renderEmojis(cat);
                };
                container.appendChild(btn);
            });
        }

        // Базовый набор эмодзи на случай если EmojiData не загружена
        const DEFAULT_EMOJIS = {
            'smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
            'animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🐓','🦃','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦦','🦥','🐁','🐀','🐿️','🦔'],
            'food': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒','🍑','🍍','🥭','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🍡','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🍽️','🥣','🥡','🥢','🧂'],
            'activities': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸️','🥌','🎿','⛷️','🏂','🏋️','🏋️‍♂️','🏋️‍♀️','🤼','🤼‍♂️','🤼‍♀️','🤸','🤸‍♂️','🤸‍♀️','⛹️','⛹️‍♂️','⛹️‍♀️','🤺','🤾','🤾‍♂️','🤾‍♀️','🏌️','🏌️‍♂️','🏌️‍♀️','🏇','🧘','🧘‍♂️','🧘‍♀️','🏄','🏄‍♂️','🏄‍♀️','🏊','🏊‍♂️','🏊‍♀️','🤽','🤽‍♂️','🤽‍♀️','🚣','🚣‍♂️','🚣‍♀️','🧗','🧗‍♂️','🧗‍♀️','🚵','🚵‍♂️','🚵‍♀️','🚴','🚴‍♂️','🚴‍♀️','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🤹‍♂️','🤹‍♀️','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','🎯','🎳','🎮','🎰','🧩'],
            'travel': ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🦯','🦽','🦼','🛴','🚲','🛵','🏍️','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','⛽','🚧','🚦','🚥','🚏','🗺️','🧭','🧳','🌎','🌍','🌏','🌐','🗾','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🪨','🪵','🛖','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','♨️','🎠','🎡','🎢','💈','🎪'],
            'objects': ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧱','🔪','🗡️','⚔️','🛡️','🚬','⚰️','⚱️','🗿','🪦','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','📤','📥','📦','📫','📪','📬','📭','📮','🗳️','✏️','✒️','🖋️','🖊️','🖌️','🖍️','📝','💼','📁','📂','🗂️','📅','📆','🗒️','🗓️','📇','📈','📉','📊','📋','📌','📍','📎','🖇️','📏','📐','✂️','🗃️','🗄️','🗑️','🔒','🔓','🔏','🔐','🔑','🗝️'],
            'symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🈳','🈂','🛂','🛃','🛄','🛅','🛗','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','⬛','⬜','🟥','🟧','🟨','🟩','🟦','🟪','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛','🕜','🕝','🕞','🕟','🕠','🕡','🕢','🕣','🕤','🕥','🕦','🕧']
        };

        function renderEmojis(category, filter) {
            const grid = document.getElementById('emojiGrid');
            grid.innerHTML = '';
            
            let emojis = [];
            
            if (category === 'recent') {
                emojis = window.getRecentEmojis ? window.getRecentEmojis() : [];
                if (emojis.length === 0) {
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted);font-size:14px;">Недавние эмодзи появятся здесь</div>';
                    return;
                }
            } else {
                // Используем window.EmojiData если есть, иначе DEFAULT_EMOJIS
                emojis = (window.EmojiData && window.EmojiData[category]) 
                    ? window.EmojiData[category] 
                    : (DEFAULT_EMOJIS[category] || []);
            }
            
            if (filter) {
                emojis = emojis.filter(function(e) { return e.indexOf(filter) >= 0; });
            }
            
            emojis.forEach(function(emoji) {
                const item = document.createElement('div');
                item.className = 'emoji-item';
                item.textContent = emoji;
                item.onclick = function() { insertEmoji(emoji); };
                grid.appendChild(item);
            });
        }

        function filterEmojis(query) {
            if (!query) {
                renderEmojis(currentEmojiCategory);
                return;
            }

            const grid = document.getElementById('emojiGrid');
            grid.innerHTML = '';

            const allCategories = ['smileys', 'animals', 'food', 'activities', 'travel', 'objects', 'symbols'];
            let allEmojis = [];

            allCategories.forEach(function(cat) {
                if (window.EmojiData && window.EmojiData[cat]) {
                    allEmojis = allEmojis.concat(window.EmojiData[cat]);
                }
            });

            allEmojis = [...new Set(allEmojis)];

            // Фильтруем эмодзи по запросу
            const filtered = allEmojis.filter(function(emoji) {
                return emoji.includes(query);
            });

            filtered.forEach(function(emoji) {
                const item = document.createElement('div');
                item.className = 'emoji-item';
                item.textContent = emoji;
                item.onclick = function() { insertEmoji(emoji); };
                grid.appendChild(item);
            });
        }

        function insertEmoji(emoji) {
            const input = document.getElementById('msgInput');
            input.focus();
            document.execCommand('insertText', false, emoji);
            
            if (window.addToRecent) {
                window.addToRecent(emoji);
            }
        }

        // ============================================
        // TEXT FORMATTING IN INPUT
        // ============================================
        function formatInputText(format) {
            const input = document.getElementById('msgInput');
            const selection = window.getSelection();
            
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                showToast('info', 'Выделите текст для форматирования', '✏️');
                return;
            }
            
            const selectedText = selection.toString();
            let prefix = '', suffix = '';
            
            switch (format) {
                case 'bold':   prefix = '**'; suffix = '**'; break;
                case 'italic': prefix = '_';  suffix = '_';  break;
                case 'spoiler':prefix = '||'; suffix = '||'; break;
            }
            
            document.execCommand('insertText', false, prefix + selectedText + suffix);
            input.focus();
        }

        // Обработка горячих клавиш Ctrl+B, Ctrl+I
        document.getElementById('msgInput').addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'b') {
                    e.preventDefault();
                    formatInputText('bold');
                } else if (e.key === 'i') {
                    e.preventDefault();
                    formatInputText('italic');
                }
            }
        });

        // Контекстное меню для форматирования текста в поле ввода
        const msgInput = document.getElementById('msgInput');
        const inputContextMenu = document.getElementById('inputContextMenu');

        msgInput.addEventListener('contextmenu', function(e) {
            const selection = window.getSelection();
            
            // Показываем меню только если есть выделение
            if (selection && !selection.isCollapsed && selection.toString().length > 0) {
                e.preventDefault();
                
                const x = e.pageX || e.clientX || 0;
                const y = e.pageY || e.clientY || 0;
                
                inputContextMenu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
                inputContextMenu.style.top = Math.min(y, window.innerHeight - 150) + 'px';
                inputContextMenu.classList.add('active');
            }
        });

        // Закрыть контекстное меню при клике вне его
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#inputContextMenu') && !e.target.closest('#msgInput')) {
                inputContextMenu.classList.remove('active');
            }
        });

        document.addEventListener('click', function(e) {
            const picker = document.getElementById('emojiPicker');
            const btn = document.getElementById('emojiBtn');
            
            if (picker.classList.contains('active')) {
                if (!picker.contains(e.target) && !btn.contains(e.target)) {
                    closeEmojiPicker();
                }
            }
        });

        // ============================================
        // STICKER PACKS
        // ============================================
        async function loadStickerPacks() {
            try {
                const res = await fetch('/api/v1/stickers/packs', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (!res.ok) throw new Error('Failed to load sticker packs');
                const data = await res.json();
                stickerPacks = data.packs.map(p => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    icon: p.iconUrl || '🎨',
                    stickers: [],
                    stickerIds: [],
                    isCommon: false
                }));

                // Загружаем стикеры для каждого пака
                for (const pack of stickerPacks) {
                    const stickersRes = await fetch('/api/v1/stickers/packs/' + pack.id, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (stickersRes.ok) {
                        const stickersData = await stickersRes.json();
                        pack.stickers = stickersData.stickers.map(s => s.imageUrl);
                        pack.stickerIds = stickersData.stickers.map(s => s.id);
                    }
                }

                renderStickerPacksList();
            } catch (error) {
                console.error('Load sticker packs error:', error);
                // Fallback к localStorage если сервер недоступен
                const stored = localStorage.getItem('craneapp_sticker_packs');
                stickerPacks = stored ? JSON.parse(stored) : [];
                renderStickerPacksList();
            }
        }

        async function saveStickerPacks() {
            // Сохранение происходит на сервере через API
            // localStorage больше не используется
        }

        function renderStickerPacksList() {
            const container = document.getElementById('stickerPacks');
            container.innerHTML = '';

            // Кнопка создания нового пак
            const addBtn = document.createElement('div');
            addBtn.className = 'sticker-pack-item sticker-pack-add';
            addBtn.onclick = openCreatePackModal;
            addBtn.innerHTML = '<div class="sticker-pack-icon sticker-pack-add">➕</div><span class="sticker-pack-name">Новый</span>';
            container.appendChild(addBtn);

            // Рендерим все паки (теперь только личные)
            stickerPacks.forEach(function(pack, index) {
                const realIndex = index + 1; // +1 из-за кнопки создания
                const item = document.createElement('div');
                item.className = 'sticker-pack-item' + (currentStickerPackId === realIndex ? ' active' : '');
                item.onclick = function() { selectStickerPack(realIndex); };
                // Аватар - последний стикер или иконка
                const avatar = pack.stickers && pack.stickers.length > 0 ? pack.stickers[pack.stickers.length - 1] : (pack.icon || '🎨');
                item.innerHTML = '<div class="sticker-pack-icon"><img src="' + avatar + '" alt=""></div><span class="sticker-pack-name">' + pack.name + '</span>';
                container.appendChild(item);
            });

            if (stickerPacks.length > 0 && currentStickerPackId === null) {
                selectStickerPack(1);
            } else if (stickerPacks.length === 0) {
                currentStickerPackId = null;
                renderStickerGrid();
            }
        }

        function selectStickerPack(index) {
            currentStickerPackId = index;
            document.querySelectorAll('.sticker-pack-item').forEach(function(el, i) {
                el.classList.toggle('active', i === index + 1);
            });
            renderStickerGrid();
        }

        function renderStickerGrid() {
            const grid = document.getElementById('stickerGrid');
            grid.innerHTML = '';
            
            if (currentStickerPackId === null || !stickerPacks[currentStickerPackId]) {
                grid.innerHTML = '<div class="sticker-empty">Выберите или создайте стикерпак</div>';
                return;
            }
            
            const pack = stickerPacks[currentStickerPackId];
            
            const addBtn = document.createElement('div');
            addBtn.className = 'sticker-item sticker-add-btn';
            addBtn.textContent = '➕';
            addBtn.onclick = addStickerToPack;
            grid.appendChild(addBtn);
            
            if (pack.stickers && pack.stickers.length > 0) {
                pack.stickers.forEach(function(stickerUrl) {
                    const item = document.createElement('div');
                    item.className = 'sticker-item';
                    item.innerHTML = '<img src="' + stickerUrl + '" alt="">';
                    item.onclick = function() { sendStickerMessage(stickerUrl); };
                    grid.appendChild(item);
                });
            }
        }

        function addStickerToPack() {
            if (currentStickerPackId === null) {
                showToast('error', 'Выберите стикерпак', '❌');
                return;
            }
            document.getElementById('stickerInput').click();
        }

        async function addStickerToCurrentPack(stickerData) {
            if (currentStickerPackId === null || !stickerPacks[currentStickerPackId]) {
                showToast('error', 'Выберите стикерпак', '❌');
                return;
            }

            const pack = stickerPacks[currentStickerPackId];

            // Общие паки нельзя редактировать
            if (pack.isCommon) {
                showToast('error', 'Нельзя редактировать общие паки', '❌');
                return;
            }

            try {
                const res = await fetch('/api/v1/stickers/packs/' + pack.id, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        image: stickerData
                    })
                });

                if (!res.ok) throw new Error('Failed to add sticker');

                const data = await res.json();
                if (!pack.stickers) {
                    pack.stickers = [];
                }
                if (!pack.stickerIds) {
                    pack.stickerIds = [];
                }
                pack.stickers.push(data.sticker.imageUrl);
                pack.stickerIds.push(data.sticker.id);
                renderStickerGrid();
                // Обновляем и эмодзи-пикер если открыт
                if (emojiCurrentPackIdx === currentStickerPackId) emojiRenderStickerGrid();
                showToast('success', 'Стикер добавлен', '✓');
            } catch (error) {
                console.error('Add sticker error:', error);
                showToast('error', 'Ошибка добавления стикера', '❌');
            }
        }

        async function createStickerPack() {
            const name = document.getElementById('newPackName').value.trim();
            const desc = document.getElementById('newPackDesc').value.trim();

            if (!name) {
                showToast('error', 'Введите название', '❌');
                return;
            }

            try {
                const res = await fetch('/api/v1/stickers/packs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        name: name,
                        description: desc,
                        icon: newPackIconData
                    })
                });

                if (!res.ok) throw new Error('Failed to create sticker pack');

                const data = await res.json();
                const newPack = {
                    id: data.pack.id,
                    name: data.pack.name,
                    description: data.pack.description,
                    icon: data.pack.iconUrl || '🎨',
                    stickers: [],
                    isCommon: false
                };

                stickerPacks.push(newPack);

                closeCreatePackModal();
                renderStickerPacksList();
                selectStickerPack(stickerPacks.length - 1);
                // Обновляем эмодзи-пикер
                emojiCurrentPackIdx = stickerPacks.length - 1;
                emojiRenderPacksList();
                showToast('success', 'Стикерпак создан', '✓');
            } catch (error) {
                console.error('Create sticker pack error:', error);
                showToast('error', 'Ошибка создания пака', '❌');
            }
        }

        // ============================================
        // GIF STORAGE
        // ============================================
        // Старая функция loadGifs удалена - используется новая async function loadGifs(query) выше

        async function saveGif(gifUrl, name) {
            try {
                const res = await fetch('/api/v1/gifs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        name: name || '',
                        url: gifUrl
                    })
                });

                if (res.ok) {
                    const grid = document.getElementById('emojiGifGrid');
                    if (grid) loadGifs('');
                }
            } catch (error) {
                showToast('error', 'Ошибка сохранения', '❌');
            }
        }

        // ============================================
        // WEBSOCKET
        // ============================================
        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host + '/ws?userId=' + user.id;
            window._chatWsConnected = true; // сигнал для notifications.js
            
            try {
                ws = new WebSocket(wsUrl);
                window.craneWs = ws;
            } catch (e) {
                console.error('WebSocket error:', e);
                scheduleReconnect();
                return;
            }
            
            ws.onopen = function() {
                console.log('✅ WebSocket connected');
                if (wsReconnectTimer) {
                    clearTimeout(wsReconnectTimer);
                    wsReconnectTimer = null;
                }
                // Keepalive: пинг каждые 20 сек чтобы NAT мобильных операторов не дропал соединение
                if (ws._pingInterval) clearInterval(ws._pingInterval);
                ws._pingInterval = setInterval(function() {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 20000);
            };
            
            ws.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    handleWsMessage(data);
                } catch (e) {
                    console.error('WS parse error:', e);
                }
            };
            
            ws.onclose = function() {
                console.log('❌ WebSocket disconnected');
                if (ws._pingInterval) { clearInterval(ws._pingInterval); ws._pingInterval = null; }
                scheduleReconnect();
            };
            
            ws.onerror = function(err) {
                console.error('WS error:', err);
            };
        }
        
        function scheduleReconnect() {
            if (wsReconnectTimer) return;
            wsReconnectTimer = setTimeout(function() {
                connectWebSocket();
            }, 3000);
        }

        function handleWsMessage(data) {
            // Перехват входящего видеозвонка
            if (data && data.type === 'call_incoming') {
                if (window.__handleIncomingCallMessage) window.__handleIncomingCallMessage(data);
                return;
            }
            if (data && data.type === 'call_cancelled') {
                // Звонящий отменил вызов до ответа — убираем баннер входящего звонка
                if (_incomingCall && _incomingCall.roomId === data.roomId) {
                    try { _stopRingtone(); } catch(_){}
                    _hideIncomingCallBanner();
                    _incomingCall = null;
                }
                return;
            }
            if (data && data.type === 'call_invite_response') {
                if (window._cancelCallInviteRetry) { window._cancelCallInviteRetry(); window._cancelCallInviteRetry = null; }
                if (data.accepted) {
                    try { showToast && showToast('success', 'Собеседник принял звонок'); } catch(_){}
                } else {
                    try { showToast && showToast('info', 'Собеседник отклонил звонок'); } catch(_){}
                    // Закрываем окно звонка через postMessage в iframe
                    try { document.getElementById('callFrame').contentWindow.postMessage({ type: 'crane_hangup' }, '*'); } catch(_) {}
                }
                return;
            }
            switch (data.type) {
                case 'connected':
                    console.log('WS session:', data.userId);
                    break;

                case 'settings_updated':
                    if (window.syncThemeWithServer) window.syncThemeWithServer();
                    break;
                    
                case 'new_message':
                    if (activeChat && data.chatId === activeChat.id) {
                        // Расшифровываем если нужно
                        const decryptMsg = async (msg) => {
                            if (msg.isEncrypted && msg.encryptionIv && window.E2E) {
                                try { msg.content = await window.E2E.decrypt(msg.content, msg.encryptionIv, activeChat.id, token); } catch (_) {}
                            }
                            if (msg.replyToEncrypted && msg.replyToIv && window.E2E) {
                                try { msg.replyToContent = await window.E2E.decrypt(msg.replyToContent, msg.replyToIv, activeChat.id, token); } catch (_) {}
                            }
                            // replyToData из WS (при отправке нового сообщения)
                            if (msg.replyToData?.isEncrypted && msg.replyToData?.encryptionIv && window.E2E) {
                                try { msg.replyToData.content = await window.E2E.decrypt(msg.replyToData.content, msg.replyToData.encryptionIv, activeChat.id, token); } catch (_) {}
                            }
                            return msg;
                        };
                        decryptMsg(data.message).then(msg => addMessage(msg));
                    }
                    // Если чат новый (нас нет в chatUsers) — добавляем его сразу
                    if (data.chatId && !allChats.find(c => c.id === data.chatId)) {
                        const msg = data.message;
                        const senderName = msg.senderFirstName || msg.sender?.firstName || msg.senderName || 'Пользователь';
                        const senderAv = msg.senderAvatar || msg.sender?.avatarUrl || senderName[0];
                        const senderId = msg.senderId || msg.sender?.id;
                        if (senderId && senderId !== user.id) {
                            chatUsers[data.chatId] = { id: senderId, name: senderName, av: senderAv, isOnline: true };
                        }
                        allChats.unshift({
                            id: data.chatId, name: senderName, av: senderAv,
                            lastMessage: formatLastMessageFromMessage(msg),
                            lastMessageAt: new Date().toISOString(),
                            time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                            isOnline: true, isPinned: false, lastMessageType: msg.type || 'text',
                            lastMessageSenderId: msg.sender_id || msg.senderId || msg.sender?.id
                        });
                        renderChatList();
                    } else {
                        // Обновляем время последнего сообщения для существующего чата
                        const existingChat = allChats.find(c => c.id === data.chatId);
                        if (existingChat) {
                            existingChat.lastMessageAt = new Date().toISOString();
                            existingChat.time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                            existingChat.lastMessageType = data.message?.type || existingChat.lastMessageType || 'text';
                            existingChat.lastMessageSenderId = data.message?.sender_id || data.message?.senderId || data.message?.sender?.id;
                            existingChat.lastMessage = formatLastMessageFromMessage(data.message, existingChat.lastMessage);
                        }
                        loadChats();
                    }
                    break;
                    
                case 'message_edited':
                    updateMessage(data.messageId, data.content);
                    break;
                    
                case 'message_deleted':
                    removeMessage(data.messageId);
                    break;
                    
                case 'message_pinned':
                    if (activeChat && data.chatId === activeChat.id) {
                        showPinnedMessage(data.message);
                        const msgEl = document.querySelector('[data-message-id="' + data.message.id + '"]');
                        if (msgEl) msgEl.classList.add('pinned');
                    }
                    break;
                    
                case 'message_unpinned':
                    if (activeChat && data.chatId === activeChat.id) {
                        hidePinnedMessage();
                        const msgEl = document.querySelector('[data-message-id="' + data.messageId + '"]');
                        if (msgEl) msgEl.classList.remove('pinned');
                    }
                    break;
                    
                case 'user_typing':
                    if (activeChat && data.chatId === activeChat.id) {
                        showTyping();
                    }
                    break;
                    
                case 'user_status':
                    // Обновляем кэш chatUsers для всех чатов где есть этот пользователь
                    Object.keys(chatUsers).forEach(cid => {
                        if (chatUsers[cid].id === data.userId) {
                            chatUsers[cid].isOnline = data.isOnline;
                            chatUsers[cid].lastSeen = data.lastSeen || chatUsers[cid].lastSeen;
                        }
                    });
                    // Обновляем хедер если открыт чат с этим пользователем
                    if (activeChat && chatUsers[activeChat.id] && chatUsers[activeChat.id].id === data.userId) {
                        const statusEl = document.getElementById('chatStatus');
                        if (data.isOnline) {
                            statusEl.textContent = 'онлайн';
                            statusEl.style.color = 'var(--success-color)';
                        } else if (data.lastSeen === null) {
                            statusEl.textContent = 'последний визит скрыт';
                            statusEl.style.color = 'var(--text-muted)';
                        } else {
                            statusEl.textContent = 'был(а) недавно';
                            statusEl.style.color = 'var(--text-muted)';
                        }
                    }
                    // Обновляем список чатов без полной перезагрузки
                    renderChatList();
                    break;

                case 'new_chat':
                    // Новый чат создан — добавляем в список если нас нет
                    if (data.chatId && !allChats.find(c => c.id === data.chatId)) {
                        const name = data.senderName || data.title || 'Чат';
                        const av = data.senderAvatar || name[0];
                        if (data.senderId) {
                            chatUsers[data.chatId] = { id: data.senderId, name, av, isOnline: true };
                        }
                        allChats.unshift({
                            id: data.chatId, name, av,
                            lastMessage: '', time: '',
                            isOnline: true, isPinned: false,
                            lastMessageType: 'text'
                        });
                        renderChatList();
                    }
                    break;

                case 'reaction_updated':
                    updateMessageReactions(data.messageId, data.reactions);
                    break;
            }
        }
        
        async function addMessage(msg) {
            messagesData[msg.id] = msg;
            const messagesEl = document.getElementById('messages');
            const div = await createMessageElement(msg);
            messagesEl.appendChild(div);
            scrollToBottom();
        }
        
        function updateMessage(messageId, content) {
            const el = document.querySelector('[data-message-id="' + messageId + '"]');
            if (el) {
                const textEl = el.querySelector('.message-text');
                if (textEl) textEl.textContent = content;
            }
        }
        
        function removeMessage(messageId) {
            const el = document.querySelector('[data-message-id="' + messageId + '"]');
            if (el) el.remove();
            delete messagesData[messageId];
        }
        
        function showTyping() {
            const statusEl = document.getElementById('chatStatus');
            if (!statusEl) return;
            statusEl.textContent = 'печатает...';
            statusEl.style.color = 'var(--success-color)';
            clearTimeout(showTyping._t);
            showTyping._t = setTimeout(function() {
                // Восстанавливаем реальный статус
                if (activeChat && chatUsers[activeChat.id]) {
                    const u = chatUsers[activeChat.id];
                    if (u.isOnline) {
                        statusEl.textContent = 'онлайн';
                        statusEl.style.color = 'var(--success-color)';
                    } else {
                        statusEl.textContent = 'был(а) недавно';
                        statusEl.style.color = 'var(--text-muted)';
                    }
                } else {
                    statusEl.textContent = 'онлайн';
                }
            }, 3000);
        }

        function sendTyping() {
            if (ws && ws.readyState === WebSocket.OPEN && activeChat) {
                ws.send(JSON.stringify({
                    type: 'typing',
                    chatId: activeChat.id
                }));
            }
        }

        // ============================================
        // SYNC USER DATA
        // ============================================
        async function syncUserData() {
            try {
                const res = await fetch('/api/v1/users/me', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                
                if (data.user) {
                    user = {
                        id: data.user.id,
                        username: data.user.username,
                        firstName: data.user.firstName,
                        lastName: data.user.lastName,
                        avatarUrl: data.user.avatarUrl,
                        bio: data.user.bio,
                        badge: data.user.badge || null,
                        badges: data.user.badges || [],
                        isBot: data.user.isBot || false,
                        isPremium: data.user.isPremium || data.user.is_premium || false
                    };
                    localStorage.setItem('craneapp_user_data', JSON.stringify(user));
                    updateSideMenuProfile();
                    console.log('✅ User data synced');
                }
            } catch (e) {
                console.warn('⚠️ User sync failed:', e);
            }
        }

        // ============================================
        // SCROLL TO BOTTOM
        // ============================================
        function scrollToBottom(smooth) {
            const container = document.getElementById('messagesContainer');
            if (smooth) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            } else {
                container.scrollTop = container.scrollHeight;
            }
        }
        
        function updateScrollButton() {
            const container = document.getElementById('messagesContainer');
            const btn = document.getElementById('scrollBottomBtn');
            if (!container || !btn) return;
            
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            
            if (isNearBottom) {
                btn.classList.remove('visible');
            } else {
                btn.classList.add('visible');
            }
        }
            
        document.getElementById('messagesContainer').addEventListener('scroll', updateScrollButton);

        // ============================================
        // AVATAR
        // ============================================
        function isImage(url) {
            if (!url || typeof url !== 'string') return false;
            // Accept data URLs, absolute URLs, absolute/relative root paths and common uploads path
            return url.startsWith('data:image') || url.startsWith('http') || url.startsWith('/') || url.startsWith('uploads/') || url.startsWith('/uploads/');
        }

        function renderAvatar(url, placeholder, className, username) {
            className = className || 'avatar';
            // Журавль для бота CraneApp
            if (username === 'craneapp_bot') {
                return '<div class="' + className + '"><img class="avatar-img" src="/logo.png" alt=""></div>';
            }
            if (isImage(url)) {
                return '<div class="' + className + '"><img class="avatar-img" src="' + url + '" alt=""></div>';
            }
            return '<div class="' + className + '"><span>' + (placeholder || '?') + '</span></div>';
        }

        // ============================================
        // REPLY
        // ============================================
        function setReplyTo(messageId, senderName, text) {
            replyingTo = { messageId: messageId, senderName: senderName, text: text };
            document.getElementById('replyBarSender').textContent = senderName;
            document.getElementById('replyBarText').textContent = text.substring(0, 100);
            document.getElementById('replyBar').classList.add('active');
            document.getElementById('msgInput').focus();
        }

        function cancelReply() {
            replyingTo = null;
            document.getElementById('replyBar').classList.remove('active');
        }

        // ============================================
        // SEARCH MODAL
        // ============================================
        document.getElementById('modalSearchInput').addEventListener('input', function(e) {
            const query = e.target.value.trim().replace('@', '');
            clearTimeout(searchTimeout);
            if (query.length < 2) {
                document.getElementById('modalStatus').classList.remove('visible');
                return;
            }
            searchTimeout = setTimeout(function() { searchUsers(query); }, 300);
        });

        async function searchUsers(query) {
            const statusEl = document.getElementById('modalStatus');
            const resultsEl = document.getElementById('modalResults');
            
            statusEl.className = 'modal-status visible';
            statusEl.textContent = 'Поиск...';
            statusEl.style.color = 'var(--accent-color)';
            
            try {
                const res = await fetch('/api/v1/users/search?q=' + encodeURIComponent(query), {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                
                if (data.users && data.users.length > 0) {
                    statusEl.className = 'modal-status visible found';
                    statusEl.textContent = '✅ Найдено: ' + data.users.length;
                    
                    resultsEl.innerHTML = data.users.map(function(u) {
                        const name = u.firstName || u.lastName || 'Пользователь';
                        const ph = (u.firstName || u.username)[0].toUpperCase();
                        return '<div class="user-item">' +
                            renderAvatar(u.avatarUrl, ph, 'user-avatar') +
                            '<div class="user-info">' +
                            '<div class="user-name">' + name + '</div>' +
                            '<div class="user-username">@' + u.username + '</div>' +
                            '</div>' +
                            '<button class="user-action-btn" onclick="startChatFromModal(\'' + u.id + '\', \'' + u.username + '\', \'' + name + '\', this)">Написать</button>' +
                            '</div>';
                    }).join('');
                } else {
                    statusEl.className = 'modal-status visible not-found';
                    statusEl.textContent = '❌ Ничего не найдено';
                    resultsEl.innerHTML = '<div class="modal-empty"><div class="modal-empty-icon">😕</div><div>Ничего не найдено</div></div>';
                }
            } catch (err) {
                statusEl.className = 'modal-status visible not-found';
                statusEl.textContent = '❌ Ошибка';
            }
        }

        async function startChatFromModal(userId, username, name, btn) {
            if (userId === user.id) {
                showToast('error', 'Нельзя создать чат с собой', '⚠️');
                return;
            }
            
            btn.disabled = true;
            btn.textContent = '...';
            
            try {
                const res = await fetch('/api/v1/chats/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ type: 'private', participants: [userId] })
                });
                const data = await res.json();
                
                if (data.chatId) {
                    btn.className = 'user-action-btn success';
                    btn.textContent = '✓';
                    
                    chatUsers[data.chatId] = { id: userId, username: username, name: name, av: name[0] };
                    
                    setTimeout(function() {
                        closeSearchModal();
                        loadChats().then(function() {
                            const chat = allChats.find(function(c) { return c.id === data.chatId; });
                            if (chat) openChat(chat.id, chat.name);
                        });
                    }, 500);
                }
            } catch (err) {
                btn.disabled = false;
                btn.textContent = 'Написать';
                showToast('error', 'Ошибка', '❌');
            }
        }

        // ============================================
        // CHATS
        // ============================================
        async function decryptLastMessage(c) {
            if (!c.lastMessageEncrypted || !c.lastMessageIv || !window.E2E) return c.lastMessage || '';
            try {
                return await window.E2E.decrypt(c.lastMessage, c.lastMessageIv, c.id, token);
            } catch (_) {
                return c.lastMessage || '';
            }
        }

        function formatCallLastMessage(c, text) {
            let callData = {};
            const raw = text || c.lastMessage || c.content || '';
            if (typeof raw === 'string') {
                try { callData = JSON.parse(raw || '{}'); } catch(_) {}
            } else if (raw && typeof raw === 'object') {
                callData = raw;
            }

            const senderId = c.lastMessageSenderId || c.sender_id || c.senderId || c.sender?.id;
            const isOutgoingCall = senderId && String(senderId) === String(user.id);
            const isVideo = callData.callKind !== 'audio';

            if (callData.status === 'missed') {
                return isOutgoingCall ? '📞 Звонок без ответа' : '📞 Пропущенный звонок';
            }

            return isVideo ? '📹 Видеозвонок' : '📞 Аудиозвонок';
        }

        function formatLastMessageType(c, text) {
            if (c.lastMessageType === 'voice') return '🎤 Голосовое';
            if (c.lastMessageType === 'image' || c.lastMessageType === 'photo') return '🖼️ Фото';
            if (c.lastMessageType === 'video') return '🎬 Видео';
            if (c.lastMessageType === 'gif') return '🎞️ GIF';
            if (c.lastMessageType === 'sticker') return '🎨 Стикер';
            if (c.lastMessageType === 'video_note') return '⭕ Кружок';
            if (c.lastMessageType === 'call' || c.type === 'call') return formatCallLastMessage(c, text);
            return text || '';
        }

        function formatLastMessageFromMessage(msg, fallback) {
            if (!msg) return fallback || '';
            return formatLastMessageType({
                type: msg.type || 'text',
                lastMessageType: msg.type || 'text',
                lastMessage: msg.content || '',
                lastMessageSenderId: msg.sender_id || msg.senderId || msg.sender?.id
            }, msg.content || '') || fallback || '';
        }

        // Возвращает объект с lastMessage и опционально _rawEncrypted/_rawIv для отложенной расшифровки
        function formatLastMessage(c) {
            const typeOverride = formatLastMessageType(c, null);
            if (typeOverride) return typeOverride; // медиа — не шифруется в тексте
            if (c.lastMessageEncrypted && c.lastMessageIv) {
                // Вернём пустую строку пока, расшифруем позже
                return '';
            }
            return c.lastMessage || '';
        }

        // Подготавливает объект чата — сохраняет raw данные для расшифровки
        function prepareChatEntry(c, base) {
            const entry = Object.assign({}, base);
            if (c.lastMessageEncrypted && c.lastMessageIv) {
                entry._rawEncrypted = c.lastMessage;
                entry._rawIv = c.lastMessageIv;
                entry.lastMessage = '';
            }
            return entry;
        }

        async function loadChats() {
            try {
                // Сначала загружаем архивированные чаты (чтобы они были доступны при рендеринге)
                await loadArchivedChats();
                
                // Затем загружаем обычные чаты
                const chatsRes = await fetch('/api/v1/chats', { 
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await chatsRes.json();
                
                // Сбрасываем pinned чаты и заполняем из данных
                pinnedChatIds = new Set();
                
                // Очищаем массивы
                allChats = [];
                
                // Map для защиты от дубликатов - используем для всех чатов
                const uniqueChats = new Map(); // chatId -> chatData
                
                if (data.chats && data.chats.length > 0) {
                    // Сначала загружаем все приватные чаты и их участников
                    const privateChats = [];
                    const otherChats = [];
                    
                    // Разделяем чаты на приватные и другие
                    for (let i = 0; i < data.chats.length; i++) {
                        const c = data.chats[i];
                        if (c.type === 'private') {
                            privateChats.push(c);
                        } else {
                            otherChats.push(c);
                        }
                    }
                    
                    // Обрабатываем приватные чаты — параллельно с таймаутом 5с
                    function fetchWithTimeout(url, opts, ms) {
                        const ctrl = new AbortController();
                        const tid = setTimeout(() => ctrl.abort(), ms);
                        return fetch(url, { ...opts, signal: ctrl.signal })
                            .finally(() => clearTimeout(tid));
                    }

                    const memberResults = await Promise.allSettled(
                        privateChats.map(c => {
                            if (uniqueChats.has(c.id)) return Promise.resolve({ skip: true, c });
                            return fetchWithTimeout('/api/v1/chats/' + c.id + '/members',
                                { headers: { 'Authorization': 'Bearer ' + token } }, 5000)
                                .then(r => r.ok ? r.json().then(d => ({ c, mData: d })) : Promise.resolve({ c, status: r.status }))
                                .catch(() => ({ c, timeout: true }));
                        })
                    );

                    for (const result of memberResults) {
                        if (result.status === 'rejected') continue;
                        const val = result.value;
                        if (!val || val.skip) continue;
                        const c = val.c;

                        // При таймауте или ошибке — используем кэш
                        if (val.timeout || val.status) {
                            const cached = chatUsers[c.id];
                            if (cached) {
                                uniqueChats.set(c.id, prepareChatEntry(c, {
                                    id: c.id, name: cached.name, av: cached.av,
                                    lastMessage: formatLastMessage(c),
                                    time: c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '',
                                    isOnline: cached.isOnline, isPinned: c.isPinned || false,
                                    lastMessageType: c.lastMessageType
                                }));
                                if (c.isPinned) pinnedChatIds.add(c.id);
                            }
                            continue;
                        }

                        const other = val.mData && val.mData.members && val.mData.members.find(function(m) {
                            return m.id !== user.id;
                        });

                        if (other) {
                            // Удаляем дубликаты по пользователю
                            for (const [existingChatId] of uniqueChats) {
                                const existingUser = chatUsers[existingChatId];
                                if (existingUser && existingUser.id === other.id) {
                                    uniqueChats.delete(existingChatId);
                                    break;
                                }
                            }

                            chatUsers[c.id] = {
                                id: other.id,
                                username: other.username,
                                name: other.first_name || other.username,
                                av: other.avatar_url || (other.first_name ? other.first_name[0] : other.username[0]),
                                bio: other.bio || '',
                                isOnline: other.is_blocked ? false : other.is_online,
                                lastSeen: other.last_seen,
                                badge: other.badge || null,
                                badges: other.badges || [],
                                isBot: other.is_bot || false,
                                isPremium: other.is_premium || false,
                                isBlocked: other.is_blocked || false
                            };

                            uniqueChats.set(c.id, prepareChatEntry(c, {
                                id: c.id,
                                name: chatUsers[c.id].name,
                                av: chatUsers[c.id].av,
                                lastMessage: formatLastMessage(c),
                                lastMessageAt: c.lastMessageAt || null,
                                time: c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '',
                                isOnline: other.is_online,
                                isPinned: c.isPinned || false,
                                lastMessageType: c.lastMessageType,
                                badge: other.badge || null,
                                isBot: other.is_bot || false
                            }));

                            if (c.isPinned) pinnedChatIds.add(c.id);
                        }
                    }
                    
                    // Обрабатываем групповые чаты и каналы
                    for (let i = 0; i < otherChats.length; i++) {
                        const c = otherChats[i];
                        
                        // Пропускаем если уже обработали этот чат
                        if (uniqueChats.has(c.id)) {
                            continue;
                        }
                        
                        let lastMsgText = formatLastMessage(c);
                        
                         // Добавляем в Map
                         uniqueChats.set(c.id, prepareChatEntry(c, {
                             id: c.id,
                             name: c.title || 'Чат',
                             av: c.avatarUrl || (c.title ? c.title[0] : '?'),
                             avatarUrl: c.avatarUrl || null,
                             type: c.type,
                             lastMessage: lastMsgText,
                             lastMessageAt: c.lastMessageAt || null,
                             time: c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '',
                             isPinned: c.isPinned || false
                         }));
                        
                        // Добавляем в pinnedChatIds если чат закреплён
                        if (c.isPinned) {
                            pinnedChatIds.add(c.id);
                        }
                    }
                }
                
                // Конвертируем Map в массив
                allChats = Array.from(uniqueChats.values());

                // Расшифровываем lastMessage для зашифрованных чатов
                if (window.E2E) {
                    await Promise.all(allChats.map(async c => {
                        if (c._rawEncrypted && c._rawIv) {
                            try {
                                const plain = await window.E2E.decrypt(c._rawEncrypted, c._rawIv, c.id, token);
                                c.lastMessage = formatLastMessageType(c, plain);
                            } catch (_) {}
                            delete c._rawEncrypted;
                            delete c._rawIv;
                        }
                    }));
                }

                // Рендерим после загрузки ВСЕХ данных включая архивированные
                renderChatList();
                initFolderTabs();
            } catch (err) {
                console.error('Load chats error:', err);
                allChats = [];
                archivedChats = [];
                renderChatList();
            }
        }

        let activeFolder = null; // null = все чаты

        // Значки — принимает массив badges + флаги isBot, isPremium, isFake, isScam
        function makeBadgeSvg(g1, g2, id) {
            return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;margin-left:3px;flex-shrink:0">'
                + '<circle cx="8" cy="8" r="8" fill="url(#' + id + ')"/>'
                + '<path d="M4.5 8L7 10.5L11.5 5.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
                + '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="16" y2="16" gradientUnits="userSpaceOnUse">'
                + '<stop stop-color="' + g1 + '"/><stop offset="1" stop-color="' + g2 + '"/>'
                + '</linearGradient></defs></svg>';
        }

        const BADGE_DEFS = {
            developer: () => makeBadgeSvg('#FF007F', '#9D00FF', 'bd' + Math.random().toString(36).slice(2,6)),
            verified:  () => makeBadgeSvg('#FF007F', '#9D00FF', 'bv' + Math.random().toString(36).slice(2,6)),
            admin:     () => makeBadgeSvg('#0088FF', '#00C8C8', 'ba' + Math.random().toString(36).slice(2,6)),
            premium:   () => '<span style="display:inline-block;vertical-align:middle;margin-left:3px;font-size:13px;line-height:1;filter:drop-shadow(0 0 3px #FFD700)">⭐</span>',
            bot:       () => makeBadgeSvg('#FF007F', '#9D00FF', 'bb' + Math.random().toString(36).slice(2,6)),
            fake:      () => '<span style="color:#FF4B4B;font-size:10px;font-weight:700;margin-left:3px;vertical-align:middle">FAKE</span>',
            scam:      () => '<span style="color:#FF4B4B;font-size:10px;font-weight:700;margin-left:3px;vertical-align:middle">SCAM</span>',
        };

        function renderBadges(badges, isBot, isPremium, isFake, isScam) {
            let html = '';
            // Если это бот — показываем только одну галочку бота
            if (isBot) {
                return BADGE_DEFS['bot']();
            }
            const list = Array.isArray(badges) ? [...badges] : (badges ? [badges] : []);
            if (isPremium && !list.includes('premium')) list.push('premium');
            if (isFake) list.push('fake');
            if (isScam) list.push('scam');
            for (const b of list) {
                if (BADGE_DEFS[b]) html += BADGE_DEFS[b]();
            }
            return html;
        }

        // Обратная совместимость
        function renderBadge(badge, isBot) {
            return renderBadges(badge ? [badge] : [], isBot, false, false, false);
        }
        function initFolderTabs() {
            const folders = JSON.parse(localStorage.getItem('craneapp_folders') || '[]');
            const tabsEl = document.getElementById('folderTabs');
            if (!folders.length) { tabsEl.style.display = 'none'; return; }

            tabsEl.style.display = 'flex';
            let html = '<div class="ftab' + (!activeFolder ? ' active' : '') + '" onclick="setFolder(null)">💬 Все</div>';
            folders.forEach(f => {
                const isActive = activeFolder === f.id;
                html += '<div class="ftab' + (isActive ? ' active' : '') + '" onclick="setFolder(\'' + f.id + '\')">' + f.icon + ' ' + f.name + '</div>';
            });
            tabsEl.innerHTML = html;
        }

        function setFolder(folderId) {
            activeFolder = folderId;
            initFolderTabs();
            renderChatList();
        }

        function renderChatList(filter) {
            filter = filter || '';
            
            const list = document.getElementById('chatList');
            
            // Сортируем по времени последнего сообщения (новые выше)
            allChats.sort((a, b) => {
                const ta = a.lastMessageAt ? new Date(a.lastMessageAt) : (a.time ? new Date('1970/01/01 ' + a.time) : new Date(0));
                const tb = b.lastMessageAt ? new Date(b.lastMessageAt) : (b.time ? new Date('1970/01/01 ' + b.time) : new Date(0));
                return tb - ta;
            });

            // Разделяем на закреплённые и обычные
            let pinnedChats = [];
            let normalChats = [];

            // Фильтр по активной папке
            let chatsToShow = allChats;
            if (activeFolder) {
                const folders = JSON.parse(localStorage.getItem('craneapp_folders') || '[]');
                const folder = folders.find(f => f.id === activeFolder);
                if (folder) {
                    const ids = new Set(folder.chatIds || []);
                    chatsToShow = allChats.filter(c => ids.has(c.id));
                }
            }
            
            chatsToShow.forEach(function(c) {
                if (pinnedChatIds.has(c.id)) {
                    c.isPinned = true;
                    pinnedChats.push(c);
                } else {
                    normalChats.push(c);
                }
            });
            
            const filtered = filter ? normalChats.filter(function(c) { 
                return c.name.toLowerCase().indexOf(filter.toLowerCase()) >= 0; 
            }) : normalChats;
            
            let html = '';
            
            // Секция архивированных — ПЕРВОЙ (как в Telegram)
            if (archivedChats.length > 0 && !filter) {
                html += '<div class="archived-chats-section">';
                html += '<div class="archived-chats-header" onclick="toggleArchivedChats()">📁 Архивированные (' + archivedChats.length + ')</div>';
                html += '<div class="archived-chats-list" id="archivedChatsList" style="display: block;">';
                html += archivedChats.map(function(c) {
                    const name = c.name || c.title || tr('chatShort', 'Чат');
                    const ph = c.av || c.avatarUrl || (name[0] || '?');
                    return '<div class="chat-item" onclick="openArchivedChat(\'' + c.id + '\', \'' + name + '\')">' +
                        renderAvatar(ph, name[0], 'avatar') +
                        '<div class="chat-info"><div class="chat-name">' + name + '</div>' +
                        '<div class="chat-last">' + (c.lastMessage || tr('noMessages', 'Нет сообщений')) + '</div></div>' +
                        '<div class="chat-time">' + (c.time || '') + '</div>' +
                        '<div class="chat-actions"><button class="chat-action-icon" onclick="event.stopPropagation(); unarchiveChat(\'' + c.id + '\')" title="' + tr('restore', 'Восстановить') + '">📥</button></div>' +
                        '</div>';
                }).join('');
                html += '</div></div>';
            }

            // Секция закреплённых
            if (pinnedChats.length > 0 && !filter) {
                html += '<div class="pinned-chats-section" style="margin-bottom: 8px;">';
                html += '<div class="pinned-chats-header" style="color: var(--accent-color); font-weight: 600;">📌 Закреплённые</div>';
                
                html += pinnedChats.map(function(c) {
                    const isActive = activeChat && activeChat.id === c.id;
                    const ph = typeof c.av === 'string' && c.av.length <= 2 ? c.av : c.name[0];
                    return '<div class="chat-item pinned ' + (isActive ? 'active' : '') + '" ' +
                        'data-chat-type="' + (c.type || (c.isGroup ? 'group' : 'private')) + '" ' +
                        'onclick="openChat(\'' + c.id + '\', \'' + c.name + '\')" ' +
                        'oncontextmenu="showChatContextMenu(event, \'' + c.id + '\')" ' +
                        'style="background: linear-gradient(90deg, rgba(255,0,127,0.15) 0%, transparent 100%); border-left: 3px solid var(--accent-color);">' +
                        renderAvatar(c.av, ph, 'avatar') +
                        '<div class="chat-info">' +
                        '<div class="chat-name" style="color: var(--accent-color);"><span class="pin-icon">📌</span> ' + c.name + '</div>' +
                        '<div class="chat-last">' + (c.lastMessage || tr('noMessages', 'Нет сообщений')) + '</div>' +
                        '</div>' +
                        '<div class="chat-time">' + (c.time || '') + '</div>' +
                        '<div class="chat-actions">' +
                        '<button class="chat-action-icon pinned" onclick="event.stopPropagation(); unpinChat(\'' + c.id + '\')" title="' + tr('unpin', 'Открепить') + '" style="color: var(--accent-color);">📌</button>' +
                        '<button class="chat-action-icon archived" onclick="event.stopPropagation(); archiveChat(\'' + c.id + '\')" title="' + tr('archiveChat', 'Архивировать') + '">📁</button>' +
                        '</div>' +
                        '</div>';
                }).join('');
                
                html += '</div>';
            }
            
            // Секция обычных чатов
            if (filtered.length === 0 && !pinnedChats.length) {
                html += '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:14px;">' + tr('noChats', 'Нет чатов') + '</div>';
            } else {
                html += filtered.map(function(c) {
                    const isActive = activeChat && activeChat.id === c.id;
                    const ph = typeof c.av === 'string' && c.av.length <= 2 ? c.av : c.name[0];
                    const chatUser = chatUsers[c.id];
                    const isBlocked = chatUser && chatUser.isBlocked;
                    // Журавль для бота CraneApp или призрак для заблокированных
                    let avatarHtml;
                    if (isBlocked) {
                        avatarHtml = '<div class="avatar"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18v-6a3 3 0 0 1 6 0v6"/><path d="M6 18a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v6z"/><path d="M12 2a5 5 0 0 0-5 5v2h10V7a5 5 0 0 0-5-5z"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="16" r="1"/></svg></div>';
                    } else if (c.isBot || c.badge === 'verified' && c.name === 'CraneApp') {
                        avatarHtml = '<div class="avatar"><img class="avatar-img" src="/logo.png" alt=""></div>';
                    } else {
                        avatarHtml = renderAvatar(c.av, ph, 'avatar');
                    }
                    const displayName = isBlocked ? tr('blockedAccount', 'Заблокированный аккаунт') : c.name;
                    return '<div class="chat-item ' + (isActive ? 'active' : '') + '" ' +
                        'data-chat-type="' + (c.type || (c.isGroup ? 'group' : 'private')) + '" ' +
                        'onclick="openChat(\'' + c.id + '\', \'' + displayName + '\')" ' +
                        'oncontextmenu="showChatContextMenu(event, \'' + c.id + '\')">' +
                        avatarHtml +
                        '<div class="chat-info">' +
                        '<div class="chat-name">' + displayName + (c.badge || c.isBot ? renderBadge(c.badge, c.isBot) : '') + '</div>' +
                        '<div class="chat-last">' + (c.lastMessage || tr('noMessages', 'Нет сообщений')) + '</div>' +
                        '</div>' +
                        '<div class="chat-time">' + (c.time || '') + '</div>' +
                        '<div class="chat-actions">' +
                        '<button class="chat-action-icon" onclick="event.stopPropagation(); pinChat(\'' + c.id + '\')" title="' + tr('pin', 'Закрепить') + '">📌</button>' +
                        '<button class="chat-action-icon archived" onclick="event.stopPropagation(); archiveChat(\'' + c.id + '\')" title="' + tr('archiveChat', 'Архивировать') + '">📁</button>' +
                        '</div>' +
                        '</div>';
                }).join('');
            }
            
            list.innerHTML = html;
        }

        document.getElementById('searchInput').addEventListener('input', function(e) {
            // handled by handleUnifiedSearch via oninput
        });

        let unifiedSearchTimeout;
        function handleUnifiedSearch(q) {
            clearTimeout(unifiedSearchTimeout);
            if (!q) { renderChatList(); return; }
            unifiedSearchTimeout = setTimeout(async () => {
                // Фильтруем локальные чаты
                renderChatList(q);
                // Ищем пользователей если запрос похож на юзернейм или имя
                if (q.length >= 2) {
                    try {
                        const res = await fetch('/api/v1/users/search?q=' + encodeURIComponent(q.replace('@','')), {
                            headers: { 'Authorization': 'Bearer ' + token }
                        });
                        if (!res.ok) return;
                        const data = await res.json();
                        const users = (data.users || []).filter(u => u.id !== user.id);
                        if (users.length) {
                        // Добавляем найденных пользователей в список чатов как отдельную секцию
                        const list = document.getElementById('chatList');
                        let section = document.getElementById('userSearchResults');
                        if (!section) {
                            section = document.createElement('div');
                            section.id = 'userSearchResults';
                            list.appendChild(section);
                        }
                        section.innerHTML = '<div style="padding:8px 16px 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);">' + tr('people', 'Люди') + '</div>' +
                            users.map(u => {
                                // Журавль для бота CraneApp
                                const av = u.username === 'craneapp_bot'
                                    ? '<img src="/logo.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
                                    : (u.avatar_url && isImage(u.avatar_url)
                                        ? '<img src="'+u.avatar_url+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
                                        : '<div style="width:100%;height:100%;background:linear-gradient(135deg,#FF007F,#9D00FF);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;">'+(u.firstName||u.username||'U')[0]+'</div>');
                                const displayName = u.firstName && u.lastName ? u.firstName + ' ' + u.lastName : (u.firstName || u.username || tr('user', 'Пользователь'));
                                return '<div class="chat-item" onclick="startChatFromSearch(\''+u.id+'\',\''+displayName.replace(/'/g,"\\'")+'\')" style="padding:12px 16px;cursor:pointer;transition:background 0.2s;display:flex;align-items:center;gap:12px;">' +
                                    '<div style="width:48px;height:48px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--bg-tertiary);">'+av+'</div>' +
                                    '<div style="flex:1;min-width:0;">' +
                                        '<div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">'+displayName+'</div>' +
                                        '<div style="font-size:13px;color:var(--text-muted);">@'+(u.username||'')+'</div>' +
                                    '</div>' +
                                '</div>';
                            }).join('');
                        }
                    } catch (err) {
                        console.error('User search error:', err);
                    }
                }
                // Ищем по сообщениям
                try {
                    const res = await fetch('/api/v1/messages/search?q=' + encodeURIComponent(q), {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (!res.ok) {
                        console.error('Message search failed with status:', res.status);
                        return;
                    }
                    const data = await res.json();
                    const messages = data.messages || [];
                    if (!messages.length) return;

                    const list = document.getElementById('chatList');
                    let section = document.getElementById('messageSearchResults');
                    if (!section) {
                        section = document.createElement('div');
                        section.id = 'messageSearchResults';
                        list.appendChild(section);
                    }

                    section.innerHTML = '<div style="padding:8px 16px 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);">' + tr('messagesLabel', 'Сообщения') + '</div>' +
                        messages.map(m => {
                            const chatName = m.chatType === 'private'
                                ? (m.senderFirstName && m.senderLastName ? m.senderFirstName + ' ' + m.senderLastName : (m.senderFirstName || m.senderUsername || tr('user', 'Пользователь')))
                                : m.chatName || tr('chatShort', 'Чат');
                            const preview = m.content.length > 50 ? m.content.substring(0, 50) + '...' : m.content;
                            const time = new Date(m.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                            return '<div class="chat-item" onclick="openChatFromMessageSearch(\''+m.chatId+'\',\''+m.id+'\')" style="padding:12px 16px;cursor:pointer;transition:background 0.2s;">' +
                                '<div style="flex:1;min-width:0;overflow:hidden;">' +
                                    '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+chatName+'</div>' +
                                    '<div style="font-size:13px;color:var(--text-primary);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+preview+'</div>' +
                                    '<div style="font-size:11px;color:var(--text-muted);">'+time+'</div>' +
                                '</div>' +
                            '</div>';
                        }).join('');
                } catch (err) {
                    console.error('Message search error:', err);
                }
            }, 300);
        }

        function escapeAttr(s) { return (s||'').replace(/'/g,"\\'"); }
        function escapeHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

        async function startChatFromSearch(userId, name, username) {
            document.getElementById('searchInput').value = '';
            handleUnifiedSearch('');
            try {
                const res = await fetch('/api/v1/chats/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ type: 'private', participants: [userId] })
                });
                const data = await res.json();
                if (data.chatId) {
                    await loadChats();
                    openChat(data.chatId, name);
                }
            } catch (_) { showToast('error', 'Ошибка', '❌'); }
        }

        async function openChatFromMessageSearch(chatId, messageId) {
            document.getElementById('searchInput').value = '';
            handleUnifiedSearch('');
            const chat = allChats.find(c => c.id === chatId);
            const chatName = chat ? chat.name : 'Чат';
            openChat(chatId, chatName);
            // После загрузки сообщений прокрутим к нужному
            setTimeout(() => {
                const msgEl = document.querySelector('[data-message-id="' + messageId + '"]');
                if (msgEl) {
                    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    msgEl.style.background = 'rgba(255, 0, 127, 0.2)';
                    setTimeout(() => msgEl.style.background = '', 2000);
                }
            }, 500);
        }

        // ============================================
        // OPEN/CLOSE CHAT
        // ============================================
        async function openChat(id, name) {
            // Сохраняем черновик предыдущего чата
            const advSettings = JSON.parse(localStorage.getItem('craneapp_advanced_settings') || '{}');
            const saveDrafts = advSettings.saveDrafts !== false;
            if (saveDrafts && activeChat) {
                const draft = document.getElementById('msgInput').innerText;
                if (draft) localStorage.setItem('crane_draft_' + activeChat.id, draft);
                else localStorage.removeItem('crane_draft_' + activeChat.id);
            }

            activeChat = { id: id, name: name, type: allChats.find(c => c.id === id)?.type || 'private' };

            // Показываем кнопку участников только для групп
            const membersBtn = document.getElementById('membersBtn');
            if (membersBtn) membersBtn.style.display = activeChat.type === 'group' ? 'flex' : 'none';

            messagesData = {};
            renderChatList();

            // Проверяем статус мута
            checkMuteStatus();
            
            if (window.innerWidth < 768) {
                document.getElementById('sidebar').classList.add('hidden');
                document.body.classList.add('chat-open');
            }

            document.getElementById('noChat').style.display = 'none';
            document.getElementById('chatView').classList.add('active');

            // Имя + бейджи в хедере
            const chatUserForBadge = chatUsers[id];
            const isBlocked = chatUserForBadge && chatUserForBadge.isBlocked;
            const displayName = isBlocked ? 'Заблокированный аккаунт' : (chatUserForBadge?.name || name);
            const chatBadgesHtml = chatUserForBadge && !isBlocked
                ? renderBadges(chatUserForBadge.badges || [], chatUserForBadge.isBot, chatUserForBadge.isPremium, false, false)
                : '';
            const chatNameEl = document.getElementById('chatName');
            if (chatBadgesHtml) {
                chatNameEl.innerHTML = displayName + chatBadgesHtml;
            } else {
                chatNameEl.textContent = displayName;
            }

            // Кнопка support requests — только разработчикам в чате с ботом
            const supportBtn = document.getElementById('supportRequestsBtn');
            const reportsBtn = document.getElementById('reportsBtn');
            const isBotChat = chatUserForBadge && chatUserForBadge.isBot;
            const isDevUser = ['adm1','admin','admin1','qzlfee'].includes((user.username||'').toLowerCase());
            if (isBotChat && isDevUser) {
                supportBtn.style.display = 'flex';
                reportsBtn.style.display = 'flex';
            } else {
                supportBtn.style.display = 'none';
                reportsBtn.style.display = 'none';
            }
            // Скрываем панель support и reports при смене чата
            document.getElementById('supportPanel').style.display = 'none';
            document.getElementById('reportsPanel').style.display = 'none';
            document.getElementById('messages').style.display = 'flex';

            // Показываем баннер если есть активный support request
            const activeSupportRaw = localStorage.getItem('craneapp_active_support_request');
            const existingBanner = document.getElementById('supportReplyBanner');
            if (existingBanner) existingBanner.remove();
            if (isBotChat && isDevUser && activeSupportRaw) {
                try {
                    const activeSupport = JSON.parse(activeSupportRaw);
                    const banner = document.createElement('div');
                    banner.id = 'supportReplyBanner';
                    banner.style.cssText = 'background:linear-gradient(135deg,rgba(255,0,127,.15),rgba(157,0,255,.15));border-bottom:1px solid rgba(255,0,127,.3);padding:8px 16px;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px';
                    banner.innerHTML = '<span>📨 Режим ответа на запрос поддержки. Ваш ответ будет анонимно переслан пользователю.</span>'
                        + '<button onclick="localStorage.removeItem(\'craneapp_active_support_request\');this.parentNode.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;flex-shrink:0">✕</button>';
                    const msgContainer = document.getElementById('messagesContainer');
                    msgContainer.parentNode.insertBefore(banner, msgContainer);
                } catch (_) {}
            }
            
            const chatUser = chatUsers[id];
            const avatarEl = document.getElementById('chatAvatar');
            const statusEl = document.getElementById('chatStatus');

            // Для групп — берём аватарку из allChats
            const chatInfo = allChats.find(c => c.id === id);
            const groupAvatarUrl = chatInfo?.avatarUrl || chatInfo?.av;

            if (activeChat && activeChat.type === 'group') {
                if (groupAvatarUrl && isImage(groupAvatarUrl)) {
                    avatarEl.innerHTML = '<img class="avatar-img" src="' + groupAvatarUrl + '" alt="">';
                } else {
                    avatarEl.innerHTML = '<span>' + (name[0] || '💬') + '</span>';
                }
            } else if (chatUser && chatUser.isBlocked) {
                // Призрак для заблокированных
                avatarEl.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18v-6a3 3 0 0 1 6 0v6"/><path d="M6 18a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v6z"/><path d="M12 2a5 5 0 0 0-5 5v2h10V7a5 5 0 0 0-5-5z"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="16" r="1"/></svg>';
            } else if (chatUser && chatUser.username === 'craneapp_bot') {
                // Журавль для бота CraneApp
                avatarEl.innerHTML = '<img class="avatar-img" src="/logo.png" alt="">';
            } else if (chatUser && isImage(chatUser.av)) {
                avatarEl.innerHTML = '<img class="avatar-img" src="' + chatUser.av + '" alt="">';
            } else {
                const ph = chatUser?.av || (name[0] || '?');
                avatarEl.innerHTML = '<span>' + ph + '</span>';
            }
            
            // Обновляем статус онлайн
            if (chatUser) {
                if (chatUser.isBlocked) {
                    statusEl.textContent = 'Аккаунт заблокирован';
                    statusEl.style.color = '#FF4B4B';
                } else {
                    updateChatUserStatus(chatUser.id);
                }
            } else if (activeChat && activeChat.type === 'group') {
                statusEl.style.color = 'var(--text-muted)';
                fetch('/api/v1/chats/' + id + '/members-online', {
                    headers: { 'Authorization': 'Bearer ' + token }
                }).then(r => r.ok ? r.json() : null).then(data => {
                    if (data && data.total > 0) {
        statusEl.textContent = (window.i18n?.tc ? window.i18n.tc('membersCount', data.total) : (data.total + ' ' + pluralMembers(data.total))) + (data.online > 0 ? ', ' + data.online + ' ' + (window.i18n?.t('online') || 'онлайн') : '');
                        statusEl.style.color = 'var(--text-muted)';
                    }
                }).catch(() => { statusEl.textContent = ''; });
            } else {
                statusEl.textContent = '';
            }
            
            loadMessages();
            loadPinnedMessage(id);

            // E2E: инициализируем ключ для чата и показываем индикатор
            if (window.E2E) {
                window.E2E.getSessionKey(id, token).then(key => {
                    const ind = document.getElementById('e2eIndicator');
                    if (ind) ind.style.display = key ? 'flex' : 'none';
                }).catch(() => {});
            }

            // Восстанавливаем черновик
            if (saveDrafts) {
                const draft = localStorage.getItem('crane_draft_' + id) || '';
                document.getElementById('msgInput').innerText = draft;
            }

            // Применяем autoplay GIF
            const autoplayGifs = advSettings.autoplayGifs !== false;
            document.querySelectorAll('img[src$=".gif"]').forEach(img => {
                img.style.animationPlayState = autoplayGifs ? 'running' : 'paused';
            });
        }

        async function updateChatUserStatus(userId) {
            if (!userId) return;

            const statusEl = document.getElementById('chatStatus');

            // Если это бот — показываем "бот" вместо статуса
            const chatUser = chatUsers[activeChat && activeChat.id];
            if (chatUser && chatUser.isBot) {
                statusEl.textContent = 'бот';
                statusEl.style.color = 'var(--accent-color)';
                return;
            }

            try {
                const res = await fetch('/api/v1/users/' + userId + '/status', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                
                const _isPrivate = activeChat && activeChat.type !== 'group';
                const _audioBtn = document.getElementById('audioCallBtn');
                const _videoBtn = document.getElementById('videoCallBtn');

                if (data.isOnline) {
                    statusEl.textContent = 'онлайн';
                    statusEl.style.color = 'var(--success-color)';
                } else {
                    const lastSeen = data.lastSeen ? new Date(data.lastSeen) : null;
                    statusEl.style.color = 'var(--text-muted)';
                    if (data.lastSeen === null && !data.isOnline) {
                        // Пользователь скрыл последний визит
                        statusEl.textContent = 'последний визит скрыт';
                    } else if (lastSeen) {
                        const now = new Date();
                        const diff = now - lastSeen;
                        const minutes = Math.floor(diff / 60000);
                        const hours = Math.floor(diff / 3600000);
                        const days = Math.floor(diff / 86400000);
                        
                        if (minutes < 1) {
                            statusEl.textContent = 'только что';
                        } else if (minutes < 60) {
                            statusEl.textContent = minutes + ' мин. назад';
                        } else if (hours < 24) {
                            statusEl.textContent = hours + ' ч. назад';
                        } else if (days < 7) {
                            statusEl.textContent = days + ' дн. назад';
                        } else {
                            statusEl.textContent = 'был(а) давно';
                        }
                    } else {
                        statusEl.textContent = 'был(а) недавно';
                    }
                    statusEl.style.color = 'var(--text-muted)';
                }
            } catch (e) {
                statusEl.textContent = '';
            }
        }

        function closeChat() {
            activeChat = null;
            renderChatList();

            document.getElementById('sidebar').classList.remove('hidden');
            document.body.classList.remove('chat-open');

            document.getElementById('noChat').style.display = 'flex';
            document.getElementById('chatView').classList.remove('active');
            cancelReply();
        }

        // ============================================
        // MESSAGES
        // ============================================
        async function loadMessages() {
            if (!activeChat) return;
            
            const messagesEl = document.getElementById('messages');
            messagesEl.innerHTML = '';
            
            try {
                const res = await fetch('/api/v1/messages/' + activeChat.id, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                
                if (data.messages && data.messages.length > 0) {
                    // Расшифровываем сообщения если E2E включён
                    const decrypted = await Promise.all(data.messages.map(async m => {
                        if (m.isEncrypted && m.encryptionIv && window.E2E) {
                            try {
                                m.content = await window.E2E.decrypt(m.content, m.encryptionIv, activeChat.id, token);
                            } catch (_) {}
                        }
                        // Расшифровываем replyToContent
                        if (m.replyToEncrypted && m.replyToIv && window.E2E) {
                            try {
                                m.replyToContent = await window.E2E.decrypt(m.replyToContent, m.replyToIv, activeChat.id, token);
                            } catch (_) {}
                        }
                        return m;
                    }));
                    decrypted.forEach(function(m) {
                        messagesData[m.id] = m;
                    });
                    for (const m of decrypted) {
                        messagesEl.appendChild(await createMessageElement(m));
                    }
                } else {
                    messagesEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:14px;">' + tr('noMessages', 'Нет сообщений') + '</div>';
                }
                scrollToBottom();
            } catch (err) {
                console.error('Load messages error:', err);
            }
        }

                // ============================================
        // CONTEXT MENU
        // ============================================
        // Проверка, является ли ID валидным UUID (а не временным ID)
        function isValidUUID(id) {
            if (!id || typeof id !== 'string') return false;
            // UUID имеет формат xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
            // или не начинается с "temp-"
            return !id.startsWith('temp-') && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        }

        function showMessageContextMenu(e, messageId, element, text, senderName) {
            // Для pending сообщений показываем только копирование
            if (!isValidUUID(messageId)) {
                currentMessageId = messageId;
                currentMessageElement = element;
                // Показываем упрощённое меню только с копированием
                const menu = document.getElementById('messageContextMenu');
                const x = e.pageX || (e.touches && e.touches[0].pageX) || e.clientX || 0;
                const y = e.pageY || (e.touches && e.touches[0].pageY) || e.clientY || 0;
                menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
                menu.style.top = Math.min(y, window.innerHeight - 250) + 'px';
                // Скрываем все кроме копирования
                menu.querySelectorAll('.context-menu-item').forEach(item => {
                    item.style.display = item.onclick && item.onclick.toString().includes('copyMessageText') ? 'flex' : 'none';
                });
                menu.classList.add('active');
                return;
            }

            // Восстанавливаем все пункты меню
            document.getElementById('messageContextMenu').querySelectorAll('.context-menu-item').forEach(item => {
                item.style.display = '';
            });
            
            currentMessageId = messageId;
            currentMessageElement = element;

            // Показываем кнопку скачать только для фото/гифок
            const msg = messagesData[messageId];
            const downloadItem = document.getElementById('downloadMediaItem');
            const copyItem = document.getElementById('copyTextItem');
            const copyLabel = document.getElementById('copyItemLabel');
            const isMedia = msg && (msg.type === 'image' || msg.type === 'photo' || msg.type === 'gif');
            if (downloadItem) downloadItem.style.display = isMedia ? 'flex' : 'none';
        if (copyLabel) copyLabel.textContent = isMedia ? (window.i18n?.t('copyPhoto') || 'Скопировать фото') : (window.i18n?.t('copyText') || 'Копировать текст');
            if (copyItem) copyItem.onclick = isMedia ? copyMessagePhoto : copyMessageText;
            
            const menu = document.getElementById('messageContextMenu');
            const x = e.pageX || (e.touches && e.touches[0].pageX) || e.clientX || 0;
            const y = e.pageY || (e.touches && e.touches[0].pageY) || e.clientY || 0;
            
            // Сначала показываем меню чтобы получить его размеры
            menu.style.visibility = 'hidden';
            menu.style.display = 'block';
            const menuW = menu.offsetWidth || 220;
            const menuH = menu.offsetHeight || 300;
            menu.style.display = '';
            menu.style.visibility = '';

            // Позиционируем с учётом границ экрана
            let left = x;
            let top = y;

            // Не выходим за правый край
            if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
            if (left < 8) left = 8;

            // Не выходим за нижний край — показываем выше курсора
            if (top + menuH > window.innerHeight - 8) top = y - menuH;
            if (top < 8) top = 8;

            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
            menu.classList.add('active');
            
            const isSender = element.classList.contains('outgoing');
            const deleteForAll = menu.querySelector('.context-menu-item.danger');
            if (deleteForAll) {
                deleteForAll.style.display = isSender ? 'flex' : 'none';
            }
            // Редактировать можно только свои сообщения (не бота)
            const editItem = menu.querySelector('.context-menu-item[onclick="editMessage()"]');
            const msgData = messagesData[currentMessageId];
            const isBotMessage = msgData && (msgData.senderUsername === 'craneapp_bot' || msgData.isBot === true);
            const isOwnMessage = msgData && (msgData.senderId === user.id || msgData.outgoing) && !isBotMessage;
            if (editItem) editItem.style.display = isOwnMessage ? 'flex' : 'none';

            // Подсвечиваем уже поставленные реакции
            updateContextMenuReactions(messageId);
        }

        document.addEventListener('click', function(e) {
            const menu = document.getElementById('messageContextMenu');
            // Не закрываем если клик внутри меню
            if (menu.contains(e.target)) return;
            menu.classList.remove('active');
            // Сбрасываем расширенные реакции
            const reactionsRow = document.getElementById('contextReactions');
            if (reactionsRow) {
                reactionsRow.classList.remove('expanded');
                reactionsRow.querySelectorAll('.context-reaction-extra').forEach(el => el.remove());
                const moreBtn = reactionsRow.querySelector('.context-reaction-more');
                if (moreBtn) moreBtn.textContent = '＋';
            }
        });

        function replyToMessage() {
            // Проверка что messageId валиден
            if (!isValidUUID(currentMessageId)) {
                showToast('info', 'Сообщение ещё отправляется...', '⏳');
                return;
            }
            document.getElementById('messageContextMenu').classList.remove('active');
            const msg = messagesData[currentMessageId];
            const name = msg && (msg.senderName || msg.senderFirstName) || tr('user', 'Пользователь');
            const text = msg && (msg.content || msg.text) || '';
            setReplyTo(currentMessageId, name, text);
        }

        function editMessage() {
            // Проверка что messageId валиден
            if (!isValidUUID(currentMessageId)) {
                showToast('info', 'Сообщение ещё отправляется...', '⏳');
                return;
            }
            document.getElementById('messageContextMenu').classList.remove('active');
            document.getElementById('editMessageText').value = currentMessageElement.querySelector('.message-text').textContent;
            document.getElementById('editMessageModal').classList.add('active');
            setTimeout(function() {
                document.getElementById('editMessageText').focus();
            }, 100);
        }

        function closeEditMessageModal() {
            document.getElementById('editMessageModal').classList.remove('active');
        }

        function saveEditedMessage() {
            const newText = document.getElementById('editMessageText').value.trim();
            if (!newText) {
                showToast('error', 'Введите текст', '⚠️');
                return;
            }
            
            // Проверка что messageId валиден
            if (!isValidUUID(currentMessageId)) {
                showToast('error', 'Сообщение ещё отправляется', '⚠️');
                return;
            }
            
            fetch('/api/v1/messages/' + currentMessageId, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ content: newText })
            }).then(function(r) { return r.json(); }).then(function(d) {
                if (d.success) {
                    currentMessageElement.querySelector('.message-text').innerHTML = renderFormattedText(newText);
                    closeEditMessageModal();
                    showToast('success', 'Сохранено', '✓');
                } else {
                    showToast('error', d.error || 'Ошибка', '❌');
                }
            }).catch(function(err) {
                showToast('error', 'Ошибка сохранения', '❌');
            });
        }
                
        function deleteMessage(forEveryone) {
            // Проверка что messageId валиден
            if (!isValidUUID(currentMessageId)) {
                showToast('info', 'Сообщение ещё отправляется...', '⏳');
                return;
            }
            document.getElementById('messageContextMenu').classList.remove('active');
            
            document.getElementById('confirmTitle').textContent = forEveryone ? (window.i18n?.t('deleteForEveryoneQuestion') || 'Удалить для всех?') : (window.i18n?.t('deleteQuestion') || 'Удалить?');
            document.getElementById('confirmText').textContent = 'Это действие нельзя отменить.';
            
            document.getElementById('confirmBtn').onclick = function() {
                performDelete(forEveryone);
                closeConfirmModal();
            };
            
            document.getElementById('confirmModal').classList.add('active');
        }

        async function performDelete(forEveryone) {
            // Проверка что messageId валиден
            if (!isValidUUID(currentMessageId)) {
                showToast('error', 'Сообщение ещё отправляется', '⚠️');
                return;
            }
            try {
                const res = await fetch('/api/v1/messages/' + currentMessageId + '?forEveryone=' + forEveryone, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    currentMessageElement.remove();
                    delete messagesData[currentMessageId];
                    showToast('success', 'Удалено', '✓');
                }
            } catch (err) {
                showToast('error', 'Ошибка', '❌');
            }
        }

        // ============================================
        // PIN MESSAGE
        // ============================================
        // Обновляем handleWsMessage для обработки событий закрепления
        function copyMessageText() {
            // Проверка что messageId валиден
            if (!isValidUUID(currentMessageId)) {
                showToast('info', 'Сообщение ещё отправляется...', '⏳');
                return;
            }
            document.getElementById('messageContextMenu').classList.remove('active');
            const text = currentMessageElement.querySelector('.message-text').textContent;
            navigator.clipboard.writeText(text);
            showToast('success', 'Скопировано', '📋');
        }

        // ============================================
        // PIN MESSAGE
        // ============================================
        async function pinMessage() {
            document.getElementById('messageContextMenu').classList.remove('active');
            
            if (!currentMessageId || !currentMessageElement) return;
            
            try {
                const res = await fetch('/api/v1/messages/' + currentMessageId + '/pin', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                const data = await res.json();
                
                if (res.ok && data.success) {
                    // Добавляем визуальный индикатор
                    currentMessageElement.classList.add('pinned');
                    
                    // Обновляем UI - показываем закрепленное сообщение
                    showPinnedMessage(data.message);
                    
                    showToast('success', 'Сообщение закреплено', '📌');
                } else {
                    showToast('error', data.error || 'Ошибка', '❌');
                }
            } catch (err) {
                console.error('Pin error:', err);
                showToast('error', 'Ошибка закрепления', '❌');
            }
        }

        async function unpinMessage() {
            if (!currentMessageId) return;
            
            try {
                const res = await fetch('/api/v1/messages/' + currentMessageId + '/pin', {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                if (res.ok) {
                    // Убираем визуальный индикатор
                    if (currentMessageElement) {
                        currentMessageElement.classList.remove('pinned');
                    }
                    
                    // Скрываем закрепленное сообщение
                    hidePinnedMessage();
                    
                    showToast('success', 'Сообщение откреплено', '📌');
                }
            } catch (err) {
                showToast('error', 'Ошибка', '❌');
            }
        }

        function showPinnedMessage(msg) {
            // Используем новую панельку в header
            const barEl = document.getElementById('pinnedMessageBar');
            const textEl = document.getElementById('pinnedMessageBarText');
            
            if (!barEl || !textEl) {
                // Если панельки нет, создаем её
                createPinnedMessageBar();
            }
            
            const pinnedBar = document.getElementById('pinnedMessageBar');
            const pinnedText = document.getElementById('pinnedMessageBarText');
            
            if (msg.type === 'image' || msg.type === 'photo') {
                pinnedText.innerHTML = '<span>📷</span> Фото';
            } else if (msg.type === 'video') {
                pinnedText.innerHTML = '<span>🎬</span> Видео';
            } else if (msg.type === 'gif') {
                pinnedText.innerHTML = '<span>🎞</span> GIF';
            } else if (msg.type === 'sticker') {
                pinnedText.innerHTML = '<span>🎨</span> Стикер';
            } else if (msg.type === 'voice') {
                pinnedText.innerHTML = '<span>🎤</span> Голосовое';
            } else {
                const text = msg.content || '';
            pinnedText.innerHTML = '<span>📌</span> <strong>' + (msg.senderFirstName || msg.senderUsername || window.i18n?.t('you') || 'Вы') + ':</strong> ' + (text.length > 60 ? text.substring(0, 60) + '...' : text);
            }
            
            pinnedBar.classList.add('active');
            
            // Также обновляем старую панель (если есть)
            const container = document.getElementById('pinnedMessageContainer');
            if (container) {
                const contentEl = document.getElementById('pinnedMessageContent');
                if (contentEl) {
                    contentEl.innerHTML = pinnedText.innerHTML;
                }
                container.classList.add('active');
            }
        }

        function hidePinnedMessage() {
            // Скрываем новую панельку в header
            const barEl = document.getElementById('pinnedMessageBar');
            if (barEl) {
                barEl.classList.remove('active');
            }
            
            // Также скрываем старую панель (если есть)
            const container = document.getElementById('pinnedMessageContainer');
            if (container) {
                container.classList.remove('active');
            }
        }

        function hidePinnedMessageBar() {
            hidePinnedMessage();
            event.stopPropagation();
        }

        function createPinnedMessageBar() {
            const chatView = document.getElementById('chatView');
            if (!chatView) return;
            
            // Проверяем, существует ли уже панель
            if (document.getElementById('pinnedMessageBar')) return;
            
            const chatHeader = document.getElementById('chatHeader');
            if (!chatHeader) return;
            
            const bar = document.createElement('div');
            bar.id = 'pinnedMessageBar';
            bar.className = 'pinned-message-bar';
            bar.setAttribute('onclick', 'openPinnedMessage()');
            bar.innerHTML = 
                '<div class="pinned-message-bar-icon">📌</div>' +
                '<div class="pinned-message-bar-text" id="pinnedMessageBarText">Закрепленное сообщение</div>' +
                '<button class="pinned-message-bar-close" onclick="hidePinnedMessageBar()">×</button>';
            
            chatHeader.parentNode.insertBefore(bar, chatHeader.nextSibling);
        }

        function createPinnedMessageContainer() {
            const chatHeader = document.getElementById('chatHeader');
            if (!chatHeader) return;
            
            const pinnedEl = document.createElement('div');
            pinnedEl.id = 'pinnedMessageContainer';
            pinnedEl.className = 'pinned-message-container';
            pinnedEl.innerHTML = 
                '<div id="pinnedMessageContent" onclick="openPinnedMessage()"></div>' +
                '<button class="pinned-close-btn" onclick="hidePinnedMessage()">✕</button>';
            
            chatHeader.parentNode.insertBefore(pinnedEl, chatHeader.nextSibling);
        }

        function openPinnedMessage() {
            // Прокрутка к закрепленному сообщению
            const pinnedMsgEl = document.querySelector('.message.pinned');
            if (pinnedMsgEl) {
                pinnedMsgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                pinnedMsgEl.classList.add('highlight');
                setTimeout(function() {
                    pinnedMsgEl.classList.remove('highlight');
                }, 2000);
            }
        }

        // Загрузить закрепленное сообщение при открытии чата
        async function loadPinnedMessage(chatId) {
            try {
                const res = await fetch('/api/v1/chats/' + chatId + '/pinned', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                
                const data = await res.json();
                
                if (data.message) {
                    showPinnedMessage(data.message);
                    
                    // Добавляем класс pinned соответствующему сообщению
                    const msgEl = document.querySelector('[data-message-id="' + data.message.id + '"]');
                    if (msgEl) {
                        msgEl.classList.add('pinned');
                    }
                } else {
                    hidePinnedMessage();
                }
            } catch (err) {
                console.error('Load pinned error:', err);
            }
        }

        // Обновляем handleWsMessage для обработки событий закрепления
        function copyMessageText() {
            document.getElementById('messageContextMenu').classList.remove('active');
            const text = currentMessageElement.querySelector('.message-text').textContent;
            navigator.clipboard.writeText(text);
            showToast('success', 'Скопировано', '📋');
        }

        // ============================================
        // TEXT FORMATTING
        // ============================================
        function formatSelectedText(format) {
            document.getElementById('messageContextMenu').classList.remove('active');
            
            const input = document.getElementById('msgInput');
            const selection = window.getSelection();
            
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                showToast('info', 'Выделите текст для форматирования', '⚠️');
                return;
            }
            
            const selectedText = selection.toString();
            let prefix = '', suffix = '';
            
            switch (format) {
                case 'bold':   prefix = '**'; suffix = '**'; break;
                case 'italic': prefix = '_';  suffix = '_';  break;
                case 'spoiler':prefix = '||'; suffix = '||'; break;
            }
            
            document.execCommand('insertText', false, prefix + selectedText + suffix);
            input.focus();
        }

        // Функция для рендеринга форматированного текста в сообщениях
        function renderFormattedText(text) {
            if (!text) return '';
            
            // Экранируем HTML
            let escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            // Обрабатываем форматирование
            // Жирный: **текст**
            escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<span class="bold">$1</span>');
            
            // Курсив: _текст_
            escaped = escaped.replace(/_(.+?)_/g, '<span class="italic">$1</span>');
            
            // Скрытый текст: ||текст||
            escaped = escaped.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
            
            return escaped;
        }

        // ============================================
        // FORWARD MESSAGE
        // ============================================
        let forwardMessageData = null;

        function openForwardModal() {
            document.getElementById('messageContextMenu').classList.remove('active');
            
            const msg = messagesData[currentMessageId];
            if (!msg) return;
            
            forwardMessageData = {
                content: msg.content || msg.text || '',
                type: msg.type,
                mediaUrl: msg.mediaUrl,
                senderName: msg.senderFirstName || msg.sender?.firstName || msg.senderName || 'Пользователь'
            };
            
            // Показываем превью сообщения
            const previewEl = document.getElementById('forwardPreview');
            if (forwardMessageData.type === 'image' || forwardMessageData.type === 'photo') {
                previewEl.innerHTML = '<img src="' + forwardMessageData.mediaUrl + '" style="max-width: 60px; max-height: 60px; border-radius: 8px; vertical-align: middle; margin-right: 8px;"> <span>Фото</span>';
            } else if (forwardMessageData.type === 'video') {
                previewEl.innerHTML = '<span>🎬</span> <span>Видео</span>';
            } else if (forwardMessageData.type === 'gif') {
                previewEl.innerHTML = '<span>🎞</span> <span>GIF</span>';
            } else if (forwardMessageData.type === 'sticker') {
                previewEl.innerHTML = '<span>🎨</span> <span>Стикер</span>';
            } else {
                previewEl.innerHTML = '<strong>' + forwardMessageData.senderName + ':</strong> ' + (forwardMessageData.content.substring(0, 100) || 'Текстовое сообщение');
            }
            
            // Загружаем список чатов
            renderForwardChatsList();
            
            document.getElementById('forwardModal').classList.add('active');
            
            // Добавляем обработчик поиска
            setTimeout(function() {
                document.getElementById('forwardSearchInput').focus();
            }, 100);
        }

        function closeForwardModal() {
            document.getElementById('forwardModal').classList.remove('active');
            document.getElementById('forwardSearchInput').value = '';
            document.getElementById('forwardChatsList').innerHTML = '';
            forwardMessageData = null;
        }

        function renderForwardChatsList(filter) {
            const listEl = document.getElementById('forwardChatsList');
            filter = (filter || '').toLowerCase();
            
            // Объединяем обычные и архивные чаты
            let allChatsForForward = [...allChats];
            
            // Добавляем архивные чаты, которых нет в обычном списке
            archivedChats.forEach(function(ac) {
                if (!allChatsForForward.some(function(c) { return c.id === ac.id; })) {
                    allChatsForForward.push(ac);
                }
            });
            
            // Фильтруем
            let filteredChats = allChatsForForward;
            if (filter) {
                filteredChats = allChatsForForward.filter(function(c) {
                    return c.name && c.name.toLowerCase().indexOf(filter) >= 0;
                });
            }
            
            if (filteredChats.length === 0) {
                listEl.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);">' + tr('noChats', 'Нет чатов') + '</div>';
                return;
            }
            
            listEl.innerHTML = filteredChats.map(function(c) {
                const ph = typeof c.av === 'string' && c.av.length <= 2 ? c.av : (c.name ? c.name[0] : '?');
                return '<div class="forward-chat-item" onclick="forwardToChat(\'' + c.id + '\', \'' + c.name + '\')">' +
                    '<div class="avatar">' + (c.av && c.av.startsWith('http') ? '<img src="' + c.av + '" alt="">' : ph) + '</div>' +
                    '<div class="forward-chat-info">' +
                    '<div class="forward-chat-name">' + c.name + '</div>' +
                    '<div class="forward-chat-last">' + (c.lastMessage || tr('noMessages', 'Нет сообщений')) + '</div>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }

        async function forwardToChat(chatId, chatName) {
            if (!forwardMessageData) return;
            
            try {
                let messageContent = '';
                let messageType = 'text';
                let mediaUrl = null;
                
                if (forwardMessageData.type === 'image' || forwardMessageData.type === 'photo') {
                    messageType = 'image';
                    mediaUrl = forwardMessageData.mediaUrl;
                    messageContent = 'Фото';
                } else if (forwardMessageData.type === 'video') {
                    messageType = 'video';
                    mediaUrl = forwardMessageData.mediaUrl;
                    messageContent = 'Видео';
                } else if (forwardMessageData.type === 'gif') {
                    messageType = 'gif';
                    mediaUrl = forwardMessageData.mediaUrl;
                    messageContent = 'GIF';
                } else if (forwardMessageData.type === 'sticker') {
                    messageType = 'sticker';
                    mediaUrl = forwardMessageData.mediaUrl;
                    messageContent = 'Стикер';
                } else {
                    messageContent = forwardMessageData.content;
                }
                
                const res = await fetch('/api/v1/messages/' + chatId, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        content: messageContent,
                        type: messageType,
                        mediaUrl: mediaUrl,
                        forwardFrom: forwardMessageData.senderName
                    })
                });
                
                const data = await res.json();
                
                if (data.message) {
                    showToast('success', 'Переслано в ' + chatName, '📨');
                    closeForwardModal();
                    loadChats(); // обновляем список чатов
                }
            } catch (err) {
                console.error('Forward error:', err);
                showToast('error', 'Ошибка пересылки', '❌');
            }
        }

        // Обработчик поиска в модале пересылки
        document.getElementById('forwardSearchInput').addEventListener('input', function(e) {
            renderForwardChatsList(e.target.value.trim());
        });

        // Закрытие модала при клике на оверлей
        document.getElementById('forwardModal').addEventListener('click', function(e) {
            if (e.target.id === 'forwardModal') closeForwardModal();
        });

        function closeConfirmModal() {
            document.getElementById('confirmModal').classList.remove('active');
        }

        // ============================================
        // DELETE CHAT
        // ============================================
        function deleteCurrentChat() {
            if (!activeChat) return;
            
        document.getElementById('confirmTitle').textContent = window.i18n?.t('deleteChatQuestion') || 'Удалить чат?';
            document.getElementById('confirmText').textContent = 'Чат "' + activeChat.name + '" будет удалён.';
            
            document.getElementById('confirmBtn').onclick = async function() {
                try {
                    const res = await fetch('/api/v1/chats/' + activeChat.id, {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    const data = await res.json();
                    if (res.ok) {
                        closeConfirmModal();
                        closeChat();
                        loadChats();
                        showToast('success', tr('chatDeleted', 'Чат удалён'), '✓');
                    } else {
                        showToast('error', data.error || tr('deleteError', 'Ошибка удаления'), '❌');
                    }
                } catch (err) {
                    showToast('error', tr('networkError', 'Ошибка сети'), '❌');
                }
            };
            
            document.getElementById('confirmModal').classList.add('active');
        }

        // ============================================
        // SEND MESSAGE
        // ============================================
        async function send() {
            const input = document.getElementById('msgInput');
            const text = getInputText();
            if (!text || !activeChat) return;
            
            closeEmojiPicker();
            
            const tempId = 'temp-' + Date.now();
            const tempMsg = {
                id: tempId,
                content: text,
                senderId: user.id,
                time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                senderName: user.firstName || user.username || tr('you', 'Вы'),
                replyToMessageId: replyingTo ? replyingTo.messageId : null,
                pending: true
            };
            
            messagesData[tempId] = tempMsg;
            document.getElementById('messages').appendChild(createMessageElement(tempMsg));
            scrollToBottom();
            
            input.innerText = '';
            updateSendButton();
            const replyData = replyingTo;
            cancelReply();
            
            try {
                const body = { content: text, type: 'text' };
                if (replyData) body.replyTo = replyData.messageId;

                // Если разработчик отвечает на support request через бота
                const isBotChatLocal = activeChat && (activeChat.isBot || (activeChat.name === 'CraneApp'));
                const activeSupportRaw = localStorage.getItem('craneapp_active_support_request');
                const devUsernames = ['adm1','admin','admin1','qzlfee'];
                const isDevUser = devUsernames.includes((user.username||'').toLowerCase());

                if (isBotChatLocal && isDevUser && activeSupportRaw) {
                    const activeSupport = JSON.parse(activeSupportRaw);
                    if (activeSupport.requestId && activeSupport.requestId !== 'null') {
                        // Отправляем ответ через reply API
                        const replyRes = await fetch('/api/v1/support/requests/' + activeSupport.requestId + '/reply', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                            body: JSON.stringify({ message: text })
                        });
                        if (replyRes.ok) {
                            localStorage.removeItem('craneapp_active_support_request');
                            // Показываем подтверждение в чате с ботом
                            const tempDiv = document.createElement('div');
                            tempDiv.className = 'message outgoing';
                            tempDiv.innerHTML = text + '<div class="msg-time">' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</div>';
                            document.getElementById('messages').appendChild(tempDiv);
                            document.getElementById('messages').scrollTop = 999999;
                            showToast('success', tr('replySentToUser', 'Ответ отправлен пользователю'), '✓');
                            return;
                        }
                    }
                }
                // E2E шифрование — не шифруем чат с ботом
                if (window.E2E && !isBotChatLocal) {
                    const enc = await window.E2E.encrypt(text, activeChat.id, token);
                    if (enc.isEncrypted) {
                        body.content = enc.content;
                        body.iv = enc.iv;
                        body.isEncrypted = true;
                        body.contentPlain = text; // Сохраняем оригинальный текст для поиска
                    }
                } else {
                    // Если не шифруем, тоже сохраняем contentPlain
                    body.contentPlain = text;
                }

                const res = await fetch('/api/v1/messages/' + activeChat.id, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify(body)
                });
                const data = await res.json();

                if (res.ok && data.message) {
                    _confirmMessage(tempId, data.message);
                    loadChats();
                } else if (res.status === 403) {
                    const el = document.querySelector('[data-message-id="' + tempId + '"]');
                    if (el) el.remove();
                    delete messagesData[tempId];
                    showMuteInfoModal(data.error || tr('muted', 'Вы замучены'));
                } else {
                    const el = document.querySelector('[data-message-id="' + tempId + '"]');
                    if (el) el.remove();
                    delete messagesData[tempId];
                    showToast('error', data.error || tr('notSent', 'Не отправлено'), '❌');
                }
            } catch (err) {
                const el = document.querySelector('[data-message-id="' + tempId + '"]');
                if (el) el.remove();
                delete messagesData[tempId];
                showToast('error', tr('notSent', 'Не отправлено'), '❌');
            }
        }

        // ============================================
        // INPUT TYPING
        // ============================================
        document.getElementById('msgInput').addEventListener('input', sendTyping);

        // Вставка фото из буфера обмена
        document.getElementById('msgInput').addEventListener('paste', function(e) {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (!file) return;
                    if (file.size > MAX_FILE_SIZE) {
                        showToast('error', tr('fileTooLarge50', 'Файл слишком большой. Максимум 50 МБ'), '❌');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = e2 => showMediaSendPreview(e2.target.result, 'image');
                    reader.readAsDataURL(file);
                    return;
                }
            }
        });

        // ============================================
        // TAB BAR
        // ============================================
        const tabs = [
            { icon: '👥', labelKey: 'contacts', page: '../contacts/contacts.html' },
            { icon: '📞', labelKey: 'calls', page: '../calls/calls.html' },
            { icon: '💬', labelKey: 'chats', page: './chats.html', active: true },
            { icon: '⚙', labelKey: 'settings', page: '../settings/settings.html' }
        ];
        
        const tabBar = document.getElementById('tabBar');
        tabs.forEach(function(t) {
            const div = document.createElement('div');
            div.className = 'tab-item' + (t.active ? ' active' : '');
            const label = (window.i18n && window.i18n.t(t.labelKey)) || t.labelKey;
            div.innerHTML = '<span class="tab-icon">' + t.icon + '</span><span class="tab-label" data-i18n="' + t.labelKey + '">' + label + '</span>';
            div.onclick = function() { if (!t.active) location.href = t.page; };
            tabBar.appendChild(div);
        });

        // ============================================
        // TOAST
        // ============================================
        function showToast(type, message, icon) {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            if (window.i18n && typeof message === 'string') {
                message = window.i18n.localizeText(message);
            }
            toast.innerHTML = '<span>' + icon + '</span><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(function() {
                toast.style.opacity = '0';
                setTimeout(function() { toast.remove(); }, 300);
            }, 3000);
        }

        // ============================================
        // PIN & ARCHIVE CHATS
        // ============================================

        // Pin чат
        async function pinChat(chatId) {
            try {
                const res = await fetch('/api/v1/chats/' + chatId + '/pin', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: '{}'
                });
                const data = await res.json();
                if (res.ok) {
                    pinnedChatIds.add(chatId);
                    showToast('success', tr('chatPinned', 'Чат закреплён'), '📌');
                    loadChats();
                } else {
                    showToast('error', data.error || tr('error', 'Ошибка'), '❌');
                }
            } catch (err) {
                showToast('error', tr('networkError', 'Ошибка сети'), '❌');
            }
        }

        async function unpinChat(chatId) {
            try {
                const res = await fetch('/api/v1/chats/' + chatId + '/pin', {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: '{}'
                });
                const data = await res.json();
                if (res.ok) {
                    pinnedChatIds.delete(chatId);
                    showToast('success', tr('chatUnpinned', 'Чат откреплён'), '📌');
                    loadChats();
                } else {
                    showToast('error', data.error || tr('error', 'Ошибка'), '❌');
                }
            } catch (err) {
                showToast('error', tr('networkError', 'Ошибка сети'), '❌');
            }
        }

        async function archiveChat(chatId) {
            try {
                const res = await fetch('/api/v1/chats/' + chatId + '/archive', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: '{}'
                });
                const data = await res.json();
                if (res.ok) {
                    showToast('success', tr('chatArchived', 'Чат архивирован'), '📁');
                    loadChats();
                } else {
                    showToast('error', data.error || tr('error', 'Ошибка'), '❌');
                }
            } catch (err) {
                showToast('error', tr('networkError', 'Ошибка сети'), '❌');
            }
        }

        async function unarchiveChat(chatId) {
            try {
                const res = await fetch('/api/v1/chats/' + chatId + '/archive', {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: '{}'
                });
                const data = await res.json();
                if (res.ok) {
                    showToast('success', tr('chatRestored', 'Чат восстановлен'), '📁');
                    loadChats();
                } else {
                    showToast('error', data.error || tr('error', 'Ошибка'), '❌');
                }
            } catch (err) {
                showToast('error', tr('networkError', 'Ошибка сети'), '❌');
            }
        }

        // Загрузить архивированные чаты
        async function loadArchivedChats() {
            try {
                const res = await fetch('/api/v1/chats/archived', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                
                archivedChats = [];
                const seenArchivedIds = new Set(); // Защита от дубликатов
                
                if (data.chats && data.chats.length > 0) {
                    // Сначала собираем все ID приватных чатов (только уникальные)
                    const privateChatIds = [];
                    const seenChatIds = new Set();
                    
                    for (const c of data.chats) {
                        if (!seenChatIds.has(c.id)) {
                            seenChatIds.add(c.id);
                            if (c.type === 'private') {
                                privateChatIds.push(c.id);
                            }
                        }
                    }
                    
                    // Параллельно загружаем участников для всех приватных чатов
                    const memberPromises = privateChatIds.map(async (chatId) => {
                        try {
                            const mRes = await fetch('/api/v1/chats/' + chatId + '/members', {
                                headers: { 'Authorization': 'Bearer ' + token }
                            });
                            const mData = await mRes.json();
                            const other = mData.members && mData.members.find(m => m.id !== user.id);
                            
                            if (other) {
                                chatUsers[chatId] = {
                                    id: other.id,
                                    username: other.username,
                                    name: other.first_name || other.username,
                                    av: other.avatar_url,
                                    bio: other.bio || '',
                                    isOnline: other.is_online
                                };
                                return { chatId, name: other.first_name || other.username, avatar: other.avatar_url };
                            }
                        } catch (e) {
                            console.error('Error loading archived chat members:', e);
                        }
                        return null;
                    });
                    
                    const memberData = await Promise.all(memberPromises);
                    const memberMap = {};
                    memberData.forEach(m => {
                        if (m) memberMap[m.chatId] = m;
                    });
                    
                    // Теперь формируем массив архивированных чатов (с защитой от дубликатов)
                    for (const c of data.chats) {
                        // Пропускаем дубликаты по ID
                        if (seenArchivedIds.has(c.id)) {
                            continue;
                        }
                        seenArchivedIds.add(c.id);
                        
                        let chatName = c.title || 'Чат';
                        let chatAv = '💬';
                        
                        if (c.type === 'private' && memberMap[c.id]) {
                            chatName = memberMap[c.id].name;
                            chatAv = memberMap[c.id].avatar || (chatName[0] || '?');
                        }
                        
                        let lastMsgText = formatLastMessage(c);
                        
                        archivedChats.push({
                            id: c.id,
                            name: chatName,
                            title: chatName,
                            av: chatAv,
                            avatarUrl: chatAv,
                            lastMessage: lastMsgText,
                            time: c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''
                        });
                    }
                }
                
                console.log('✅ Archived chats loaded:', archivedChats.length);
            } catch (err) {
                console.error('Load archived chats error:', err);
                archivedChats = [];
            }
        }

        function toggleArchivedChats() {
            const list = document.getElementById('archivedChatsList');
            if (list) {
                list.style.display = list.style.display === 'none' ? 'block' : 'none';
            }
        }

        function openArchivedChat(id, name) {
            // Находим чат в архивированных для получения правильного имени
            const chat = archivedChats.find(function(c) { return c.id === id; });
            const chatName = chat ? (chat.name || chat.title) : name;
            // Просто открываем чат - НЕ разархивируем его
            openChat(id, chatName);
        }

        // Context Menu для чата
        function showChatContextMenu(e, chatId) {
            e.preventDefault();
            currentContextChatId = chatId;
            
            const menu = document.getElementById('chatContextMenu');
            const x = e.pageX || e.clientX || 0;
            const y = e.pageY || e.clientY || 0;
            
            menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
            menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
            menu.classList.add('active');
            
            // Проверяем статус pinned
            const isPinned = pinnedChatIds.has(chatId);
            const isArchived = archivedChats.some(c => c.id === chatId);
            
            // Обновляем текст пункта "Закрепить/Открепить"
            const pinText = document.getElementById('contextPinText');
            const pinItem = document.getElementById('contextPinItem');
            if (isPinned) {
                pinText.textContent = 'Открепить';
            } else {
                pinText.textContent = 'Закрепить';
            }
            
            // Обновляем текст пункта "Архивировать/Разархивировать"
            const archiveText = document.getElementById('contextArchiveText');
            const archiveItem = document.getElementById('contextArchiveItem');
            if (isArchived) {
                archiveText.textContent = 'Разархивировать';
                archiveItem.onclick = function() { unarchiveChatFromMenu(); };
            } else {
                archiveText.textContent = 'Архивировать';
                archiveItem.onclick = function() { archiveChatFromMenu(); };
            }
        }

        function pinChatFromMenu() {
            document.getElementById('chatContextMenu').classList.remove('active');
            const isPinned = pinnedChatIds.has(currentContextChatId);
            if (isPinned) {
                unpinChat(currentContextChatId);
            } else {
                pinChat(currentContextChatId);
            }
        }

        function archiveChatFromMenu() {
            document.getElementById('chatContextMenu').classList.remove('active');
            archiveChat(currentContextChatId);
        }

        function unarchiveChatFromMenu() {
            document.getElementById('chatContextMenu').classList.remove('active');
            unarchiveChat(currentContextChatId);
        }

        function deleteChatFromMenu() {
            document.getElementById('chatContextMenu').classList.remove('active');
            const chat = allChats.find(c => c.id === currentContextChatId);
            activeChat = { id: currentContextChatId, name: chat?.name || chat?.title || 'Чат' };
            deleteCurrentChat();
        }

        // Закрыть контекстное меню при клике
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.chat-context-menu')) {
                document.getElementById('chatContextMenu').classList.remove('active');
            }
        });

        // ============================================
        // VIDEO NOTES (кружки)
        // ============================================
        let videoNoteMode = false; // false = голосовое, true = кружок
        let videoNoteRecorder = null;
        let videoNoteChunks = [];
        let videoNoteTimer = null;
        let videoNoteSeconds = 0;
        let videoNoteStream = null;
        let videoNoteRecording = false;
        const VIDEO_NOTE_MAX = 60; // 1 минута

        function switchToVideoNote() {
            if (isRecording) return;
            if (!cameraAvailable) return; // нет камеры — не переключаем
            videoNoteMode = true;
            document.getElementById('voiceBtn').style.display = 'none';
            document.getElementById('videoNoteBtn').style.display = 'flex';
        }

        let videoNoteHoldTimer = null;
        const VIDEO_NOTE_HOLD_DELAY = 300; // мс до начала записи

        function videoNoteMouseDown(e) {
            e.preventDefault();
            videoNoteHoldTimer = setTimeout(() => {
                videoNoteHoldTimer = null;
                startVideoNoteHold(e);
            }, VIDEO_NOTE_HOLD_DELAY);
        }

        function videoNoteMouseUp(e) {
            if (videoNoteHoldTimer) {
                // Короткий клик — переключаем на голосовое
                clearTimeout(videoNoteHoldTimer);
                videoNoteHoldTimer = null;
                switchToVoice();
            } else {
                // Удержание — останавливаем запись
                stopVideoNoteHold(e);
            }
        }

        function videoNoteTouchStart(e) {
            e.preventDefault();
            videoNoteHoldTimer = setTimeout(() => {
                videoNoteHoldTimer = null;
                startVideoNoteHold(e);
            }, VIDEO_NOTE_HOLD_DELAY);
        }

        function videoNoteTouchEnd(e) {
            if (videoNoteHoldTimer) {
                clearTimeout(videoNoteHoldTimer);
                videoNoteHoldTimer = null;
                switchToVoice();
            } else {
                stopVideoNoteHold(e);
            }
        }

        // Обновляем переключение кнопок при вводе текста
        function getInputText() {
            const input = document.getElementById('msgInput');
            // Собираем текст: обычные текстовые узлы + alt у apple-emoji img
            let text = '';
            function walk(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    text += node.textContent;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.tagName === 'IMG' && node.classList.contains('apple-emoji')) {
                        text += node.alt || '';
                    } else if (node.tagName === 'BR') {
                        text += '\n';
                    } else {
                        node.childNodes.forEach(walk);
                    }
                }
            }
            input.childNodes.forEach(walk);
            return text.trim();
        }

        function updateSendButton() {
            const hasText = getInputText().length > 0;
            document.getElementById('sendBtn').style.display = hasText ? 'flex' : 'none';
            if (hasText) {
                document.getElementById('voiceBtn').style.display = 'none';
                document.getElementById('videoNoteBtn').style.display = 'none';
            } else {
                if (videoNoteMode && cameraAvailable) {
                    document.getElementById('videoNoteBtn').style.display = 'flex';
                    document.getElementById('voiceBtn').style.display = 'none';
                } else {
                    document.getElementById('voiceBtn').style.display = 'flex';
                    document.getElementById('videoNoteBtn').style.display = 'none';
                    if (!cameraAvailable) videoNoteMode = false;
                }
            }
        }
        const _origInputHandler = document.getElementById('msgInput').oninput;
        document.getElementById('msgInput').addEventListener('input', updateSendButton);
        window._updateSendButton = updateSendButton;

        function switchToVoice() {
            if (videoNoteRecording) return;
            videoNoteMode = false;
            document.getElementById('videoNoteBtn').style.display = 'none';
            document.getElementById('voiceBtn').style.display = 'flex';
        }

        async function startVideoNoteHold(e) {
            if (videoNoteRecording || isRecording) return;
            if (!activeChat) { showToast('info', 'Выберите чат', '⚠️'); return; }

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast('error', 'Браузер не поддерживает запись', '📹'); return;
            }

            try {
                // Пробуем с фронтальной камерой, при ошибке — любую
                try {
                    videoNoteStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
                        audio: true
                    });
                } catch (_) {
                    videoNoteStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                }

                // Показываем предпросмотр
                const preview = document.getElementById('videoNotePreview');
                preview.srcObject = videoNoteStream;
                document.getElementById('videoNoteOverlay').classList.add('active');

                videoNoteChunks = [];
                videoNoteSeconds = 0;
                videoNoteRecording = true;

                const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
                    ? 'video/webm;codecs=vp9,opus'
                    : MediaRecorder.isTypeSupported('video/webm')
                    ? 'video/webm' : 'video/mp4';

                videoNoteRecorder = new MediaRecorder(videoNoteStream, { mimeType });
                videoNoteRecorder.ondataavailable = e => { if (e.data.size > 0) videoNoteChunks.push(e.data); };
                videoNoteRecorder.onstop = () => {
                    videoNoteStream.getTracks().forEach(t => t.stop());
                    if (videoNoteChunks.length > 0 && !videoNoteCancelled) {
                        const blob = new Blob(videoNoteChunks, { type: mimeType });
                        sendVideoNote(blob, videoNoteSeconds);
                    }
                    resetVideoNoteUI();
                };
                videoNoteRecorder.start(100);

                // Прогресс-бар и таймер
                const circumference = 2 * Math.PI * 54;
                const bar = document.getElementById('videoNoteProgressBar');
                bar.style.strokeDasharray = circumference;
                bar.style.strokeDashoffset = circumference;

                videoNoteTimer = setInterval(() => {
                    videoNoteSeconds++;
                    const m = Math.floor(videoNoteSeconds / 60);
                    const s = videoNoteSeconds % 60;
                    document.getElementById('videoNoteTimer').textContent = m + ':' + String(s).padStart(2, '0');
                    // Прогресс
                    const progress = videoNoteSeconds / VIDEO_NOTE_MAX;
                    bar.style.strokeDashoffset = circumference * (1 - progress);
                    if (videoNoteSeconds >= VIDEO_NOTE_MAX) stopVideoNoteHold();
                }, 1000);

            } catch (err) {
                console.error('Video note error:', err.name, err.message);
                // Освобождаем стрим если он был частично захвачен
                if (videoNoteStream) {
                    videoNoteStream.getTracks().forEach(t => t.stop());
                    videoNoteStream = null;
                }
                videoNoteRecording = false;
                document.getElementById('videoNoteOverlay').classList.remove('active');

                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    showToast('error', 'Нет доступа к камере — нажмите на 🔒 в адресной строке и разрешите камеру', '📹');
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    showToast('error', 'Камера не найдена', '📹');
                    cameraAvailable = false;
                    switchToVoice();
                } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    showToast('error', 'Камера занята другим приложением', '📹');
                } else if (err.name === 'OverconstrainedError') {
                    showToast('error', 'Камера не поддерживает нужный формат', '📹');
                    cameraAvailable = false;
                    switchToVoice();
                } else if (err.name === 'SecurityError') {
                    showToast('error', 'Доступ к камере заблокирован (нужен HTTPS)', '📹');
                } else {
                    showToast('error', 'Ошибка камеры: ' + (err.message || err.name), '📹');
                }
            }
        }

        let videoNoteCancelled = false;

        function stopVideoNoteHold(e) {
            if (!videoNoteRecording) return;
            videoNoteCancelled = false;
            clearInterval(videoNoteTimer);
            videoNoteTimer = null;
            videoNoteRecording = false;
            if (videoNoteRecorder && videoNoteRecorder.state !== 'inactive') {
                videoNoteRecorder.stop();
            }
        }

        function stopVideoNoteHoldIfRecording() {
            if (videoNoteRecording) stopVideoNoteHold();
        }

        function cancelVideoNote() {
            videoNoteCancelled = true;
            videoNoteChunks = [];
            clearInterval(videoNoteTimer);
            videoNoteTimer = null;
            videoNoteRecording = false;
            if (videoNoteRecorder && videoNoteRecorder.state !== 'inactive') {
                videoNoteRecorder.stop();
            }
            if (videoNoteStream) videoNoteStream.getTracks().forEach(t => t.stop());
            resetVideoNoteUI();
        }

        function resetVideoNoteUI() {
            document.getElementById('videoNoteOverlay').classList.remove('active');
            const preview = document.getElementById('videoNotePreview');
            preview.srcObject = null;
            videoNoteSeconds = 0;
            videoNoteRecording = false;
            videoNoteCancelled = false;
            videoNoteStream = null;
            videoNoteRecorder = null;
            videoNoteChunks = [];
            clearInterval(videoNoteTimer);
            videoNoteTimer = null;
        }

        async function sendVideoNote(blob, duration) {
            if (!activeChat) return;
            const tempId = 'temp-' + Date.now();
            const localUrl = URL.createObjectURL(blob);
            const msg = {
                id: tempId, senderId: user.id, type: 'video_note',
                mediaUrl: localUrl, voiceDuration: duration,
                time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                senderName: user.firstName || 'Вы', pending: true
            };
            messagesData[tempId] = msg;
            document.getElementById('messages').appendChild(await createMessageElement(msg));
            scrollToBottom();

            const reader = new FileReader();
            reader.onload = async function(e) {
                const base64 = e.target.result;
                try {
                    const uploadRes = await fetch('/api/v1/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({ file: base64, type: 'video_note' })
                    });
                    const uploadData = await uploadRes.json();
                    const serverUrl = uploadData.url;
                    if (!serverUrl) { showToast('error', tr('loadingError', 'Ошибка загрузки'), '❌'); return; }
                    URL.revokeObjectURL(localUrl);
                    const res = await fetch('/api/v1/messages/' + activeChat.id, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({ content: '', type: 'video_note', mediaUrl: serverUrl, mediaType: 'video_note', voiceDuration: duration })
                    });
                    const data = await res.json();
                    if (data.message) { _confirmMessage(tempId, data.message); }
                } catch (err) { showToast('error', tr('sendError', 'Ошибка отправки'), '❌'); }
            };
            reader.readAsDataURL(blob);
        }

        // ============================================
        // VIDEO NOTES
        // ============================================
        let mediaRecorder = null;
        let voiceChunks = [];
        let voiceTimer = null;
        let voiceSeconds = 0;
        let isRecording = false;
        let voiceHoldStartX = 0; // для свайпа отмены
        let voiceCancelled = false;

        let voiceHoldTimer = null;
        const VOICE_HOLD_DELAY = 300;

        function voiceBtnMouseDown(e) {
            e.preventDefault();
            voiceHoldTimer = setTimeout(() => {
                voiceHoldTimer = null;
                startVoiceHold(e);
            }, VOICE_HOLD_DELAY);
        }

        function voiceBtnMouseUp(e) {
            if (voiceHoldTimer) {
                // Короткий клик — переключаем на кружок
                clearTimeout(voiceHoldTimer);
                voiceHoldTimer = null;
                switchToVideoNote();
            } else {
                stopVoiceHold(e);
            }
        }

        function voiceBtnTouchStart(e) {
            e.preventDefault();
            voiceHoldStartX = e.touches[0].clientX;
            voiceCancelled = false;
            voiceHoldTimer = setTimeout(() => {
                voiceHoldTimer = null;
                startVoiceHold(e);
            }, VOICE_HOLD_DELAY);
        }

        function voiceBtnTouchEnd(e) {
            if (voiceHoldTimer) {
                clearTimeout(voiceHoldTimer);
                voiceHoldTimer = null;
                switchToVideoNote();
            } else {
                stopVoiceHold(e);
            }
        }

        function startVoiceHold(e) {
            if (isRecording) return;
            voiceCancelled = false;
            startVoiceRecording();
        }

        function stopVoiceHold(e) {
            if (!isRecording) return;
            if (voiceCancelled) return;
            stopVoiceRecording();
        }

        function cancelVoiceHoldIfRecording() {
            // На десктопе: если мышь ушла с кнопки — НЕ отменяем, просто останавливаем и отправляем
            if (isRecording && !voiceCancelled) {
                stopVoiceRecording();
            }
        }

        function checkVoiceSwipe(e) {
            if (!isRecording || !e.touches) return;
            const currentX = e.touches[0].clientX;
            const diff = voiceHoldStartX - currentX;
            // Свайп влево на 120px — отмена (только тач)
            if (diff > 120) {
                voiceCancelled = true;
                cancelVoiceRecording();
            }
        }

        function handleVoiceBtn() {
            // Оставляем для совместимости (клик на десктопе)
            if (isRecording) {
                stopVoiceRecording();
            } else {
                startVoiceRecording();
            }
        }

        async function startVoiceRecording() {
            if (!activeChat) {
                showToast('info', 'Выберите чат', '⚠️');
                return;
            }

            // Проверяем поддержку API
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast('error', 'Браузер не поддерживает запись. Используйте HTTPS.', '🎤');
                return;
            }

            // Проверяем текущее состояние разрешения
            if (navigator.permissions) {
                try {
                    const perm = await navigator.permissions.query({ name: 'microphone' });
                    console.log('🎤 Microphone permission state:', perm.state);
                    if (perm.state === 'denied') {
                        showToast('error', 'Доступ к микрофону заблокирован. Разрешите в настройках браузера.', '🎤');
                        return;
                    }
                } catch (_) {}
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 48000,
                        channelCount: 1
                    },
                    video: false
                });
                voiceChunks = [];
                voiceSeconds = 0;
                isRecording = true;

                // Определяем поддерживаемый формат с максимальным качеством
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
                    ? 'audio/ogg;codecs=opus'
                    : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/ogg';

                mediaRecorder = new MediaRecorder(stream, {
                    mimeType,
                    audioBitsPerSecond: 128000  // 128 kbps — хорошее качество
                });
                mediaRecorder.ondataavailable = e => { if (e.data.size > 0) voiceChunks.push(e.data); };
                mediaRecorder.onstop = () => {
                    stream.getTracks().forEach(t => t.stop());
                    if (voiceChunks.length > 0 && voiceSeconds >= 1) {
                        const blob = new Blob(voiceChunks, { type: mimeType });
                        sendVoiceMessage(blob, voiceSeconds);
                    }
                    resetVoiceUI();
                };
                mediaRecorder.start(100);

                // UI
                document.getElementById('msgInput').style.display = 'none';
                document.getElementById('voiceRecordingBar').classList.add('active');
                document.getElementById('voiceBtn').classList.add('recording');
                document.getElementById('voiceBtn').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

                voiceTimer = setInterval(() => {
                    voiceSeconds++;
                    const m = Math.floor(voiceSeconds / 60);
                    const s = voiceSeconds % 60;
                    document.getElementById('voiceRecTime').textContent = m + ':' + String(s).padStart(2, '0');
                    // Максимум 5 минут
                    if (voiceSeconds >= 300) stopVoiceRecording();
                }, 1000);

            } catch (e) {
                console.error('Microphone error:', e.name, e.message);
                if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                    showToast('error', 'Разрешите доступ к микрофону в настройках браузера', '🎤');
                } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
                    showToast('error', 'Микрофон не найден', '🎤');
                } else if (e.name === 'NotSupportedError' || location.protocol !== 'https:' && location.hostname !== 'localhost') {
                    showToast('error', 'Запись доступна только по HTTPS', '🔒');
                } else {
                    showToast('error', 'Ошибка микрофона: ' + e.message, '🎤');
                }
            }
        }

        function stopVoiceRecording() {
            clearInterval(voiceTimer);
            voiceTimer = null;
            isRecording = false;
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
        }

        function cancelVoiceRecording() {
            voiceChunks = [];
            clearInterval(voiceTimer);
            voiceTimer = null;
            isRecording = false;
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            resetVoiceUI();
        }

        function resetVoiceUI() {
            clearInterval(voiceTimer);
            voiceTimer = null;
            voiceSeconds = 0;
            isRecording = false;
            voiceCancelled = false;
            document.getElementById('msgInput').style.display = '';
            document.getElementById('voiceRecordingBar').classList.remove('active');
            document.getElementById('voiceBtn').classList.remove('recording');
            document.getElementById('voiceRecTime').textContent = '0:00';
            document.getElementById('voiceBtn').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
        }

        async function sendVoiceMessage(blob, duration) {
            if (!activeChat) return;

            const tempId = 'temp-' + Date.now();
            // Показываем временный плеер с blob URL пока загружается
            const localUrl = URL.createObjectURL(blob);
            const msg = {
                id: tempId,
                senderId: user.id,
                type: 'voice',
                mediaUrl: localUrl,
                voiceDuration: duration,
                time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                senderName: user.firstName || 'Вы',
                pending: true
            };
            messagesData[tempId] = msg;
            document.getElementById('messages').appendChild(await createMessageElement(msg));
            scrollToBottom();

            // Конвертируем blob в base64 и загружаем
            const reader = new FileReader();
            reader.onload = async function(e) {
                const base64 = e.target.result;
                try {
                    const uploadRes = await fetch('/api/v1/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({ file: base64, type: 'voice' })
                    });
                    const uploadData = await uploadRes.json();
                    const serverUrl = uploadData.url;

                    if (!serverUrl) {
                        showToast('error', tr('loadingError', 'Ошибка загрузки'), '❌');
                        return;
                    }

                    // Обновляем src плеера на серверный URL
                    const tempEl = document.querySelector('[data-message-id="' + tempId + '"]');
                    if (tempEl) {
                        const player = tempEl.querySelector('.voice-player');
                        if (player && player._audio) {
                            player._audio.src = serverUrl;
                        }
                    }
                    URL.revokeObjectURL(localUrl);

                    // Отправляем сообщение
                    const res = await fetch('/api/v1/messages/' + activeChat.id, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({
                            content: '',
                            type: 'voice',
                            mediaUrl: serverUrl,
                            mediaType: 'voice',
                            voiceDuration: duration
                        })
                    });
                    const data = await res.json();
                    if (data.message) { _confirmMessage(tempId, data.message); }
                } catch (err) {
                    console.error('Voice send error:', err);
                    showToast('error', tr('sendError', 'Ошибка отправки'), '❌');
                }
            };
            reader.readAsDataURL(blob);
        }

        // Создание элемента видеокружка
        function createVideoNoteElement(mediaUrl, duration) {
            const wrapper = document.createElement('div');
            wrapper.className = 'video-note-msg';

            const circle = document.createElement('div');
            circle.className = 'video-note-msg-circle';

            const video = document.createElement('video');
            video.src = mediaUrl;
            video.loop = false;
            video.muted = false;
            video.playsInline = true;
            video.preload = 'metadata';

            // SVG прогресс
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 120 120');
            svg.classList.add('video-note-msg-progress');
            const circumference = 2 * Math.PI * 54;
            const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            bgCircle.setAttribute('cx', '60'); bgCircle.setAttribute('cy', '60'); bgCircle.setAttribute('r', '54');
            bgCircle.classList.add('video-note-progress-bg');
            const barCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            barCircle.setAttribute('cx', '60'); barCircle.setAttribute('cy', '60'); barCircle.setAttribute('r', '54');
            barCircle.classList.add('video-note-progress-bar');
            barCircle.style.strokeDasharray = circumference;
            barCircle.style.strokeDashoffset = circumference;
            svg.appendChild(bgCircle); svg.appendChild(barCircle);

            // Кнопка play
            const playBtn = document.createElement('div');
            playBtn.className = 'video-note-msg-play';
            playBtn.innerHTML = '▶';

            let playing = false;
            let progressInterval = null;

            circle.onclick = function() {
                if (playing) {
                    video.pause();
                    playing = false;
                    playBtn.style.display = 'flex';
                    clearInterval(progressInterval);
                } else {
                    // Останавливаем другие видео
                    document.querySelectorAll('.video-note-msg video').forEach(v => { if (v !== video) v.pause(); });
                    video.play().then(() => {
                        playing = true;
                        playBtn.style.display = 'none';
                        progressInterval = setInterval(() => {
                            if (!video.duration) return;
                            const p = video.currentTime / video.duration;
                            barCircle.style.strokeDashoffset = circumference * (1 - p);
                        }, 100);
                    }).catch(() => {});
                }
            };

            video.addEventListener('ended', () => {
                playing = false;
                playBtn.style.display = 'flex';
                clearInterval(progressInterval);
                barCircle.style.strokeDashoffset = circumference;
                video.currentTime = 0;
            });

            circle.appendChild(video);
            circle.appendChild(svg);
            circle.appendChild(playBtn);
            wrapper.appendChild(circle);

            // Длительность
            if (duration > 0) {
                const dur = document.createElement('div');
                dur.className = 'video-note-msg-dur';
                const m = Math.floor(duration / 60), s = duration % 60;
                dur.textContent = m + ':' + String(s).padStart(2, '0');
                wrapper.appendChild(dur);
            }

            return wrapper;
        }
        function createVoicePlayer(mediaUrl, duration) {
            const wrapper = document.createElement('div');
            wrapper.className = 'voice-player';

            const playBtn = document.createElement('button');
            playBtn.className = 'voice-play-btn';
            playBtn.innerHTML = '▶';

            const waveform = document.createElement('div');
            waveform.className = 'voice-waveform';
            const bars = 24;
            // Фиксированные высоты для стабильного вида
            const heights = [6,10,14,8,16,12,6,18,10,14,8,20,12,16,8,14,10,18,6,12,16,8,14,10];
            heights.forEach(h => {
                const bar = document.createElement('div');
                bar.className = 'voice-waveform-bar';
                bar.style.height = Math.min(h, 20) + 'px';
                waveform.appendChild(bar);
            });

            const durEl = document.createElement('span');
            durEl.className = 'voice-duration';

            function formatTime(sec) {
                const s = Math.max(0, Math.floor(sec || 0));
                return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
            }

            durEl.textContent = formatTime(duration);

            const audio = new Audio();
            audio.preload = 'metadata';
            audio.src = mediaUrl;

            let playing = false;
            let realDuration = duration;

            audio.addEventListener('loadedmetadata', () => {
                if (isFinite(audio.duration) && audio.duration > 0) {
                    realDuration = audio.duration;
                    if (!playing) durEl.textContent = formatTime(realDuration);
                }
            });

            // timeupdate — надёжнее чем setInterval
            audio.addEventListener('timeupdate', () => {
                if (!playing || !isFinite(audio.duration) || audio.duration === 0) return;
                const progress = audio.currentTime / audio.duration;
                const playedCount = Math.floor(progress * bars);
                waveform.querySelectorAll('.voice-waveform-bar').forEach((bar, i) => {
                    bar.classList.toggle('played', i < playedCount);
                });
                durEl.textContent = formatTime(audio.currentTime);
            });

            audio.addEventListener('ended', () => {
                playing = false;
                playBtn.innerHTML = '▶';
                waveform.querySelectorAll('.voice-waveform-bar').forEach(b => b.classList.remove('played'));
                durEl.textContent = formatTime(realDuration);
            });

            audio.addEventListener('error', () => {
                playBtn.innerHTML = '▶';
                playing = false;
            });

            playBtn.onclick = function() {
                // Останавливаем все другие плееры
                document.querySelectorAll('.voice-player').forEach(p => {
                    if (p !== wrapper && p._audio && !p._audio.paused) {
                        p._audio.pause();
                        const btn = p.querySelector('.voice-play-btn');
                        if (btn) btn.innerHTML = '▶';
                        p._playing = false;
                    }
                });

                if (playing) {
                    audio.pause();
                    playing = false;
                    playBtn.innerHTML = '▶';
                } else {
                    const playPromise = audio.play();
                    if (playPromise) {
                        playPromise.then(() => {
                            playing = true;
                            playBtn.innerHTML = '⏸';
                        }).catch(err => {
                            console.error('Voice play error:', err);
                            // Пробуем перезагрузить и воспроизвести
                            audio.load();
                            audio.play().then(() => {
                                playing = true;
                                playBtn.innerHTML = '⏸';
                            }).catch(() => {
                                showToast('error', 'Не удалось воспроизвести', '🎤');
                            });
                        });
                    }
                }
            };

            waveform.onclick = function(e) {
                if (!isFinite(audio.duration) || audio.duration === 0) return;
                const rect = waveform.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                audio.currentTime = ratio * audio.duration;
            };

            wrapper._audio = audio;
            wrapper._playing = false;

            wrapper.appendChild(playBtn);
            wrapper.appendChild(waveform);
            wrapper.appendChild(durEl);
            return wrapper;
        }
 connectWebSocket();
 loadChats().then(function() {
     initFolderTabs();
     // Открываем чат из параметра URL (например из папки)
     const params = new URLSearchParams(window.location.search);
     const openChatId = params.get('openChat');
     if (openChatId) {
         const chat = allChats.find(function(c) { return c.id === openChatId; });
         if (chat) {
             openChat(chat.id, chat.name || chat.title);
         }
         // Убираем параметр из URL
         history.replaceState({}, '', window.location.pathname);
     }
 });
 syncUserData();
 updateSideMenuProfile();
 if (window.applyTheme) window.applyTheme();
 if (window.initEmojis) window.initEmojis();
 loadGifs();
 loadStickerPacks();
 // Применяем переводы
 setTimeout(function() { if (window.i18n) window.i18n.translatePage(); }, 200);
 window.addEventListener('craneapp:languagechange', function() {
     if (window.i18n) {
         ['activeCallBar', 'inputLeftBtns', 'attachmentPanel', 'emojiPicker'].forEach(function(id) {
             const el = document.getElementById(id);
             if (el) window.i18n.translatePage(el);
         });
     }
     _renderActiveCallBar();
 });

        // ============================================
        // CREATE GROUP
        // ============================================
        let groupSelectedIds = new Set();
        let groupAvatarBase64 = null;
        let groupSearchTimeout = null;

        function openCreateGroupModal() {
            groupSelectedIds = new Set();
            groupAvatarBase64 = null;
            document.getElementById('groupTitleInput').value = '';
            document.getElementById('groupDescInput').value = '';
            document.getElementById('groupMemberSearch').value = '';
            document.getElementById('groupSelectedMembers').innerHTML = '';
            document.getElementById('groupMemberList').innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Начните вводить имя или @username</div>';
            document.getElementById('groupAvatarPreview').innerHTML = '👥';
            document.getElementById('createGroupModal').classList.add('active');
        }

        function closeCreateGroupModal() {
            document.getElementById('createGroupModal').classList.remove('active');
        }

        // ── Support Requests ──────────────────────────────────────────────
        let supportPanelOpen = false;

        async function openSupportRequests() {
            supportPanelOpen = !supportPanelOpen;
            const panel = document.getElementById('supportPanel');
            const msgs = document.getElementById('messages');
            if (supportPanelOpen) {
                panel.style.display = 'block';
                msgs.style.display = 'none';
                await loadSupportRequests();
            } else {
                panel.style.display = 'none';
                msgs.style.display = 'flex';
            }
        }

        // ── Reports Panel ──────────────────────────────────────────────────
        let reportsPanelOpen = false;

        async function openReportsPanel() {
            reportsPanelOpen = !reportsPanelOpen;
            const panel = document.getElementById('reportsPanel');
            const msgs = document.getElementById('messages');
            if (reportsPanelOpen) {
                panel.style.display = 'block';
                msgs.style.display = 'none';
                await loadReports();
            } else {
                panel.style.display = 'none';
                msgs.style.display = 'flex';
            }
        }

        async function loadReports() {
            const list = document.getElementById('reportsList');
            list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">Загрузка...</div>';
            try {
                const r = await fetch('/api/v1/reports', { headers: { Authorization: 'Bearer ' + token } });
                if (!r.ok) { list.innerHTML = '<div style="color:#FF4B4B;padding:12px">Ошибка загрузки</div>'; return; }
                const d = await r.json();
                const reports = d.reports || [];
                if (!reports.length) {
                    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px">Нет жалоб</div>';
                    return;
                }
                list.innerHTML = reports.map(rep => {
                    const statusColors = {
                        pending: '#FFA500',
                        resolved: '#00FF88',
                        rejected: '#FF4B4B'
                    };
                    const statusLabels = {
                        pending: 'На рассмотрении',
                        resolved: 'Решено',
                        rejected: 'Отклонено'
                    };
                    return `
                        <div class="report-item" onclick="openReportDetails('${rep.id}')" style="background:var(--bg-tertiary);border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer;transition:background 0.2s;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                <span style="font-weight:600;font-size:14px;">${rep.reported_username || 'Пользователь'}</span>
                                <span style="font-size:12px;padding:4px 8px;border-radius:8px;background:${statusColors[rep.status] || '#888'}20;color:${statusColors[rep.status] || '#888'};">${statusLabels[rep.status] || rep.status}</span>
                            </div>
                            <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">${getReasonLabel(rep.reason)}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">${new Date(rep.created_at).toLocaleString('ru-RU')}</div>
                        </div>
                    `;
                }).join('');
            } catch (err) {
                list.innerHTML = '<div style="color:#FF4B4B;padding:12px">Ошибка сети</div>';
            }
        }

        function getReasonLabel(reason) {
            const labels = {
                spam: '📢 Спам',
                harassment: '⚠️ Оскорбления',
                violence: '🔫 Угрозы насилием',
                scam: '💰 Мошенничество',
                fake: '🎭 Фейковый аккаунт',
                other: '📝 Другое'
            };
            return labels[reason] || reason;
        }

        async function forgiveUser() {
            if (!currentProfileUser) return;
            try {
                const res = await fetch('/api/v1/users/' + currentProfileUser.id + '/forgive', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    showToast('success', 'Пользователь прощён', '✓');
                    closeUserProfileModal();
                    loadReports();
                } else {
                    showToast('error', 'Ошибка', '❌');
                }
            } catch (err) {
                showToast('error', 'Ошибка сети', '❌');
            }
        }

        async function muteUser() {
            if (!currentProfileUser) return;
            try {
                const res = await fetch('/api/v1/users/' + currentProfileUser.id + '/mute', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    showToast('success', 'Пользователь замучен', '🔇');
                } else {
                    showToast('error', 'Ошибка', '❌');
                }
            } catch (err) {
                showToast('error', 'Ошибка сети', '❌');
            }
        }

        let currentDurationAction = null;

        function openDurationModal(action) {
            currentDurationAction = action;
            const modal = document.getElementById('durationModal');
            const title = document.getElementById('durationModalTitle');
            title.textContent = action === 'mute' ? (window.i18n?.t('muteDurationTitle') || '🔇 Выберите время мута') : (window.i18n?.t('banDurationTitle') || '🚫 Выберите время бана');
            modal.classList.add('active');
        }

        function closeDurationModal() {
            document.getElementById('durationModal').classList.remove('active');
            currentDurationAction = null;
        }

        async function applyDuration(duration) {
            if (!currentProfileUser || !currentDurationAction || !currentProfileUser.id) {
                console.error('Invalid state:', { currentProfileUser, currentDurationAction });
                return;
            }
            const action = currentDurationAction;
            const reason = document.getElementById('durationReason').value.trim();
            closeDurationModal();

            try {
                const url = '/api/v1/users/' + currentProfileUser.id + '/' + action;
                console.log('Calling:', url, { duration, reason });
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ duration, reason })
                });
                if (res.ok) {
            showToast('success', action === 'mute' ? (window.i18n?.t('userMuted') || 'Пользователь замучен') : (window.i18n?.t('userBlocked') || 'Пользователь заблокирован'), action === 'mute' ? '🔇' : '🚫');
                    closeUserProfileModal();
                    // Обновляем список жалоб
                    loadReports();
                } else {
                    const error = await res.json();
                    console.error('API error:', error);
                    showToast('error', 'Ошибка: ' + (error.error || 'Неизвестная ошибка'), '❌');
                }
            } catch (err) {
                console.error('Network error:', err);
                showToast('error', 'Ошибка сети', '❌');
            }
        }

        function muteUser() {
            openDurationModal('mute');
        }

        function blockUser() {
            openDurationModal('block');
        }

        function closeMuteInfoModal() {
            document.getElementById('muteInfoModal').classList.remove('active');
        }

        async function checkMuteStatus() {
            try {
                const res = await fetch('/api/v1/users/' + user.id + '/profile', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    const userData = data.user;
                    const mutePanel = document.getElementById('mutePanel');
                    const inputLeftBtns = document.getElementById('inputLeftBtns');
                    const attachmentPanel = document.getElementById('attachmentPanel');
                    const msgInput = document.getElementById('msgInput');
                    const voiceRecordingBar = document.getElementById('voiceRecordingBar');
                    const sendBtn = document.getElementById('sendBtn');
                    const voiceBtn = document.getElementById('voiceBtn');
                    const videoNoteBtn = document.getElementById('videoNoteBtn');
                    const emojiPicker = document.getElementById('emojiPicker');
                    const mutePanelText = document.getElementById('mutePanelText');

                    if (userData.isMuted) {
                        mutePanel.style.display = 'block';
                        inputLeftBtns.style.display = 'none';
                        msgInput.style.display = 'none';
                        voiceRecordingBar.style.display = 'none';
                        sendBtn.style.display = 'none';
                        voiceBtn.style.display = 'none';
                        videoNoteBtn.style.display = 'none';

                        if (userData.mutedUntil) {
                            const mutedUntil = new Date(userData.mutedUntil);
                            const now = new Date();
                            const diffMs = mutedUntil - now;
                            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                            const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

                            let timeText = '';
                            if (diffDays > 0) {
                                timeText = `Осталось ${diffDays} ${diffDays === 1 ? 'день' : diffDays < 5 ? 'дня' : 'дней'}`;
                            } else if (diffHours > 0) {
                                timeText = `Осталось ${diffHours} ${diffHours === 1 ? 'час' : diffHours < 5 ? 'часа' : 'часов'}`;
                            } else {
                                timeText = 'Мут скоро истечет';
                            }

                            const dateStr = mutedUntil.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
                            mutePanelText.textContent = `До ${dateStr} (${timeText})`;
                        } else {
                            mutePanelText.textContent = 'Навсегда';
                        }
                    } else {
                        mutePanel.style.display = 'none';
                        inputLeftBtns.style.display = 'flex';
                        msgInput.style.display = 'block';
                        voiceRecordingBar.style.display = 'none';
                        sendBtn.style.display = 'none';
                        voiceBtn.style.display = 'flex';
                        videoNoteBtn.style.display = 'none';
                    }
                }
            } catch (err) {
                console.error('Check mute status error:', err);
            }
        }

        async function showMuteInfoModal(errorMessage) {
            const modal = document.getElementById('muteInfoModal');
            const infoText = document.getElementById('muteInfoText');
            const reasonBlock = document.getElementById('muteReasonBlock');
            const reasonText = document.getElementById('muteReasonText');

            // Парсим причину из сообщения об ошибке
            let reason = null;
            if (errorMessage && errorMessage.includes('Причина:')) {
                reason = errorMessage.split('Причина: ')[1];
            }

            // Получаем данные пользователя для информации о дате окончания мута
            try {
                const res = await fetch('/api/v1/users/' + user.id + '/profile', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    const userData = data.user;

                    if (userData.mutedUntil) {
                        const mutedUntil = new Date(userData.mutedUntil);
                        const now = new Date();
                        const diffMs = mutedUntil - now;
                        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                        const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

                        let timeText = '';
                        if (diffDays > 0) {
                            timeText = `Осталось ${diffDays} ${diffDays === 1 ? 'день' : diffDays < 5 ? 'дня' : 'дней'}`;
                        } else if (diffHours > 0) {
                            timeText = `Осталось ${diffHours} ${diffHours === 1 ? 'час' : diffHours < 5 ? 'часа' : 'часов'}`;
                        } else {
                            timeText = 'Мут скоро истечет';
                        }

                        const dateStr = mutedUntil.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
                        infoText.textContent = `До ${dateStr} (${timeText})`;
                    } else {
                        infoText.textContent = 'Навсегда';
                    }
                } else {
                    infoText.textContent = 'Загрузка...';
                }
            } catch (err) {
                infoText.textContent = 'Ошибка загрузки данных';
            }

            // Показываем причину если есть
            if (reason) {
                reasonBlock.style.display = 'block';
                reasonText.textContent = reason;
            } else {
                reasonBlock.style.display = 'none';
            }

            modal.classList.add('active');
        }

        async function unmuteUser() {
            if (!currentProfileUser) return;
            try {
                const res = await fetch('/api/v1/users/' + currentProfileUser.id + '/unmute', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    showToast('success', 'Пользователь размучен', '🔊');
                    closeUserProfileModal();
                    loadReports();
                } else {
                    showToast('error', 'Ошибка', '❌');
                }
            } catch (err) {
                showToast('error', 'Ошибка сети', '❌');
            }
        }

        async function unblockUser() {
            if (!currentProfileUser) return;
            try {
                const res = await fetch('/api/v1/users/' + currentProfileUser.id + '/unblock', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    showToast('success', 'Пользователь разбанен', '✅');
                    closeUserProfileModal();
                    loadReports();
                } else {
                    showToast('error', 'Ошибка', '❌');
                }
            } catch (err) {
                showToast('error', 'Ошибка сети', '❌');
            }
        }

        async function openReportDetails(reportId) {
            try {
                const r = await fetch('/api/v1/reports/' + reportId, { headers: { Authorization: 'Bearer ' + token } });
                if (!r.ok) return;
                const d = await r.json();
                const report = d.report;

                if (!report) return;

                // Загружаем актуальные данные пользователя через API
                const profileRes = await fetch('/api/v1/users/' + report.reported_user_id + '/profile', {
                    headers: { Authorization: 'Bearer ' + token }
                });
                let userData = {
                    id: report.reported_user_id,
                    name: report.reported_first_name || report.reported_username || 'Пользователь',
                    username: report.reported_username || '',
                    avatarUrl: report.reported_avatar_url || '',
                    bio: `Жалоба: ${getReasonLabel(report.reason)}\n${report.description || ''}`,
                    online: false,
                    isBot: false,
                    isBlocked: false
                };

                if (profileRes.ok) {
                    const profileData = await profileRes.json();
                    userData = {
                        id: profileData.user.id,
                        name: profileData.user.firstName || profileData.user.username || 'Пользователь',
                        username: profileData.user.username || '',
                        avatarUrl: profileData.user.avatarUrl || '',
                        bio: `Жалоба: ${getReasonLabel(report.reason)}\n${report.description || ''}`,
                        online: false,
                        isBot: false,
                        isBlocked: profileData.user.isBlocked || false,
                        isMuted: profileData.user.isMuted || false,
                        fromReport: true,
                        reportStatus: report.status,
                        reportId: report.id
                    };
                }

                // Открываем профиль
                openUserProfileModal(userData);

                // Закрываем панель жалоб
                reportsPanelOpen = false;
                document.getElementById('reportsPanel').style.display = 'none';
                document.getElementById('messages').style.display = 'flex';
            } catch (err) {
                console.error('Error loading report details:', err);
            }
        }

        async function loadSupportRequests() {
            const list = document.getElementById('supportList');
            list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">Загрузка...</div>';
            try {
                const r = await fetch('/api/v1/support/requests', { headers: { Authorization: 'Bearer ' + token } });
                if (!r.ok) { list.innerHTML = '<div style="color:#FF4B4B;padding:12px">Ошибка загрузки</div>'; return; }
                const d = await r.json();
                const requests = d.requests || [];
                if (!requests.length) {
                    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px">Нет запросов</div>';
                    return;
                }
                list.innerHTML = requests.map(function(req) {
                    const name = ((req.first_name || '') + ' ' + (req.last_name || '')).trim() || req.username || 'Пользователь';
                    const av = req.avatar_url ? '<img src="' + req.avatar_url + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : name[0].toUpperCase();
                    const statusColor = req.status === 'open' ? '#FF007F' : '#00C864';
                    const statusLabel = req.status === 'open' ? 'Открыт' : 'Закрыт';
                    const time = new Date(req.created_at).toLocaleString('ru', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
                    return '<div style="background:var(--bg-secondary);border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer;border:1px solid var(--border-color)" onclick="openSupportChat(\'' + req.chat_id + '\',\'' + req.user_id + '\',\'' + req.id + '\')">'
                        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
                        + '<div style="width:36px;height:36px;border-radius:50%;background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden">' + av + '</div>'
                        + '<div style="flex:1;min-width:0">'
                        + '<div style="font-size:14px;font-weight:600">' + name + ' <span style="color:var(--text-muted);font-weight:400;font-size:12px">@' + (req.username || '') + '</span></div>'
                        + '<div style="font-size:11px;color:var(--text-muted)">' + time + '</div>'
                        + '</div>'
                        + '<span style="font-size:11px;font-weight:600;color:' + statusColor + ';background:' + statusColor + '22;padding:3px 8px;border-radius:6px;flex-shrink:0">' + statusLabel + '</span>'
                        + '</div>'
                        + '<div style="font-size:14px;color:var(--text-secondary);line-height:1.4;word-break:break-word">' + req.message + '</div>'
                        + '</div>';
                }).join('');
            } catch (e) {
                list.innerHTML = '<div style="color:#FF4B4B;padding:12px">Ошибка: ' + e.message + '</div>';
            }
        }

        async function openSupportChat(chatId, userId, requestId) {
            // Закрываем панель
            document.getElementById('supportPanel').style.display = 'none';
            document.getElementById('messages').style.display = 'flex';
            supportPanelOpen = false;

            if (!requestId || requestId === 'null') return;

            // Загружаем историю чата пользователя с ботом
            try {
                const r = await fetch('/api/v1/support/requests/' + requestId + '/messages', {
                    headers: { Authorization: 'Bearer ' + token }
                });
                if (!r.ok) { showToast('error', 'Ошибка загрузки', '❌'); return; }
                const d = await r.json();

                // Открываем модальный чат
                const modal = document.getElementById('supportChatModal');
                const userName = (d.user.first_name || d.user.username || 'Пользователь');
                document.getElementById('supportChatUserName').textContent = userName;
                modal.dataset.requestId = requestId;
                modal.dataset.chatId = d.chatId || '';
                modal.dataset.status = d.status || 'open';

                // Блокируем ввод если запрос закрыт
                const input = document.getElementById('supportChatInput');
                const sendBtn = modal.querySelector('button[onclick="sendSupportReply()"]');
                const isClosed = d.status === 'closed';
                input.disabled = isClosed;
            input.placeholder = isClosed ? (window.i18n?.t('requestClosedPlaceholder') || 'Запрос закрыт — ответить нельзя') : (window.i18n?.t('supportReplyPlaceholder') || 'Ответить от имени CraneApp...');
                input.style.opacity = isClosed ? '0.5' : '1';
                if (sendBtn) sendBtn.style.opacity = isClosed ? '0.4' : '1';

                // Рендерим сообщения
                const msgsEl = document.getElementById('supportChatMessages');
                msgsEl.innerHTML = '';
                (d.messages || []).forEach(function(m) {
                    const isBot = m.is_bot;
                    const div = document.createElement('div');
                    div.style.cssText = 'max-width:80%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.4;word-break:break-word;'
                        + (isBot
                            ? 'background:var(--accent-gradient);color:#fff;align-self:flex-end;border-bottom-right-radius:4px;margin-left:auto'
                            : 'background:var(--bg-secondary);align-self:flex-start;border-bottom-left-radius:4px');
                    div.textContent = m.content;
                    msgsEl.appendChild(div);
                });
                msgsEl.scrollTop = 99999;

                modal.style.display = 'flex';
                document.getElementById('supportChatInput').focus();
            } catch (e) {
                showToast('error', 'Ошибка: ' + e.message, '❌');
            }
        }

        function closeSupportChatModal() {
            document.getElementById('supportChatModal').style.display = 'none';
            document.getElementById('supportChatInput').value = '';
        }

        async function sendSupportReply() {
            const input = document.getElementById('supportChatInput');
            const text = input.value.trim();
            if (!text) return;

            const modal = document.getElementById('supportChatModal');
            const requestId = modal.dataset.requestId;
            if (!requestId) return;

            try {
                const r = await fetch('/api/v1/support/requests/' + requestId + '/reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                    body: JSON.stringify({ message: text })
                });

                if (r.ok) {
                    // Добавляем сообщение в чат
                    const msgsEl = document.getElementById('supportChatMessages');
                    const div = document.createElement('div');
                    div.style.cssText = 'max-width:80%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.4;word-break:break-word;background:var(--accent-gradient);color:#fff;align-self:flex-end;border-bottom-right-radius:4px;margin-left:auto';
                    div.textContent = text;
                    msgsEl.appendChild(div);
                    msgsEl.scrollTop = 99999;
                    input.value = '';
                    input.style.height = 'auto';
                    showToast('success', 'Ответ отправлен', '✓');
                } else {
                    const d = await r.json();
                    showToast('error', d.error || 'Ошибка', '❌');
                }
            } catch (e) {
                showToast('error', 'Ошибка сети', '❌');
            }
        }

        // Enter для отправки в support chat
        document.getElementById('supportChatInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSupportReply(); }
        });

        // ── Group Members ──────────────────────────────────────────────
        async function openGroupMembers() {            if (!activeChat) return;
            document.getElementById('groupMembersTitle').textContent = activeChat.name + ' — участники';
            document.getElementById('groupMembersModal').classList.add('active');
            const list = document.getElementById('groupMembersList');
            list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Загрузка...</div>';
            try {
                const res = await fetch('/api/v1/chats/' + activeChat.id + '/members-online', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (!res.ok) throw new Error();
                const data = await res.json();
                list.innerHTML = data.members.map(m => {
                    const name = (m.firstName || '') + (m.lastName ? ' ' + m.lastName : '') || m.username;
                    const av = m.avatarUrl
                        ? `<img src="${m.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                        : name[0].toUpperCase();
                    const roleLabel = m.role === 'owner' ? '<span style="font-size:11px;color:var(--accent-color);margin-left:6px;">Создатель</span>' : '';
                    const onlineDot = m.isOnline ? '<span style="width:8px;height:8px;border-radius:50%;background:#00E676;display:inline-block;margin-left:6px;"></span>' : '';
                    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-color);">
                        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#FF007F,#9D00FF);display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;flex-shrink:0;overflow:hidden;">${av}</div>
                        <div style="flex:1;">
                            <div style="font-size:15px;font-weight:500;">${name}${roleLabel}${onlineDot}</div>
                            <div style="font-size:12px;color:var(--text-muted);">@${m.username}</div>
                        </div>
                    </div>`;
                }).join('') || '<div style="padding:20px;text-align:center;color:var(--text-muted);">Нет участников</div>';
            } catch (e) {
                list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Ошибка загрузки</div>';
            }
        }

        function pluralMembers(n) {
            if (n % 10 === 1 && n % 100 !== 11) return 'участник';
            if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'участника';
            return 'участников';
        }

        function closeGroupMembers() {
            document.getElementById('groupMembersModal').classList.remove('active');
        }

        document.getElementById('groupMembersModal').addEventListener('click', function(e) {
            if (e.target.id === 'groupMembersModal') closeGroupMembers();
        });

        function handleGroupAvatar(input) {
            const file = input.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) { showToast('error', 'Файл слишком большой', '❌'); return; }
            const reader = new FileReader();
            reader.onload = e => {
                groupAvatarBase64 = e.target.result;
                const preview = document.getElementById('groupAvatarPreview');
                preview.innerHTML = `<img src="${groupAvatarBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            };
            reader.readAsDataURL(file);
        }

        function searchGroupMembers(query) {
            clearTimeout(groupSearchTimeout);
            const list = document.getElementById('groupMemberList');
            if (!query || query.length < 2) {
                list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Начните вводить имя или @username</div>';
                return;
            }
            list.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:13px;">Поиск...</div>';
            groupSearchTimeout = setTimeout(async () => {
                try {
                    const res = await fetch('/api/v1/users/search?q=' + encodeURIComponent(query.replace('@','')), {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (!res.ok) { list.innerHTML = ''; return; }
                    const data = await res.json();
                    const users = (data.users || []).filter(u => u.id !== user.id);
                    if (!users.length) {
                        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Пользователи не найдены</div>';
                        return;
                    }
                    list.innerHTML = users.map(u => {
                        const name = ((u.firstName||'') + (u.lastName ? ' '+u.lastName : '')).trim() || u.username;
                        const checked = groupSelectedIds.has(u.id);
                        const av = u.avatarUrl ? `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : name[0].toUpperCase();
                        return `<div data-uid="${u.id}" data-uname="${name.replace(/"/g,'&quot;')}" onclick="toggleGroupMember('${u.id}','${name.replace(/'/g,"\\'")}','${u.avatarUrl||''}')" style="display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-color);transition:background 0.15s;${checked?'background:rgba(255,0,127,0.08);':''}">
                            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#FF007F,#9D00FF);display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;flex-shrink:0;overflow:hidden;">${av}</div>
                            <div style="flex:1;"><div style="font-size:14px;font-weight:500;">${name}</div><div style="font-size:12px;color:var(--text-muted);">@${u.username}</div></div>
                            <div style="width:22px;height:22px;border-radius:50%;border:2px solid ${checked?'var(--accent-color)':'var(--border-color)'};background:${checked?'var(--accent-color)':'transparent'};display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;">${checked?'✓':''}</div>
                        </div>`;
                    }).join('');
                } catch (e) {
                    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Ошибка поиска</div>';
                }
            }, 400);
        }

        // Хранилище имён и аватарок выбранных участников
        const groupMemberNames = {};
        const groupMemberAvatars = {};

        function toggleGroupMember(id, name, avatarUrl) {
            if (groupSelectedIds.has(id)) {
                groupSelectedIds.delete(id);
                delete groupMemberNames[id];
                delete groupMemberAvatars[id];
            } else {
                groupSelectedIds.add(id);
                groupMemberNames[id] = name;
                groupMemberAvatars[id] = avatarUrl;
            }
            renderGroupSelected();
            const q = document.getElementById('groupMemberSearch').value;
            if (q.length >= 2) searchGroupMembers(q);
        }

        function renderGroupSelected() {
            const container = document.getElementById('groupSelectedMembers');
            if (!groupSelectedIds.size) { container.innerHTML = ''; return; }
            container.innerHTML = Array.from(groupSelectedIds).map(id => {
                const name = groupMemberNames[id] || '?';
                const av = groupMemberAvatars[id];
                const avatarContent = av
                    ? `<img src="${av}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                    : name[0].toUpperCase();
                return `<div style="display:flex;align-items:center;gap:6px;background:rgba(255,0,127,0.12);border:1px solid rgba(255,0,127,0.25);border-radius:20px;padding:4px 10px 4px 6px;font-size:13px;">
                    <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#FF007F,#9D00FF);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;overflow:hidden;">${avatarContent}</div>
                    <span>${name}</span>
                    <span onclick="toggleGroupMember('${id}','${name.replace(/'/g,"\\'")}','${(groupMemberAvatars[id]||'').replace(/'/g,"\\'")}'')" style="cursor:pointer;opacity:0.6;font-size:14px;margin-left:2px;">×</span>
                </div>`;
            }).join('');
        }

        async function submitCreateGroup() {
            const title = document.getElementById('groupTitleInput').value.trim();
            if (!title) { showToast('error', 'Введите название группы', '❌'); return; }
            if (groupSelectedIds.size === 0) { showToast('error', 'Добавьте хотя бы одного участника', '❌'); return; }

            const btn = document.querySelector('#createGroupModal button[onclick="submitCreateGroup()"]');
            btn.disabled = true; btn.textContent = 'Создание...';

            try {
                const body = {
                    title,
                    description: document.getElementById('groupDescInput').value.trim(),
                    members: Array.from(groupSelectedIds)
                };
                if (groupAvatarBase64) body.avatar = groupAvatarBase64;

                const res = await fetch('/api/v1/chats/create-group', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (res.ok) {
                    closeCreateGroupModal();
                    showToast('success', `Группа "${title}" создана`, '✓');
                    await loadChats();
                    setTimeout(() => {
                        const chat = allChats.find(c => c.id === data.chatId);
                        if (chat) openChat(chat.id, chat.name || chat.title || title);
                    }, 500);
                } else {
                    showToast('error', data.error || 'Ошибка создания', '❌');
                }
            } catch (e) {
                showToast('error', 'Ошибка сети', '❌');
            } finally {
                btn.disabled = false; btn.textContent = 'Создать группу';
            }
        }

        document.getElementById('createGroupModal').addEventListener('click', function(e) {
            if (e.target.id === 'createGroupModal') closeCreateGroupModal();
        });
        
 // ============================================
 // CRANEAPP BOT GREETING - Session Check
 // ============================================
 function getDeviceInfo() {
 var ua = navigator.userAgent;
 var device = 'устройства';
            
 if (/mobile/i.test(ua)) {
 device = 'мобильного устройства';
 } else if (/tablet/i.test(ua)) {
 device = 'планшета';
 } else if (/iPad/i.test(ua)) {
 device = 'iPad';
 } else if (/iPhone/i.test(ua)) {
 device = 'iPhone';
 } else if (/Android/i.test(ua)) {
 device = 'Android-устройства';
 } else if (/Windows/i.test(ua)) {
 device = 'Windows';
 } else if (/Mac/i.test(ua)) {
 device = 'Mac';
 } else if (/Linux/i.test(ua)) {
 device = 'Linux';
 }
            
 return device;
 }

 function getCurrentTime() {
 var now = new Date();
 var hours = now.getHours().toString().padStart(2, '0');
 var minutes = now.getMinutes().toString().padStart(2, '0');
 return hours + ':' + minutes;
 }

 function checkSessionAndShowGreeting() {
 fetch('/api/v1/auth/sessions', {
 headers: { 'Authorization': 'Bearer ' + token }
 })
 .then(function(res) { return res.json(); })
 .then(function(data) {
 if (data.sessions && data.sessions.length >0) {
 // Если есть более одной сессии
 if (data.sessions.length >1) {
 var device = getDeviceInfo();
 var time = getCurrentTime();
 var userName = user.firstName || user.username || 'пользователь';
                        
 var greetingMsg = 'Здравствуйте, ' + userName + ', кто-то вошел в ваш аккаунт с ' + device + ' в ' + time + '.\n\nЕсли это были не вы, НЕЗАМЕДЛИТЕЛЬНО завершите сеанс в настройках.';
                        
 showCraneAppGreeting(greetingMsg);
 }
 }
 })
 .catch(function(err) {
 console.error('Session check error:', err);
 });
 }

 function showCraneAppGreeting(message) {
 var container = document.getElementById('toastContainer');
            
 var toast = document.createElement('div');
 toast.className = 'toast craneapp-greeting';
 toast.innerHTML = '<div class="craneapp-greeting-header"><span>🤖 CraneApp</span></div>' +
 '<div class="craneapp-greeting-body">' + message.replace(/\n/g, '<br>') + '</div>';
            
 container.appendChild(toast);
            
 setTimeout(function() {
 toast.style.opacity = '0';
 setTimeout(function() { toast.remove(); },300);
 },10000);
 }

 // Запускаем проверку при загрузке
 checkSessionAndShowGreeting();

 // Обновляем вкладки папок при возврате на страницу
 window.addEventListener('focus', function() { initFolderTabs(); });
 document.addEventListener('visibilitychange', function() {
     if (!document.hidden) initFolderTabs();
 });
