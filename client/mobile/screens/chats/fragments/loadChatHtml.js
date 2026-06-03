(function loadChatHtmlFragments() {
    const root = document.getElementById('chatPageRoot');
    const fragments = [
        'fragments/chats.fragment01.html',
        'fragments/chats.fragment02.html',
    ];

    root.innerHTML = fragments.map((fragment) => loadText(fragment)).join('\n');

    function loadText(path) {
        const request = new XMLHttpRequest();
        request.open('GET', path, false);
        request.send(null);
        if (request.status >= 200 && request.status < 300) return request.responseText;
        throw new Error('Failed to load chat HTML fragment: ' + path);
    }
})();
