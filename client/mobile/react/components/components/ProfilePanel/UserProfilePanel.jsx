import {useEffect, useState} from "react";
import {useCall} from "../../Calls/CallProvider";
import {Identicon} from "../../common/Identicon";
import {Icon} from "../Icon";
import { services } from "../../../../application/services/serviceContainer.js";

const ActionButton = ({name, handleClick, children, props}) => {
    return (
        <button
            {...props}
            onClick={handleClick}
            type="button"
        >
            <Icon name={name}/>
            {children}
        </button>
    )
}

const UserProfilePanel = ({
                                     chat,
                                     error,
                                     isLoading,
                                     messages = [],
                                     onClose,
                                     stopPropagation = false,
                                     t,
                                     user,
                                 }) => {
    const [editableUser, setEditableUser] = useState(user);
    const [isEditing, setIsEditing] = useState(false);
    const [editDraft, setEditDraft] = useState({ firstName: "", bio: "" });
    const [editError, setEditError] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const { initiateCall } = useCall();



    function getChatSubtitle(chat, typingUserId, t) {
        if (typingUserId) return t("typing", "печатает...");
        if (chat?.type === "group") return t("groupChat", "Группа");
        if (chat?.peerIsOnline) return t("online", "онлайн");
        if (chat?.peerLastSeen) return formatLastSeen(chat.peerLastSeen, t);
        return t("lastSeenRecently", "был(а) недавно");
    }

    function formatLastSeen(value, t) {
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

    function getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem("craneapp_user_data") || "null");
        } catch (_error) {
            return null;
        }
    }

    const currentUser = getCurrentUser();
    const profileUser = editableUser || user;
    const isOwnProfile = Boolean(
        profileUser?.id && currentUser?.id && profileUser.id === currentUser.id,
    );
    const displayName =
        [profileUser?.firstName, profileUser?.lastName].filter(Boolean).join(" ") ||
        profileUser?.username ||
        chat?.name ||
        chat?.title ||
        t("user", "Пользователь");
    const username = profileUser?.username ? `@${profileUser.username}` : "";
    const status = profileUser?.isBot
        ? t("bot", "бот")
        : getChatSubtitle(chat, null, t);
    const avatarUrl = profileUser?.avatarUrl || chat?.avatarUrl || "";
    const canCall = Boolean(chat?.id);
    const sharedMedia = messages.filter(
        (message) =>
            message.mediaUrl &&
            ["image", "gif", "sticker", "video"].includes(
                message.mediaType || message.type,
            ),
    );

    useEffect(() => {
        setEditableUser(user);
        setIsEditing(false);
        setEditError("");
    }, [user]);

    function startAudioCall() {
        if (!canCall) return;
        initiateCall(chat.id, chat?.type, displayName, "audio", chat?.peerId);
    }

    function startVideoCall() {
        if (!canCall) return;
        initiateCall(chat.id, chat?.type, displayName, "video", chat?.peerId);
    }

    function copyText(value) {
        if (!value || !navigator?.clipboard) return;
        navigator.clipboard.writeText(value).catch(() => {});
    }

    function startEdit() {
        setEditDraft({
            firstName: profileUser?.firstName || displayName,
            bio: profileUser?.bio || "",
        });
        setEditError("");
        setIsEditing(true);
    }

    async function saveProfileEdit(event) {
        event.preventDefault();
        setIsSaving(true);
        setEditError("");
        try {
            const updated = await services.userService.updateMe({
                firstName: editDraft.firstName.trim(),
                bio: editDraft.bio,
            });
            setEditableUser(updated);
            setIsEditing(false);
        } catch (err) {
            setEditError(
                err.message || t("profileSaveError", "Не удалось сохранить профиль"),
            );
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <section
            aria-label={t("profile", "Профиль")}
            className="user-profile-card"
            onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
        >
            <header className="user-profile-header">
                <button className="user-profile-back" onClick={onClose} type="button">
                    <span aria-hidden="true">‹</span>
                    {t("back", "Назад")}
                </button>
                <strong>{t("information", "Информация")}</strong>
                {isOwnProfile ? (
                    <button
                        className="user-profile-edit"
                        onClick={isEditing ? () => setIsEditing(false) : startEdit}
                        type="button"
                    >
                        {isEditing ? t("cancel", "Отмена") : t("editShort", "Изм.")}
                    </button>
                ) : (
                    <span />
                )}
            </header>

            {isLoading ? (
                <div className="user-profile-state">{t("loading", "Загрузка...")}</div>
            ) : error ? (
                <div className="user-profile-state is-error">{error}</div>
            ) : (
                <div className="user-profile-scroll">
                    <div className="user-profile-hero">
                        <div className="user-profile-avatar">
                            {avatarUrl ? (
                                <img alt="" src={avatarUrl} />
                            ) : (
                                <Identicon
                                    userId={profileUser?.id || chat?.peerId || displayName}
                                    size={112}
                                />
                            )}
                        </div>
                        <h2>{displayName}</h2>
                        <p
                            className={`user-profile-status ${chat?.peerIsOnline ? "is-online" : ""}`}
                        >
                            {status}
                        </p>
                    </div>

                    <div className="user-profile-actions">
                        <ActionButton handleClick={onClose} name="message-circle" >
                            {t("chat", "Чат")}
                        </ActionButton>
                        <ActionButton handleClick={startAudioCall} disabled={!canCall} name="phone">
                            {t("call", "Звонок")}
                        </ActionButton>
                        <ActionButton disabled={!canCall} handleClick={startVideoCall} title={t("videoCall", "Видеозвонок")} name="video">
                            {t("video", "Видео")}
                        </ActionButton>
                    </div>

                    {isEditing ? (
                        <form className="user-profile-edit-form" onSubmit={saveProfileEdit}>
                            <label>
                                <span>{t("name", "Имя")}</span>
                                <input
                                    onChange={(event) =>
                                        setEditDraft((draft) => ({
                                            ...draft,
                                            firstName: event.target.value,
                                        }))
                                    }
                                    value={editDraft.firstName}
                                />
                            </label>
                            <label>
                                <span>{t("bio", "О себе")}</span>
                                <textarea
                                    onChange={(event) =>
                                        setEditDraft((draft) => ({
                                            ...draft,
                                            bio: event.target.value,
                                        }))
                                    }
                                    rows={4}
                                    value={editDraft.bio}
                                />
                            </label>
                            {editError ? <p>{editError}</p> : null}
                            <button
                                disabled={isSaving || !editDraft.firstName.trim()}
                                type="submit"
                            >
                                {isSaving
                                    ? t("saving", "Сохранение...")
                                    : t("save", "Сохранить")}
                            </button>
                        </form>
                    ) : (
                        <div className="user-profile-info-card">
                            {username ? (
                                <button
                                    className="user-profile-copy-row"
                                    onClick={() => copyText(username)}
                                    type="button"
                                >
                                    <span>{t("username", "Имя пользователя")}</span>
                                    <strong>{username}</strong>
                                    <Icon name="copy" />
                                </button>
                            ) : null}
                            <div className="user-profile-info-row">
                                <span>{t("bio", "О себе")}</span>
                                <strong>
                                    {profileUser?.bio ||
                                        t("profileBioEmpty", "Информация не указана")}
                                </strong>
                            </div>
                        </div>
                    )}

                    <div className="user-profile-tabs">
                        <button className="active" type="button">
                            {t("media", "Медиа")}
                        </button>
                    </div>
                    {sharedMedia.length ? (
                        <div className="user-profile-media-grid">
                            {sharedMedia.map((message) => {
                                const type = message.mediaType || message.type;
                                return (
                                    <a
                                        aria-label={t("openMedia", "Открыть медиа")}
                                        href={message.mediaUrl}
                                        key={message.id}
                                        rel="noreferrer"
                                        target="_blank"
                                    >
                                        {type === "video" ? (
                                            <video muted preload="metadata" src={message.mediaUrl} />
                                        ) : (
                                            <img alt="" loading="lazy" src={message.mediaUrl} />
                                        )}
                                        {type === "video" ? (
                                            <span aria-hidden="true">▶</span>
                                        ) : null}
                                    </a>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="user-profile-empty-media">
                            {t("profileMediaEmpty", "Медиа пока не загружены")}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

export default UserProfilePanel
