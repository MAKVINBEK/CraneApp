import {useEffect, useRef} from "react";
import {MessageCheckbox} from "../../common/MessageCheckbox";
import {formatSize} from "../../../../utils/formatSize";
import {Icon} from "../Icon";

const hasMessageMedia = (msg) => !!(msg.mediaUrl || msg.mediaUnavailable);

function parseCallContent(content) {
    if (!content || typeof content !== "string") return {};
    try {
        const parsed = JSON.parse(content);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
        return {};
    }
}

function formatCallDuration(seconds) {
    const total = Number(seconds) || 0;
    if (total <= 0) return "";
    const mins = Math.floor(total / 60);
    const rest = String(total % 60).padStart(2, "0");
    return mins ? `${mins}:${rest}` : `${total % 60} сек`;
}

function CallMessageContent({ message, t }) {
    const duration = formatCallDuration(parseCallContent(message.content).duration);
    return (
        <div className="message-call-content">
            <div className="message-call-icon" aria-hidden="true"><Icon name="phone" /></div>
            <div className="message-call-copy">
                <strong>{t("callEnded", "Звонок завершен")}</strong>
                {duration ? <span>{duration}</span> : null}
            </div>
        </div>
    );
}

function renderMessageContent(content) {
    if (!content) return "";
    const parts = [];
    const regex = /(#[\wа-яА-ЯёЁ]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const textBefore = content.substring(lastIndex, match.index);
        if (textBefore) {
            parts.push(textBefore);
        }
        const hashtag = match[0];
        parts.push(
            <span
                key={match.index}
                className="hashtag-link"
                style={{
                    color: "var(--rd-accent, #ff2d8b)",
                    cursor: "pointer",
                    fontWeight: "bold",
                }}
                onClick={() => {
                    if (typeof window.handleUnifiedSearch === "function") {
                        window.handleUnifiedSearch(hashtag);
                    } else {
                        alert(`Поиск по хэштегу: ${hashtag}`);
                    }
                }}
            >
        {hashtag}
      </span>,
        );
        lastIndex = regex.lastIndex;
    }

    const textAfter = content.substring(lastIndex);
    if (textAfter) {
        parts.push(textAfter);
    }

    return parts.length > 0 ? parts : content;
}

