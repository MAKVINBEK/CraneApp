import {Icon} from "../Icon";

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
    const reactions = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
    const isPinned = pinnedMessages.find(
        (pinned) => pinned.messageId === message.id,
    );
    const isSelected = selectedMessages.find(({ id }) => id === message.id);

    return (
        <div
            className="message-actions-popover"
            onClick={(event) => event.stopPropagation()}
            style={{ left: actionMenu.x, top: actionMenu.y }}
        >
            <div className="message-reaction-actions">
                {reactions.map((emoji) => (
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
                {!selectionMode && (
                    <button
                        onClick={() => runAction(() => onReply(message))}
                        type="button"
                    >
                        <Icon name="reply" />
                        <span>{t("reply", "Ответить")}</span>
                    </button>
                )}
                {!selectionMode && (
                    <button
                        onClick={() => runAction(() => onCopy(message))}
                        type="button"
                    >
                        <Icon name="copy" />
                        <span>{t("copy", "Скопировать")}</span>
                    </button>
                )}
                {!mine && !selectionMode && (
                    <button
                        type="button"
                        onClick={() => runAction(() => onTranslate(message))}
                    >
                        <Icon name="language" />
                        <span>{t("translate", "Перевести")}</span>
                    </button>
                )}
                {mine && !selectionMode && (
                    <button
                        onClick={() => runAction(() => onEdit(message))}
                        type="button"
                    >
                        <Icon name='edit' />
                        <span>{t("edit", "Изменить")}</span>
                    </button>
                )}
                {!isPinned && !selectionMode && (
                    <button onClick={() => runAction(() => onPin(message))} type="button">
                        <Icon name="pin" />
                        <span>{t("pin", "Закрепить")}</span>
                    </button>
                )}
                {isPinned && !selectionMode && (
                    <button
                        onClick={() => runAction(() => onUnpin(message))}
                        type="button"
                    >
                        <Icon name="pin" />
                        <span>{t("unpin", "Открепить")}</span>
                    </button>
                )}
                <button
                    onClick={() => runAction(() => onForward(message))}
                    type="button"
                >
                    <Icon name="forward" />
                    <span>{t("forward", "Переслать")}</span>
                </button>
                {mine && (
                    <button
                        className="is-danger"
                        onClick={() => runAction(() => onDelete(message))}
                        type="button"
                    >
                        <Icon name="trash" />
                        <span>{t("delete", "Удалить")}</span>
                    </button>
                )}
                <button
                    onClick={() => {
                        if (selectionMode) {
                            runAction(() => {
                                onSelection(message);
                            });

                            return;
                        }

                        runAction(() => {
                            onStartSelection(message);
                        });
                    }}
                    type="button"
                >
                    <Icon name="check-circle" className={"fill-transparent"} />
                    <span>
            {isSelected
                ? t("uncheckMessage", "Снять выбор")
                : t("checkMessage", "Выбрать")}
          </span>
                </button>
            </div>
        </div>
    );
}

export default MessageActionsPopover;