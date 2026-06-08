const contacts = [
            { id: 'craneapp_bot', name: 'CraneApp Bot', av: '🤖' },
            { id: '2', name: 'Поддержка', av: '🎧' },
            { id: '3', name: 'Новости', av: '📢' },
            { id: '4', name: 'Дизайн Чат', av: '🎨' },
            { id: '5', name: 'Работа', av: '💼' }
        ];

        let selected = [];

        function renderContacts() {
            const container = document.getElementById('contactList');
            container.innerHTML = '';
            contacts.forEach(c => {
                const item = document.createElement('div');
                item.className = 'contact-item' + (selected.includes(c.id) ? ' selected' : '');
                item.onclick = () => toggleContact(c.id);
                item.innerHTML = `
                    <div class="contact-avatar">${c.av}</div>
                    <div class="contact-name">${c.name}</div>
                    <div class="checkmark">✓</div>
                `;
                container.appendChild(item);
            });
            document.getElementById('nextBtn').disabled = selected.length === 0;
        }

        function toggleContact(id) {
            if (selected.includes(id)) {
                selected = selected.filter(i => i !== id);
            } else {
                selected.push(id);
            }
            renderContacts();
        }

        function previewAvatar(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.querySelector('.avatar-upload').innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;border-radius:50px;object-fit:cover;">`;
                };
                reader.readAsDataURL(file);
            }
        }

        function createGroup() {
            const name = document.getElementById('groupName').value.trim();
            if (!name) { alert('Введите название группы'); return; }
            alert(`Группа "${name}" создана с ${selected.length} участниками!`);
            window.location.href = './chats.html';
        }

        renderContacts();