import { Icon } from "../Icon";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

const MessageActionsPopover = ({
                                   actionMenu,
                                   currentUserId,
                                   message,
                                   pinnedMessages,
                                   selectionMode,
                                   selectedMessages,
                                   onDelete,
                                   onEdit,
                                   onReact,
                                   onReply,
                                   runAction,
                                   onCopy,
                                   onPin,
                                   onUnpin,
                                   onStartSelection,
                                   onSelection,
                                   onForward,
                                   onTranslate,
                                   t,
                               }) => {
    const mine = message.senderId === currentUserId;
    const isPinned = pinnedMessages.some((p) => p.messageId === message.id);
    const isSelected = selectedMessages.some((m) => m.id === message.id);

    // Декларативная конфигурация для динамического рендеринга кнопок
    const buttons = [
        { show: !selectionMode, icon: "reply", key: "reply", def: "Ответить", action: () => onReply(message) },
        { show: !selectionMode, icon: "copy", key: "copy", def: "Скопировать", action: () => onCopy(message) },
        { show: !mine && !selectionMode, icon: "language", key: "translate", def: "Перевести", action: () => onTranslate(message) },
        { show: mine && !selectionMode, icon: "edit", key: "edit", def: "Изменить", action: () => onEdit(message) },
        { show: !isPinned && !selectionMode, icon: "pin", key: "pin", def: "Закрепить", action: () => onPin(message) },
        { show: isPinned && !selectionMode, icon: "pin", key: "unpin", def: "Открепить", action: () => onUnpin(message) },
        { show: true, icon: "forward", key: "forward", def: "Переслать", action: () => onForward(message) },
        { show: mine, icon: "trash", key: "delete", def: "Удалить", action: () => onDelete(message), className: "is-danger" },
    ];

    return (
        <div
            className="message-actions-popover"
            onClick={(e) => e.stopPropagation()}
            style={{ left: actionMenu.x, top: actionMenu.y }}
        >
            <div className="message-reaction-actions">
                {REACTIONS.map((emoji) => (
                    <button
                        aria-label={emoji}
                        key={emoji}
                        onClick={() => runAction(() => onReact(message, emoji))}
                        type="button"
                        className="shrink-0"
                    >
                        {emoji}
                    </button>
                ))}
            </div>

            <div className="message-text-actions">
                {buttons.filter(b => b.show).map((b) => (
                    <button key={b.key} className={b.className} onClick={() => runAction(b.action)} type="button">
                        <Icon name={b.icon} />
                        <span>{t(b.key, b.def)}</span>
                    </button>
                ))}

                <button
                    onClick={() => runAction(() => selectionMode ? onSelection(message) : onStartSelection(message))}
                    type="button"
                >
                    <Icon name="check-circle" className="fill-transparent" />
                    <span>
                        {isSelected ? t("uncheckMessage", "Снять выбор") : t("checkMessage", "Выбрать")}
                    </span>
                </button>
            </div>
        </div>
    );
};

export default MessageActionsPopover;
