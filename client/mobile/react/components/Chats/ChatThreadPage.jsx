import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { services } from "../../../application/services/serviceContainer.js";
import Message from "../../../domain/entities/Message.js";
import { useRealtimeSocket } from "../../hooks/useRealtimeSocket.js";
import { Identicon } from "../common/Identicon.jsx";
import { useCall } from "../Calls/CallProvider.jsx";
import { GroupInfoModal } from "./GroupInfoModal.jsx";
import { ForwardChatMessagesModal } from "./ForwardChatMessagesModal.jsx";
import { PinnedMessages } from "../common/PinnedMessages.jsx";
import UserProfileModal from "../components/Modals/UserProfileModal";
import MessageBubble from "../components/MessageBubble/MessageBubble";
import MessageActionsPopover from "../components/Modals/MessageActionsPopover";
import {Icon} from "../components/Icon";
import {useChat} from "../../context/ChatContext";
import {useTranslate} from "../../hooks/useTranslate";

export function ChatThreadPage({
  chatId,
  onProfileStateChange,
  profileCloseToken = 0,
  profileMode = "modal",
}) {
    const { t } = useTranslate()
  const { chat, setChat,
      messages, setMessages,
      error, setError,
      editingMessage, setEditingMessage,
      draft, setDraft,
      replyToMessage, setReplyToMessage,
      selectedMessages, setSelectedMessages,
      pinnedMessages, setPinnedMessages,
      selectionMode, setSelectionMode,
      actionMenu, setActionMenu,
      translations
  } = useChat();
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [openedImage, setOpenedImage] = useState(null);
  const [typingUserId, setTypingUserId] = useState(null);
  const [profileModal, setProfileModal] = useState({
    isOpen: false,
    isLoading: false,
    error: "",
    user: null,
  });
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const currentUser = useMemo(() => getCurrentUser(), []);
  const bottomRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const lastTypingSentAtRef = useRef(0);
  const typingTimeoutRef = useRef(null);
  const draftRef = useRef(null);
  const { eventBus, socket } = useRealtimeSocket(Boolean(chatId));
  const { initiateCall } = useCall();

  useEffect(() => {
    if (profileMode !== "panel" || typeof onProfileStateChange !== "function")
      return undefined;
    onProfileStateChange({ ...profileModal, chat, messages });
    return undefined;
  }, [chat, messages, onProfileStateChange, profileMode, profileModal]);

  useEffect(() => {
    setProfileModal({ isOpen: false, isLoading: false, error: "", user: null });
  }, [chatId]);

  useEffect(() => {
    if (profileCloseToken === 0) return;
    setProfileModal({ isOpen: false, isLoading: false, error: "", user: null });
  }, [profileCloseToken]);

  useEffect(() => {
    if (!actionMenu) return undefined;

    const closeActionMenu = () => setActionMenu(null);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") closeActionMenu();
    };

    window.addEventListener("click", closeActionMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", closeActionMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionMenu]);

  useEffect(() => {
    if (!openedImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpenedImage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openedImage]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      services.chatService.getChat(chatId),
      services.messageService.getMessages(chatId),
      services.messageService.listPins(chatId),
    ])
      .then(([nextChat, nextMessages, nextPinnedMessages]) => {
        if (!isMounted) return;
        setChat(nextChat);
        setMessages(nextMessages);
        markMessagesAsRead(chatId, nextMessages);
        setPinnedMessages(nextPinnedMessages);
        setError("");
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || t("chatLoadError", "Не удалось загрузить чат"));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [chatId, t]);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);

  useEffect(() => {
    const unsubscribeNew = eventBus.on("new_message", async (event) => {
      if (event.chatId !== chatId || !event.message) return;
      const nextMessage =
        typeof services.messageService.processMessageForDisplay === "function"
          ? await services.messageService.processMessageForDisplay(
              chatId,
              event.message,
            )
          : Message.fromAPI(event.message);
      services.messageService.addMessageToCache(chatId, nextMessage);
      setMessages((items) => appendUniqueMessage(items, nextMessage));
      markMessagesAsRead(chatId, [nextMessage]);
    });

    const unsubscribeEdited = eventBus.on("message_edited", (event) => {
      setMessages((items) =>
        items.map((message) =>
          message.id === event.messageId
            ? {
                ...message,
                content: event.content,
                editedAt: event.editedAt,
                isEdited: true,
              }
            : message,
        ),
      );
    });

    const unsubscribeDeleted = eventBus.on("message_deleted", (event) => {
      if (event.chatId && event.chatId !== chatId) return;
      setMessages((items) =>
        items.filter((message) => message.id !== event.messageId),
      );
    });

    const handleTyping = (event) => {
      if (event.chatId !== chatId) return;
      const userId = event.userId || event.senderId || event.from;
      if (!userId || userId === currentUser?.id) return;

      setTypingUserId(userId);
      setChat((currentChat) =>
        currentChat?.type === "private"
          ? { ...currentChat, peerIsOnline: true }
          : currentChat,
      );
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        setTypingUserId(null);
      }, 3000);
    };
    const unsubscribeTyping = eventBus.on("typing", handleTyping);
    const unsubscribeUserTyping = eventBus.on("user_typing", handleTyping);

    return () => {
      unsubscribeNew();
      unsubscribeEdited();
      unsubscribeDeleted();
      unsubscribeTyping();
      unsubscribeUserTyping();
      window.clearTimeout(typingTimeoutRef.current);
    };
  }, [chatId, currentUser?.id, eventBus]);

  useEffect(() => {
    window.addEventListener("keydown", handleComposerKeyDown);

    return () => {
      window.removeEventListener("keydown", handleComposerKeyDown);
    };
  }, [draft, editingMessage, replyToMessage, messages, currentUser?.id]);

  function markMessagesAsRead(targetChatId, nextMessages) {
    const messageIds = nextMessages
      .filter((message) => message?.id && message.senderId !== currentUser?.id)
      .map((message) => message.id);
    if (
      messageIds.length === 0 ||
      typeof services.messageService.markAsRead !== "function"
    )
      return;
    services.messageService
      .markAsRead(targetChatId, messageIds)
      .catch((err) => {
        console.warn("Failed to mark messages as read", err);
      });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const content = draft.trim();
    if ((!content && !pendingAttachment) || isSending) return;

    setIsSending(true);
    try {
      if (editingMessage) {
        const result = await services.messageService.editMessage(
          editingMessage.id,
          content,
        );
        setMessages((items) =>
          updateMessage(items, editingMessage.id, {
            content: result.content,
            editedAt: result.editedAt,
            isEdited: true,
          }),
        );
        setEditingMessage(null);
      } else if (pendingAttachment) {
        const message = await services.messageService.sendMediaMessage(
          chatId,
          pendingAttachment.file,
          pendingAttachment.type,
          content,
          replyToMessage?.id,
        );
        setMessages((items) => appendUniqueMessage(items, message));
        setPendingAttachment(null);
        setReplyToMessage(null);
        if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      } else {
        const message = await services.messageService.sendMessage(
          chatId,
          content,
          "text",
          replyToMessage?.id,
        );
        setMessages((items) => appendUniqueMessage(items, message));
        setReplyToMessage(null);
      }
      setDraft("");
      setError("");
    } catch (err) {
      setError(
        err.message || t("messageSendError", "Не удалось отправить сообщение"),
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleAttachmentChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setError(
        t(
          "attachmentTooLarge",
          "Файл слишком большой. Максимальный размер — 100 МБ.",
        ),
      );
      event.target.value = "";
      return;
    }
    setPendingAttachment({ file, type: getMediaMessageType(file.type) });
    setEditingMessage(null);
    setError("");
  }

  function removePendingAttachment() {
    setPendingAttachment(null);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }

  function handleDraftChange(event) {
    setDraft(event.target.value);
    sendTyping();
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Escape" && (editingMessage || replyToMessage)) {
      event.preventDefault();
      cancelComposerMode();
      return;
    }

    if (
      event.key !== "ArrowUp" ||
      draft.trim() ||
      editingMessage ||
      replyToMessage
    )
      return;
    const lastOwnMessage = [...messages]
      .reverse()
      .find(
        (message) => message.senderId === currentUser?.id && !message.deletedAt,
      );
    if (!lastOwnMessage) return;

    event.preventDefault();
    startEdit(lastOwnMessage);
  }

  function sendTyping() {
    if (!chatId || !socket?.isConnected) return;

    const now = Date.now();
    if (now - lastTypingSentAtRef.current < 1500) return;
    lastTypingSentAtRef.current = now;

    try {
      socket.send({ type: "typing", chatId, userId: currentUser?.id });
    } catch (err) {
      console.warn("Failed to send typing event", err);
    }
  }

  function startEdit(message) {
    setEditingMessage(message);
    setReplyToMessage(null);
    setDraft(message.content || "");
    draftRef.current.focus();
  }

  function cancelComposerMode() {
    setEditingMessage(null);
    setReplyToMessage(null);
    setDraft("");
  }

  async function openChatProfile() {
    if (chat?.type === "group") {
      setIsGroupInfoOpen(true);
      return;
    }
    if (chat?.type !== "private" || !chat.peerId) return;

    setProfileModal({ isOpen: true, isLoading: true, error: "", user: null });
    try {
      const profile = await services.userService.getProfile(chat.peerId);
      setProfileModal({
        isOpen: true,
        isLoading: false,
        error: "",
        user: profile,
      });
    } catch (err) {
      setProfileModal({
        isOpen: true,
        isLoading: false,
        error:
          err.message || t("profileLoadError", "Не удалось загрузить профиль"),
        user: null,
      });
    }
  }

  function toggleMessageSelection(message) {
    setSelectedMessages((messages) => {
      const isMessageSelected = messages.find(({ id }) => id === message.id);

      if (isMessageSelected) {
        const next = messages.filter(({ id }) => id !== message.id);

        if (next.length === 0) {
          setSelectionMode(false);
        }

        return next;
      }

      return [...messages, message];
    });
  }

  const handleCloseForwardModal = () => {
    if (selectionMode) {
      setIsForwardModalOpen(false);
      return;
    }

    setSelectedMessages([]);
    setIsForwardModalOpen(false);
  };

  const title = chat?.name || chat?.title || t("chat", "Чат");
  const subtitle = getChatSubtitle(chat, typingUserId, t);
  const isPeerOnline = Boolean(chat?.type === "private" && chat?.peerIsOnline);
  const peerAvatarUrl = chat?.avatarUrl || "";
  const selectedActionMessage = actionMenu
    ? messages.find((message) => message.id === actionMenu.messageId)
    : null;

  return (
    <main className="thread-page">
      {isForwardModalOpen && (
        <ForwardChatMessagesModal
          messages={selectedMessages}
          onClose={handleCloseForwardModal}
          setSelectedMessages={setSelectedMessages}
        />
      )}
      <header className="thread-header">
        <Link
          className="thread-back"
          to="/chats"
          aria-label={t("back", "Назад")}
        >
          <Icon name="back" className="size-5" />
        </Link>
        <button
          aria-label={title}
          className={`thread-avatar ${isPeerOnline ? "is-online" : ""}`}
          onClick={openChatProfile}
          type="button"
        >
          {peerAvatarUrl ? (
            <img alt="" src={peerAvatarUrl} />
          ) : chat?.type === "private" && chat?.peerId ? (
            <Identicon userId={chat.peerId} size={44} />
          ) : (
            title.slice(0, 1).toUpperCase()
          )}
        </button>
        <div
          className="thread-title-wrap"
          onClick={openChatProfile}
          style={{
            cursor:
              chat?.type === "group" || chat?.type === "private"
                ? "pointer"
                : "default",
          }}
        >
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="thread-call-actions">
          <button
            className="thread-call-button"
            onClick={() =>
              initiateCall(chatId, chat?.type, title, "audio", chat?.peerId)
            }
            title={t("audioCall", "Аудиозвонок")}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="thread-call-icon"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g fill="none">
                <path d="M0 0h24v24H0z" />

                <path
                  fill="currentColor"
                  d="M4.477 4.116c-2.924 3.217-1.362 8.196 2.932 12.51 4.204 4.222 9.407 5.8 12.486 2.936 1.685-1.567 1.436-4.343-.645-6.198l-.19-.161c-1.931-1.563-4.734-1.568-6.445-.027l-.088.082-.05-.042c-.187-.16-.43-.381-.724-.673l-.298-.303-.306-.326q-.138-.152-.246-.277l-.124-.147-.07.075c1.69-1.697 1.706-4.72.006-6.75-1.887-2.255-4.75-2.335-6.238-.699M9.335 5.97c1.18 1.41 1.049 3.371.099 4.325l-.148.14c-.63.567-1.246.901 1.032 3.218 2.458 2.499 2.765 1.622 3.405.952 1.006-1.01 2.975-1.104 4.329.103 1.497 1.334 1.335 2.868.617 3.536-2.222 2.067-6.476.636-9.984-2.888S3.621 7.734 5.81 5.326c.508-.558 2.101-1.057 3.526.644"
                />
              </g>
            </svg>
          </button>
          <button
            className="thread-call-button"
            onClick={() =>
              initiateCall(chatId, chat?.type, title, "video", chat?.peerId)
            }
            title={t("videoCall", "Видео")}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="thread-call-icon thread-call-icon-video"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <g fill="none">
                <path d="M0 0h24v24H0z" />

                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M6.5 5.75A3.5 3.5 0 0 0 3 9.25v5.5a3.5 3.5 0 0 0 3.5 3.5h7a3.5 3.5 0 0 0 3.5-3.5v-.52l2.65 2.07A1.45 1.45 0 0 0 22 15.15v-6.3a1.45 1.45 0 0 0-2.35-1.15L17 9.77v-.52a3.5 3.5 0 0 0-3.5-3.5h-7Zm-1.7 3.5A1.7 1.7 0 0 1 6.5 7.55h7a1.7 1.7 0 0 1 1.7 1.7v5.5a1.7 1.7 0 0 1-1.7 1.7h-7a1.7 1.7 0 0 1-1.7-1.7v-5.5Zm12.2 2.8 3.2 2.5v-5.1L17 11.95v.1Z"
                />
              </g>
            </svg>
          </button>
        </div>
      </header>

      <PinnedMessages messages={pinnedMessages} t={t} />

      <section className="thread-messages" aria-busy={isLoading}>
        {isLoading ? <ThreadSkeleton /> : null}
        {!isLoading && error && messages.length === 0 ? (
          <ThreadState
            message={error}
            title={t("loadingError", "Ошибка загрузки")}
          />
        ) : null}
        {!isLoading && !error && messages.length === 0 ? (
          <ThreadState
            message={t(
              "emptyThreadDescription",
              "Напишите первое сообщение в этом чате.",
            )}
            title={t("emptyThread", "Сообщений пока нет")}
          />
        ) : null}
        {messages.map((message) => (
          <MessageBubble
            currentUserId={currentUser?.id}
            key={message.id}
            message={message}
            translations={translations}
            onOpenImage={(url) => setOpenedImage(url)}
            onSelection={toggleMessageSelection}
          />
        ))}
        <div ref={bottomRef} />
      </section>

      {actionMenu && selectedActionMessage && (
        <>
          <div aria-hidden="true" className="message-actions-backdrop" />
          <MessageActionsPopover
            currentUserId={currentUser?.id}
            message={selectedActionMessage}
            onSelection={toggleMessageSelection}
            currentUser={currentUser}
            draftRef={draftRef}
            chatId={chatId}
            updateMessage={updateMessage}
            setIsForwardModalOpen={setIsForwardModalOpen}
          />
        </>
      )}

      {error && messages.length > 0 ? (
        <div className="thread-inline-error">{error}</div>
      ) : null}

      {openedImage ? (
        <div
          aria-label={t("imageViewer", "Просмотр изображения")}
          aria-modal="true"
          className="image-viewer"
          onClick={() => setOpenedImage(null)}
          role="dialog"
        >
          <button
            aria-label={t("close", "Закрыть")}
            className="image-viewer-close"
            onClick={() => setOpenedImage(null)}
            type="button"
          >
            ×
          </button>
          <img
            alt=""
            onClick={(event) => event.stopPropagation()}
            src={openedImage}
          />
        </div>
      ) : null}

      <form className="thread-composer" onSubmit={handleSubmit}>
        {editingMessage || replyToMessage ? (
          <div className="thread-composer-context">
            <span>
              {editingMessage
                ? t("editingMessage", "Редактирование")
                : `${t("replyTo", "Ответ")}: ${getMessagePreview(replyToMessage)}`}
            </span>
            <button
              aria-label={t("cancel", "Отменить")}
              onClick={cancelComposerMode}
              type="button"
            >
              ×
            </button>
          </div>
        ) : null}
        {pendingAttachment ? (
          <div className="thread-attachment-preview">
            <span aria-hidden="true">
              {getAttachmentIcon(pendingAttachment.type)}
            </span>
            <span title={pendingAttachment.file.name}>
              {pendingAttachment.file.name}
            </span>
            <small>{formatFileSize(pendingAttachment.file.size)}</small>
            <button
              aria-label={t("removeAttachment", "Убрать вложение")}
              onClick={removePendingAttachment}
              type="button"
            >
              ×
            </button>
          </div>
        ) : null}
        <input
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
          aria-label={t("attachFile", "Прикрепить файл")}
          className="thread-file-input"
          onChange={handleAttachmentChange}
          ref={attachmentInputRef}
          type="file"
        />
        <button
          aria-label={t("attachFile", "Прикрепить файл")}
          className="thread-attach-button"
          disabled={isSending || Boolean(editingMessage)}
          onClick={() => attachmentInputRef.current?.click()}
          type="button"
        >
          📎
        </button>
        <input
          ref={draftRef}
          aria-label={t("message", "Сообщение")}
          onChange={handleDraftChange}
          placeholder={t("messagePlaceholder", "Сообщение...")}
          value={draft}
        />
        <button
          disabled={(!draft.trim() && !pendingAttachment) || isSending}
          type="submit"
        >
          {isSending ? "⏳" : "➤"}
        </button>
      </form>

      {chat?.type === "group" && (
        <GroupInfoModal
          chatId={chatId}
          isOpen={isGroupInfoOpen}
          onClose={() => setIsGroupInfoOpen(false)}
        />
      )}

      {profileMode === "modal" ? (
        <UserProfileModal
          messages={messages}
          onClose={() =>
            setProfileModal({
              isOpen: false,
              isLoading: false,
              error: "",
              user: null,
            })
          }
          profileModal={profileModal}
        />
      ) : null}
    </main>
  );
}

