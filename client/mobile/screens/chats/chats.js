(function loadChatScreenParts() {
    const parts = [
        'parts/chats.part01.chunk',
        'parts/chats.part02.chunk',
        'parts/chats.part03.chunk',
        'parts/chats.part04.chunk',
        'parts/chats.part05.chunk',
        'parts/chats.part06.chunk',
        'parts/chats.part07.chunk',
        'parts/chats.part08.chunk',
        'parts/chats.part09.chunk',
    ];

    const source = parts.map((part) => loadText(part)).join('\n');
    (0, eval)(source + '\n//# sourceURL=/client/mobile/screens/chats/chats.bundle.js');

    function loadText(path) {
        const request = new XMLHttpRequest();
        request.open('GET', path, false);
        request.send(null);
        if (request.status >= 200 && request.status < 300) return request.responseText;
        throw new Error('Failed to load chat screen part: ' + path);
    }
})();