function formatMessageTime(value) {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function MessageMedia({ message, onOpenImage, t }) {
    const { mediaUnavailable, mediaUnavailableReason, mediaUrl, mediaType, type, mediaEncryption } = message;

    if (mediaUnavailable) {
        return (
            <div className="message-media-unavailable">
                {mediaUnavailableReason ?? t("mediaUnavailableUnencrypted", "Медиа недоступно: файл не зашифрован")}
            </div>
        );
    }

    if (!mediaUrl) return null;

    const actualType = mediaType || type;

    if (["image", "gif", "sticker"].includes(actualType)) {
        return (
            <button aria-label={t("openImage", "Открыть изображение")} className="message-media-open" onClick={() => onOpenImage(mediaUrl)} type="button">
                <img alt="" className={`message-media message-media-${actualType}`} src={mediaUrl} />
            </button>
        );
    }

    if (["video", "audio"].includes(actualType)) {
        return React.createElement(actualType, { className: "message-media", controls: true, src: mediaUrl });
    }
    if (actualType === "voice") {
        return <audio className="message-media" controls src={mediaUrl} />;
    }

    if (actualType === "file") {
        return (
            <a className="message-media-file" download href={mediaUrl}>
                <Icon name="media-file"/>
                <div className="message-media-file__content">
                    <span className="message-media-file__title">{mediaEncryption.fileName}</span>
                    <span className="message-media-file__size">{formatSize(mediaEncryption.sizeBytes)}</span>
                </div>
            </a>
        );
    }

    return null;
}


const MessageBubble = ({
                           currentUserId,
                           isActionTarget,
                           selectionMode,
                           message,
                           selectedMessages = [],
                           messages,
                           translations,
                           onOpenActions,
                           onOpenImage,
                           onSelection,
                           t,
                       }) => {
    const mine = message.senderId === currentUserId;
    const longPressTimerRef = useRef(null);
    const longPressPointRef = useRef(null);
    const suppressNextClickRef = useRef(false);

    useEffect(() => () => window.clearTimeout(longPressTimerRef.current), []);

    function clearLongPress() {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
    }

    function handleClickCapture(event) {
        if (selectionMode) {
            onSelection(message);
            return;
        }

        if (!suppressNextClickRef.current) return;
        suppressNextClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
    }

    function handleContextMenu(event) {
        event.preventDefault();

        onOpenActions(
            message,
            event.currentTarget.getBoundingClientRect(),
            event.clientX,
            event.clientY,
        );
    }

    function handlePointerDown(event) {
        if (
            event.button !== 0 ||
            (event.pointerType !== "touch" && event.pointerType !== "pen")
        )
            return;
        const point = { x: event.clientX, y: event.clientY };
        const rect = event.currentTarget.getBoundingClientRect();
        longPressPointRef.current = point;
        clearLongPress();
        longPressTimerRef.current = window.setTimeout(() => {
            suppressNextClickRef.current = true;
            onOpenActions(message, rect, point.x, point.y);
        }, 550);
    }

    function handlePointerMove(event) {
        if (!longPressTimerRef.current || !longPressPointRef.current) return;
        const deltaX = Math.abs(event.clientX - longPressPointRef.current.x);
        const deltaY = Math.abs(event.clientY - longPressPointRef.current.y);
        if (deltaX > 8 || deltaY > 8) clearLongPress();
    }

    const isSelected = selectedMessages.find(({ id }) => id === message.id);

    const repliedMessage = message.replyTo
        ? messages.find(({ id }) => id === message.replyTo)
        : null;

    const replyText = repliedMessage?.content?.trim() || message.replyToContent?.trim() || "";

    const replyImage = repliedMessage?.mediaUrl || message.replyToMediaUrl || null;

    return (
        <article
            id={message.id}
            onClickCapture={handleClickCapture}
            onContextMenu={handleContextMenu}
            onPointerCancel={clearLongPress}
            onPointerDown={handlePointerDown}
            onPointerLeave={clearLongPress}
            onPointerMove={handlePointerMove}
            onPointerUp={clearLongPress}
            className={`flex justify-between gap-x-2 ${mine ? "justify-end" : ""}`}
        >
            <div
                className={`message-bubble ${mine ? "is-mine" : ""} ${hasMessageMedia(message) ? "has-media" : ""} ${isActionTarget ? "is-action-target" : ""} ${isSelected ? "is-selected bg-accent" : ""}`}
            >
                {!mine && (
                    <div className="message-sender">
                        {/* {message.senderFirstName || message.senderUsername || 'User'} */}
                        {message.senderStatusEmoji && (
                            <span className="sender-status-emoji" style={{ marginLeft: 6 }}>
                {message.senderStatusEmoji}
              </span>
                        )}
                    </div>
                )}
                {replyText && !replyImage && (
                    <a
                        href={`#${message.replyTo}`}
                        className="message-reply-preview"
                        aria-label={t("goToMessage", "Перейти к сообщению")}
                    >
                        {replyText}
                    </a>
                )}
                {replyText && replyImage && (
                    <a
                        href={`#${message.replyTo}`}
                        className="message-reply-preview"
                        aria-label={t("goToMessage", "Перейти к сообщению")}
                    >
                        {replyText}
                    </a>
                )}
                {!replyText && replyImage && (
                    <div className="message-reply-preview">
                        <a
                            href={`#${message.replyTo}`}
                            aria-label={t("goToMessage", "Перейти к сообщению")}
                        >
                            <img
                                src={replyImage}
                                alt=""
                                className="message-reply-preview-image"
                            />
                        </a>
                    </div>
                )}
                <MessageMedia message={message} onOpenImage={onOpenImage} t={t} />
                {message.type === "call" ? (
                    <CallMessageContent message={message} t={t} />
                ) : (
                    <div className="message-content">
                        {renderMessageContent(translations[message.id] || message.content)}
                    </div>
                )}
                {message.reactions?.length > 0 && (
                    <div className="message-reactions">
                        {message.reactions.map((reaction) => (
                            <span
                                className={reaction.myReaction ? "is-mine" : ""}
                                key={reaction.emoji}
                            >
                {reaction.emoji} {reaction.count}
              </span>
                        ))}
                    </div>
                )}
                <div className="message-meta">
                    {message.isEdited ? <span>{t("edited", "изменено")}</span> : null}
                    <time>
                        {formatMessageTime(message.timestamp || message.createdAt)}
                    </time>
                </div>
            </div>
            {selectionMode && (
                <MessageCheckbox
                    isChecked={isSelected}
                    t={t}
                    className="grow-0 self-end"
                />
            )}
        </article>
    );
}

export default MessageBubble