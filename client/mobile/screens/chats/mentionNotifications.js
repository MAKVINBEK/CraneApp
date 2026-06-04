(function(root) {
    function isGroupChat(chat) {
        return !!(chat && (chat.type === 'group' || chat.isGroup));
    }

    function toTime(value) {
        if (!value) return 0;
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
    }

    function getMessageTime(message) {
        return toTime(message && (message.createdAt || message.created_at));
    }

    function getSenderId(message) {
        return message && (message.senderId || message.sender_id || (message.sender && message.sender.id));
    }

    function chatHasUnreadMention(chat) {
        return isGroupChat(chat) && (Number(chat.mentionCount) || 0) > 0;
    }

    function clearMentionState(chat) {
        const next = Object.assign({}, chat);
        next.mentionCount = 0;
        next.latestMentionAt = null;
        next.oldestMentionMessageId = null;
        return next;
    }

    function messageMentionsUser(message, userId) {
        if (!message || !userId) return false;
        if (String(message.id || '').startsWith('temp-')) return false;
        if (getSenderId(message) === userId) return false;
        return Array.isArray(message.mentionedUserIds) && message.mentionedUserIds.includes(userId);
    }

    function getUnreadMentionMessages(messages, options) {
        const opts = options || {};
        const userId = opts.userId;
        const readTime = toTime(opts.mentionReadAt);
        const list = Array.isArray(messages) ? messages : Object.keys(messages || {}).map(function(id) {
            return messages[id];
        });

        return list
            .filter(function(message) {
                return messageMentionsUser(message, userId) && getMessageTime(message) > readTime;
            })
            .sort(function(a, b) {
                return getMessageTime(a) - getMessageTime(b);
            });
    }

    function getMentionCursorAfterJump(currentCursor, message) {
        if (!message) return currentCursor || '';
        return message.createdAt || message.created_at || currentCursor || '';
    }

    const api = {
        chatHasUnreadMention,
        clearMentionState,
        getMentionCursorAfterJump,
        getUnreadMentionMessages,
        messageMentionsUser
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    root.mentionNotifications = api;
})(typeof window !== 'undefined' ? window : globalThis);
