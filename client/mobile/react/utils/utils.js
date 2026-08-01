import React from "react";

export const hasMessageMedia = (msg) => !!(msg.mediaUrl || msg.mediaUnavailable);

export const calculateMenuPosition = (clientX, clientY) => {
    const menuWidth = 232;
    const menuHeight = 350;
    const gap = 12;
    const padding = 8;

    const viewportWidth = window.innerWidth || menuWidth;
    const viewportHeight = window.innerHeight || menuHeight;

    return {
        x: Math.min(Math.max(clientX + gap, padding), viewportWidth - menuWidth - padding),
        y: Math.min(Math.max(clientY + gap, padding), viewportHeight - menuHeight - padding),
    };
};

export const parseCallContent = (content) => {
    if (!content || typeof content !== "string") return {};
    try {
        const parsed = JSON.parse(content);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
        return {};
    }
}

export const formatCallDuration = (seconds) => {
    const total = Number(seconds) || 0;
    if (total <= 0) return "";
    const mins = Math.floor(total / 60);
    const rest = String(total % 60).padStart(2, "0");
    return mins ? `${mins}:${rest}` : `${total % 60} сек`;
}

export const formatMessageTime = (value) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export const getCurrentUser = () => {
    try {
        return JSON.parse(localStorage.getItem("craneapp_user_data") || "null");
    } catch {
        return null;
    }
};

/**
 * Форматирует время последнего визита пользователя
 */
export const formatLastSeen = (value, t) => {
    if (value === "recently") return t("lastSeenRecently", "был(а) недавно");

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("lastSeenRecently", "был(а) недавно");

    // Создаем дату для текущего дня БЕЗ привязки к глобальному синглтону (для точности в будущем)
    const today = new Date();
    const sameDay = date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

    const formatted = new Intl.DateTimeFormat(undefined, sameDay
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
    ).format(date);

    // Безопасная замена плейсхолдера, даже если в переводах используется {time}
    return t("lastSeenAt", "был(а) {time}", { time: formatted }).replace("{time}", formatted);
};

/**
 * Генерирует подзаголовок для чата (статус онлайн / печатает / последнее посещение)
 */
export const getChatSubtitle = (chat, typingUserId, t) => {
    if (typingUserId) return t("typing", "печатает...");
    if (chat?.type === "group") return t("groupChat", "Группа");
    if (chat?.peerIsOnline) return t("online", "онлайн");

    return chat?.peerLastSeen
        ? formatLastSeen(chat.peerLastSeen, t)
        : t("lastSeenRecently", "был(а) недавно");
};