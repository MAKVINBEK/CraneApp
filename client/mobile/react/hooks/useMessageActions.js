import {translateText} from "../services/translatorApi";
import {useState} from "react";
import {useChat} from "../context/ChatContext";
import { services } from "../../application/services/serviceContainer.js";
import {useToasts} from "./useToasts";
import {useTranslate} from "./useTranslate";

export const useMessageActions = ({
      currentUser,
      chatId,
      updateMessage,
      setIsForwardModalOpen,
      draftRef,
}) => {
    const { t } = useTranslate()
    const [translatingIds, setTranslatingIds] = useState(new Set());
    const {
        setMessages,
        setError,
        editingMessage, setEditingMessage,
        setDraft,
        replyToMessage, setReplyToMessage,
        selectedMessages, setSelectedMessages,
        setPinnedMessages,
        selectionMode, setSelectionMode,
        translations, setTranslations,
        setActionMenu
    } = useChat()
    const { showToast } = useToasts()

    const handleTranslateMessage = async (message) => {
        if (translations[message.id]) {
            setTranslations((prev) => {
                const next = { ...prev };
                delete next[message.id];
                return next;
            });
            return;
        }

        setTranslatingIds((prev) => new Set(prev).add(message.id));
        try {
            const { translatedText, targetLanguage, detectedSourceLang } =
                await translateText(message.content);

            if (detectedSourceLang && detectedSourceLang === targetLanguage) {
                showToast(
                    "success",
                    t("alreadySameLanguage", "Сообщение уже на вашем языке"),
                    "ℹ️",
                );
                return;
            }

            setTranslations((prev) => ({ ...prev, [message.id]: translatedText }));
        } catch (err) {
            showToast(
                "error",
                t("translateError", "Не удалось перевести сообщение"),
                "❌",
            );
        } finally {
            setTranslatingIds((prev) => {
                const next = new Set(prev);
                next.delete(message.id);
                return next;
            });
        }
    }

    const handleDelete = async (message) => {
        try {
            if (selectionMode) {
                await Promise.all(
                    selectedMessages.map((selectedMessage) => {
                        if (selectedMessage.senderId !== currentUser?.id) return;

                        services.messageService.deleteMessage(selectedMessage.id);
                    }),
                );

                const selectedIds = new Set(
                    selectedMessages.map((message) => {
                        if (message.senderId !== currentUser?.id) return;
                        return message.id;
                    }),
                );

                setMessages((messages) =>
                    messages.filter((message) => !selectedIds.has(message.id)),
                );
                setSelectedMessages([]);
                setSelectionMode(false);
            }

            if (!selectionMode) {
                if (message.senderId !== currentUser?.id) return;
                await services.messageService.deleteMessage(message.id);
                setMessages((items) => items.filter((item) => item.id !== message.id));
                if (editingMessage?.id === message.id) {
                    setEditingMessage(null);
                    setDraft("");
                }
                if (replyToMessage?.id === message.id) {
                    setReplyToMessage(null);
                }
            }
            setError("");
        } catch (err) {
            setError(
                err.message ||
                t("messageDeleteError", "Не удалось удалить сообщение(я)"),
            );
        }
    }

    const handleReact = async (message, emoji) => {
        try {
            const result = await services.messageService.reactToMessage(
                message.id,
                emoji,
            );
            setMessages((items) =>
                updateMessage(items, message.id, { reactions: result.reactions || [] }),
            );
            setError("");
        } catch (err) {
            setError(
                err.message || t("reactionError", "Не удалось обновить реакцию"),
            );
        }
    }

    const handleUnpinMessage = async (message) => {
        try {
            await services.messageService.unpinMessage(chatId, message.id);
            setPinnedMessages((messages) => {
                const pinnedMessage = messages.find(
                    (pinned) => pinned.messageId === message.id,
                );
                if (!pinnedMessage) {
                    showToast(
                        "error",
                        t("messageAlreadyUnpinned", "Это сообщение уже откреплено"),
                        "❌",
                    );
                }

                return messages.filter((pinned) => pinned.messageId !== message.id);
            });
        } catch (err) {
            setError(
                err.message || t("messagePinError", "Не удалось открепить сообщение"),
            );
        }
    }

    const handlePinMessage = async (message) => {
        try {
            await services.messageService.pinMessage(chatId, message.id);
            setPinnedMessages((prev) => {
                const alreadyPinned = prev.some(
                    (pinnedMessage) => pinnedMessage.messageId === message.id,
                );

                if (alreadyPinned) {
                    showToast(
                        "error",
                        t("messageAlreadyPinned", "Это сообщение уже закреплено"),
                        "❌",
                    );
                    return prev;
                }

                return [...prev, { message, messageId: message.id }];
            });
        } catch (err) {
            setError(
                err.message || t("messagePinError", "Не удалось закрепить сообщение"),
            );
        }
    }

    const startSelection = (message) => {
        setSelectionMode(true);
        setSelectedMessages([message]);
        setActionMenu(null);
    }

    const handleForward = (message) => {
        if (selectionMode) {
            setIsForwardModalOpen(true);
            return;
        }

        setSelectedMessages([message]);
        setIsForwardModalOpen(true);
    }

    const startReply = (message) => {
        setReplyToMessage(message);
        setEditingMessage(null);
        draftRef.current.focus();
    }

    const startEdit = (message) => {
        setEditingMessage(message);
        setReplyToMessage(null);
        setDraft(message.content || "");
        draftRef.current.focus();
    }

    const closeMessageActions = () => {
        setActionMenu(null);
    }

    const runMessageAction = (action) => {
        action();
        closeMessageActions();
    }

    const handleCopyMessage = (message) => {
        navigator.clipboard.writeText(message.content);
    }

    return {
        translatingIds,
        handleTranslateMessage,
        handleDelete,
        handleReact,
        handleUnpinMessage,
        handlePinMessage,
        startSelection,
        handleForward,
        startReply,
        startEdit,
        closeMessageActions,
        runMessageAction,
        handleCopyMessage,
    }
}