function getMediaMessageType(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function getAttachmentIcon(type) {
  return { image: "🖼️", video: "🎬", audio: "🎵", file: "📄" }[type] || "📎";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function appendUniqueMessage(items, nextMessage) {
  if (items.some((message) => message.id === nextMessage.id)) return items;
  return [...items, nextMessage];
}

function updateMessage(items, messageId, patch) {
  return items.map((message) =>
    message.id === messageId ? { ...message, ...patch } : message,
  );
}

function ThreadSkeleton() {
  return (
    <div className="thread-skeleton">
      <div className="message-bubble">
        <div className="skeleton-line skeleton-message" />
      </div>
      <div className="message-bubble is-mine">
        <div className="skeleton-line skeleton-message-short" />
      </div>
      <div className="message-bubble">
        <div className="skeleton-line skeleton-message" />
      </div>
    </div>
  );
}

function ThreadState({ message, title }) {
  return (
    <div className="thread-state">
      <h2>{title}</h2>
      <p>{message}</p>
    </div>
  );
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("craneapp_user_data") || "null");
  } catch (_error) {
    return null;
  }
}

function getMessagePreview(message) {
  if (!message) return "";
  return String(message.content || "").slice(0, 64);
}

function getChatSubtitle(chat, typingUserId) {
    const { t } = useTranslate()
  if (typingUserId) return t("typing", "печатает...");
  if (chat?.type === "group") return t("groupChat", "Группа");
  if (chat?.peerIsOnline) return t("online", "онлайн");
  if (chat?.peerLastSeen) return formatLastSeen(chat.peerLastSeen, t);
  return t("lastSeenRecently", "был(а) недавно");
}

function formatLastSeen(value) {
    const { t } = useTranslate()
  if (value === "recently") return t("lastSeenRecently", "был(а) недавно");
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return t("lastSeenRecently", "был(а) недавно");

  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const formatted = new Intl.DateTimeFormat(
    undefined,
    sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        },
  ).format(date);

  return t("lastSeenAt", "был(а) {time}", { time: formatted }).replace(
    "{time}",
    formatted,
  );
}

