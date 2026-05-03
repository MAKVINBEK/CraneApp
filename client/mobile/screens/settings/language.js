const token = localStorage.getItem('craneapp_auth_token');

        // Только переведённые языки
        const PINNED = ['ru', 'en'];
        const LANGUAGES = [
            { code: 'ru', name: 'Русский',    sub: 'Russian'     },
            { code: 'en', name: 'English',     sub: 'English'     },
            { code: 'de', name: 'Deutsch',     sub: 'German'      },
            { code: 'fr', name: 'Français',    sub: 'French'      },
            { code: 'es', name: 'Español',     sub: 'Spanish'     },
            { code: 'it', name: 'Italiano',    sub: 'Italian'     },
            { code: 'pt', name: 'Português',   sub: 'Portuguese'  },
            { code: 'pl', name: 'Polski',      sub: 'Polish'      },
            { code: 'uk', name: 'Українська',  sub: 'Ukrainian'   },
            { code: 'tr', name: 'Türkçe',      sub: 'Turkish'     },
        ];

        let current = localStorage.getItem('craneapp_language') || 'ru';

        function render(q) {
            q = (q || '').toLowerCase().trim();
            const content = document.getElementById('content');

            const match = l => !q || l.name.toLowerCase().includes(q) || l.sub.toLowerCase().includes(q) || l.code.includes(q);

            const pinned = LANGUAGES.filter(l => PINNED.includes(l.code) && match(l));
            const rest   = LANGUAGES.filter(l => !PINNED.includes(l.code) && match(l));

            if (!pinned.length && !rest.length) {
                content.innerHTML = '<div class="no-results">Ничего не найдено</div>';
                return;
            }

            let html = '';

            if (!q) {
                if (pinned.length) {
                    html += '<div class="section-label">Закреплённые</div><div class="section">' + pinned.map(row).join('') + '</div>';
                }
                if (rest.length) {
                    html += '<div class="section-label" style="margin-top:8px;">Все языки</div><div class="section">' + rest.map(row).join('') + '</div>';
                }
            } else {
                html += '<div class="section">' + [...pinned, ...rest].map(row).join('') + '</div>';
            }

            content.innerHTML = html;
        }

        const SVG_FLAGS = {
            gb: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" width="42" height="28" style="display:block"><rect width="60" height="30" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></svg>',
            tr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 28" width="38" height="28" style="display:block"><rect width="38" height="28" fill="#E30A17"/><circle cx="15" cy="14" r="7.5" fill="#fff"/><circle cx="18.2" cy="14" r="6" fill="#E30A17"/><polygon points="23,14 25.2,10.8 25.2,17.2" fill="#fff" transform="rotate(-15,23,14)"/><polygon points="26,14 27.8,11.8 27.8,16.2" fill="#fff" transform="rotate(-15,26,14)"/></svg>',
            pt: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 28" width="38" height="28" style="display:block"><rect width="38" height="28" fill="#FF0000"/><rect width="15" height="28" fill="#006600"/><circle cx="15" cy="14" r="5.5" fill="#FFD700"/><circle cx="15" cy="14" r="4.5" fill="#fff"/><rect x="12.5" y="11.5" width="5" height="5" rx="0.5" fill="#003399"/><line x1="15" y1="11.5" x2="15" y2="16.5" stroke="#fff" stroke-width="0.8"/><line x1="12.5" y1="14" x2="17.5" y2="14" stroke="#fff" stroke-width="0.8"/></svg>'
        };

        function row(l) {
            const sel = l.code === current;
            const flagMap = { en: 'gb', uk: 'ua' };
            const flagCode = flagMap[l.code] || l.code;
            const flagHtml = SVG_FLAGS[flagCode]
                ? '<div class="flag-wrap" style="width:' + (flagCode === 'gb' ? '42' : '38') + 'px">' + SVG_FLAGS[flagCode] + '</div>'
                : '<div class="flag-wrap flag-' + flagCode + '"></div>';
            return '<div class="lang-item' + (sel ? ' selected' : '') + '" onclick="pick(\'' + l.code + '\')">'
                + flagHtml
                + '<div class="lang-info"><div class="lang-name">' + l.name + '</div><div class="lang-sub">' + l.sub + '</div></div>'
                + (sel ? '<span class="lang-check">✓</span>' : '')
                + '</div>';
        }

        async function pick(code) {
            if (code === current) return;
            current = code;

            const s = JSON.parse(localStorage.getItem('craneapp_settings') || '{}');
            s.language = code;
            localStorage.setItem('craneapp_settings', JSON.stringify(s));
            localStorage.setItem('craneapp_language', code);

            if (window.i18n) window.i18n.setLanguage(code);

            render(document.getElementById('searchInput').value);
            toast('Язык изменён', '✓');

            try {
                await fetch('/api/v1/users/all-settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ settings: { language: code } })
                });
            } catch (e) {}
        }

        function toast(msg, icon) {
            const t = document.createElement('div');
            t.className = 'toast';
            t.innerHTML = '<span>' + icon + '</span><span>' + msg + '</span>';
            document.getElementById('toastContainer').appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2000);
        }

        async function init() {
            try {
                const res = await fetch('/api/v1/users/all-settings', { headers: { 'Authorization': 'Bearer ' + token } });
                if (res.ok) {
                    const d = await res.json();
                    if (d.settings?.language) {
                        current = d.settings.language;
                        localStorage.setItem('craneapp_language', current);
                    }
                }
            } catch (e) {}
            render('');
        }

        init();