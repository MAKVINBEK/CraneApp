const fs = require('fs');
const path = 'C:/Users/Matvey/CraneApp/client/mobile/screens/chats/chats_v5.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Add Export button in groupInfoModal
const dropdownTarget = `                    \${bansBtnHtml}
                    \${muteBtnHtml}
                    <div style="height:1px; background:\\\${dropdownBorder}; margin:4px 0;"></div>`;

const dropdownReplacement = `                    \${bansBtnHtml}
                    \${muteBtnHtml}
                    <div onclick="exportChatHistory()" style="display:flex; align-items:center; gap:10px; padding:10px 14px; font-size:13px; color:var(--text-primary); cursor:pointer; transition:background 0.2s; font-family:Geologica,sans-serif;" onmouseover="this.style.background='\\\${dropdownHover}'" onmouseout="this.style.background='transparent'">
                        <span style="font-size:22px;">💾</span>
                        <span>\\\${isRu ? 'Экспорт истории' : 'Export History'}</span>
                    </div>
                    <div style="height:1px; background:\\\${dropdownBorder}; margin:4px 0;"></div>`;

content = content.replace(dropdownTarget, dropdownReplacement);

// 2. Add exportChatHistory function
const exportFunc = `
        async function exportChatHistory() {
            if (!activeChat) return;
            const chatId = activeChat.id;
            const isRu = (window.i18n?.currentLang || localStorage.getItem('craneapp_language') || 'ru') === 'ru';
            showToast('info', isRu ? 'Экспорт истории начат...' : 'Export started...', '⏳');
            
            try {
                let msgs = [];
                const res = await fetch('/api/v1/messages/' + chatId, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    msgs = data.messages || [];
                } else {
                    msgs = Object.values(messagesData);
                }
                
                msgs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                
                let txtContent = \`История чата: \${activeChat.name}\\nЭкспортировано: \${new Date().toLocaleString()}\\n\\n\`;
                msgs.forEach(m => {
                    const d = new Date(m.createdAt).toLocaleString();
                    const sName = m.senderId === user.id ? (user.name || user.username || 'Я') : (chatUsers[m.senderId]?.name || 'Пользователь');
                    const text = m.contentPlain || m.content || '[Вложение/Системное сообщение]';
                    txtContent += \`[\${d}] \${sName}: \${text}\\n\`;
                });
                
                const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`chat_export_\${chatId.substring(0,8)}.txt\`;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showToast('success', isRu ? 'Экспорт завершен' : 'Export completed', '✅');
                }, 100);
            } catch(e) {
                console.error(e);
                showToast('error', isRu ? 'Ошибка при экспорте' : 'Export failed', '❌');
            }
        }
`;

const insertTarget = `        // ============================================`;
content = content.replace(insertTarget, exportFunc + insertTarget);

// 3. Expose exportChatHistory globally
const exposeTarget = `window.saveChatSettings = async function(chatId) {`;
const exposeReplacement = `window.exportChatHistory = exportChatHistory;\nwindow.saveChatSettings = async function(chatId) {`;

content = content.replace(exposeTarget, exposeReplacement);

fs.writeFileSync(path, content);
console.log('Patched chats_v5.js with exportChatHistory');
