/**
 * Apple Emoji Renderer
 * Replaces text emojis with Apple PNG images on every screen.
 */
(function() {
    if (!document.getElementById('apple-emoji-style')) {
        const style = document.createElement('style');
        style.id = 'apple-emoji-style';
        style.textContent = [
            'img.apple-emoji{width:1.2em;height:1.2em;vertical-align:-0.2em;display:inline-block;object-fit:contain;pointer-events:none;user-select:none}',
            '.emoji-item img.apple-emoji,.reaction-picker-emoji img.apple-emoji,.reaction-full-picker-emoji img.apple-emoji,.context-reaction-btn img.apple-emoji{width:28px;height:28px;vertical-align:middle}',
            '.emoji-wrap img.apple-emoji{width:1em;height:1em;vertical-align:middle}'
        ].join('');
        document.head.appendChild(style);
    }

    const faviconLink = document.querySelector('link[rel="icon"]');
    if (!faviconLink) {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        link.href = 'https://i.ibb.co/1Y4Pg7BF/94-20260317155000.png';
        document.head.appendChild(link);
    }

    const CACHE_KEY = 'craneapp_apple_emojis_v2';
    let emojiMap = null;
    let loading = false;
    let pendingCallbacks = [];
    let bodyProcessedAfterLoad = false;

    function emojiToCode(emoji) {
        const parts = [];
        for (let i = 0; i < emoji.length; ) {
            const cp = emoji.codePointAt(i);
            parts.push(cp.toString(16).toUpperCase().padStart(4, '0'));
            i += cp > 0xFFFF ? 2 : 1;
        }
        return 'U+' + parts.join('-');
    }

    function lookupImg(emoji, map) {
        if (!map) return null;
        const code = emojiToCode(emoji);
        if (map[code]) return map[code];

        const noVs = code.replace(/-FE0F/g, '');
        if (noVs !== code && map[noVs]) return map[noVs];

        const withVs = code + '-FE0F';
        if (map[withVs]) return map[withVs];

        const cp = emoji.codePointAt(0);
        return map[cp] || null;
    }

    function buildEmojiMap(entries) {
        const map = {};
        (entries || []).forEach(function(e) {
            if (!e || !e.code || !e.img) return;
            map[e.code] = e.img;
            const primary = parseInt(String(e.code).replace(/^U\+/, '').split('-')[0], 16);
            if (!isNaN(primary) && map[primary] === undefined) {
                map[primary] = e.img;
            }
        });
        return map;
    }

    function finishMapLoad(map) {
        emojiMap = map;
        loading = false;
        const callbacks = pendingCallbacks.slice();
        pendingCallbacks = [];
        callbacks.forEach(function(fn) {
            try { fn(map); } catch (_) {}
        });
        if (document.body && !bodyProcessedAfterLoad) {
            bodyProcessedAfterLoad = true;
            processNode(document.body);
        }
    }

    function getEmojiMap(cb) {
        if (emojiMap) return cb(emojiMap);
        pendingCallbacks.push(cb);
        if (loading) return;
        loading = true;

        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                finishMapLoad(JSON.parse(cached));
                return;
            }
            localStorage.removeItem('craneapp_apple_emojis');
        } catch (_) {}

        const headers = {};
        const token = localStorage.getItem('craneapp_auth_token');
        if (token) headers.Authorization = 'Bearer ' + token;

        fetch('/api/v1/emojis', { headers: headers })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                const map = buildEmojiMap(data.emojis || []);
                try { localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch (_) {}
                finishMapLoad(map);
            })
            .catch(function() {
                loading = false;
                pendingCallbacks.forEach(function(fn) {
                    try { fn(null); } catch (_) {}
                });
                pendingCallbacks = [];
            });
    }

    const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;

    function createEmojiImg(emoji, img) {
        const el = document.createElement('img');
        el.src = img;
        el.alt = emoji;
        el.className = 'apple-emoji';
        el.draggable = false;
        return el;
    }

    function replaceEmojisInNode(node, map) {
        if (!map) return;

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            EMOJI_REGEX.lastIndex = 0;
            if (!EMOJI_REGEX.test(text)) return;
            EMOJI_REGEX.lastIndex = 0;

            const frag = document.createDocumentFragment();
            let lastIndex = 0;
            let match;

            while ((match = EMOJI_REGEX.exec(text)) !== null) {
                const emoji = match[0];
                const img = lookupImg(emoji, map);

                if (match.index > lastIndex) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                }

                if (img) {
                    frag.appendChild(createEmojiImg(emoji, img));
                } else {
                    frag.appendChild(document.createTextNode(emoji));
                }

                lastIndex = match.index + emoji.length;
            }

            if (lastIndex < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            }

            node.parentNode.replaceChild(frag, node);
        } else if (
            node.nodeType === Node.ELEMENT_NODE &&
            node.tagName !== 'SCRIPT' &&
            node.tagName !== 'STYLE' &&
            node.tagName !== 'INPUT' &&
            node.tagName !== 'TEXTAREA' &&
            node.tagName !== 'OPTION' &&
            node.contentEditable !== 'true' &&
            !node.classList.contains('apple-emoji') &&
            !node.hasAttribute('data-no-emoji')
        ) {
            Array.from(node.childNodes).forEach(function(child) {
                replaceEmojisInNode(child, map);
            });
        }
    }

    function processNode(node) {
        getEmojiMap(function(map) {
            if (!map || !node) return;
            replaceEmojisInNode(node, map);
        });
    }

    function textToFragment(text, map) {
        const frag = document.createDocumentFragment();
        if (!text) return frag;

        EMOJI_REGEX.lastIndex = 0;
        let lastIndex = 0;
        let match;

        while ((match = EMOJI_REGEX.exec(text)) !== null) {
            const emoji = match[0];
            const img = lookupImg(emoji, map);

            if (match.index > lastIndex) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            if (img) {
                frag.appendChild(createEmojiImg(emoji, img));
            } else {
                frag.appendChild(document.createTextNode(emoji));
            }

            lastIndex = match.index + emoji.length;
        }

        if (lastIndex < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        return frag;
    }

    function textToHtml(text, cb) {
        getEmojiMap(function(map) {
            if (!map || !text) return cb(text || '');
            const container = document.createElement('span');
            container.appendChild(textToFragment(text, map));
            cb(container.innerHTML);
        });
    }

    function setContent(el, text) {
        getEmojiMap(function(map) {
            if (!el) return;
            el.textContent = '';
            if (!text) return;
            if (!map) {
                el.textContent = text;
                return;
            }
            el.appendChild(textToFragment(text, map));
        });
    }

    function getCaretOffset(el) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0).cloneRange();
        range.selectNodeContents(el);
        range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
        return range.toString().length;
    }

    function setCaretOffset(el, offset) {
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        let remaining = offset;
        let found = false;

        function walk(node) {
            if (found) return;
            if (node.nodeType === Node.TEXT_NODE) {
                if (remaining <= node.textContent.length) {
                    range.setStart(node, remaining);
                    range.collapse(true);
                    found = true;
                } else {
                    remaining -= node.textContent.length;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'IMG') {
                    if (remaining <= 1) {
                        range.setStartAfter(node);
                        range.collapse(true);
                        found = true;
                    } else {
                        remaining -= 1;
                    }
                } else {
                    for (let i = 0; i < node.childNodes.length; i++) {
                        walk(node.childNodes[i]);
                        if (found) return;
                    }
                }
            }
        }

        walk(el);
        if (!found) {
            range.selectNodeContents(el);
            range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function processContentEditable(el) {
        getEmojiMap(function(map) {
            if (!map) return;
            const text = el.innerText || '';
            EMOJI_REGEX.lastIndex = 0;
            if (!EMOJI_REGEX.test(text)) return;

            const offset = getCaretOffset(el);
            Array.from(el.childNodes).forEach(function(child) {
                replaceEmojisInNode(child, map);
            });
            try { setCaretOffset(el, offset); } catch (_) {}
            if (typeof window._updateSendButton === 'function') window._updateSendButton();
        });
    }

    function debounce(fn, ms) {
        let t;
        return function() {
            const args = arguments;
            const ctx = this;
            clearTimeout(t);
            t = setTimeout(function() { fn.apply(ctx, args); }, ms);
        };
    }

    function attachToContentEditable(el) {
        if (el._appleEmojiAttached) return;
        el._appleEmojiAttached = true;
        const handler = debounce(function() {
            el._appleEmojiProcessing = true;
            processContentEditable(el);
            setTimeout(function() { el._appleEmojiProcessing = false; }, 50);
        }, 150);
        el.addEventListener('input', function() {
            if (!el._appleEmojiProcessing) handler();
        });
    }

    function startObserver() {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.contentEditable === 'true') attachToContentEditable(node);
                        node.querySelectorAll('[contenteditable="true"]').forEach(attachToContentEditable);
                        if (node.contentEditable !== 'true' && !node.closest('[contenteditable="true"]')) {
                            processNode(node);
                        }
                    } else if (node.nodeType === Node.TEXT_NODE) {
                        if (!node.parentElement || node.parentElement.closest('[contenteditable="true"]')) return;
                        processNode(node);
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        if (!document.body) return;
        processNode(document.body);
        document.querySelectorAll('[contenteditable="true"]').forEach(attachToContentEditable);
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('craneapp:languagechange', function() {
        if (document.body) processNode(document.body);
    });

    window.appleEmoji = {
        processNode: processNode,
        getEmojiMap: getEmojiMap,
        processContentEditable: processContentEditable,
        textToHtml: textToHtml,
        setContent: setContent,
        lookup: function(emoji) {
            return lookupImg(emoji, emojiMap);
        }
    };
})();
