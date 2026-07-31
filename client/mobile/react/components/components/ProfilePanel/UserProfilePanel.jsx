import {useEffect, useState} from "react";
import {useCall} from "../../Calls/CallProvider";
import {Identicon} from "../../common/Identicon";
import {Icon} from "../Icon";
import { services } from "../../../../application/services/serviceContainer.js";

const getCurrentUser = () => {
    try { return JSON.parse(localStorage.getItem("craneapp_user_data") || "null"); }
    catch { return null; }
};

const formatLastSeen = (value, t) => {
    if (value === "recently") return t("lastSeenRecently", "был(а) недавно");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("lastSeenRecently", "был(а) недавно");

    const sameDay = date.toDateString() === new Date().toDateString();
    const formatted = new Intl.DateTimeFormat(undefined, sameDay
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
    ).format(date);

    return t("lastSeenAt", "был(а) {time}", { time: formatted }).replace("{time}", formatted);
};

const getChatSubtitle = (chat, typingUserId, t) => {
    if (typingUserId) return t("typing", "печатает...");
    if (chat?.type === "group") return t("groupChat", "Группа");
    if (chat?.peerIsOnline) return t("online", "онлайн");
    return chat?.peerLastSeen ? formatLastSeen(chat.peerLastSeen, t) : t("lastSeenRecently", "был(а) недавно");
};


const UserProfilePanel = ({ chat, error, isLoading, messages = [], onClose, stopPropagation = false, t, user,}) => {
    const [editableUser, setEditableUser] = useState(user);
    const [isEditing, setIsEditing] = useState(false);
    const [editDraft, setEditDraft] = useState({ firstName: "", bio: "" });
    const [editError, setEditError] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const { initiateCall } = useCall();

    const profileUser = editableUser || user;
    const isOwnProfile = !!(profileUser?.id && getCurrentUser()?.id && profileUser.id === getCurrentUser().id);
    const username = profileUser?.username ? `@${profileUser.username}` : "";
    const status = profileUser?.isBot ? t("bot", "бот") : getChatSubtitle(chat, null, t);
    const avatarUrl = profileUser?.avatarUrl || chat?.avatarUrl || "";
    const canCall = !!chat?.id;

    const displayName = [profileUser?.firstName, profileUser?.lastName].filter(Boolean).join(" ") ||
        profileUser?.username || chat?.name || chat?.title || t("user", "Пользователь");

    const sharedMedia = messages.filter(m =>
        m.mediaUrl && ["image", "gif", "sticker", "video"].includes(m.mediaType || m.type)
    );

    useEffect(() => {
        setEditableUser(user);
        setIsEditing(false);
        setEditError("");
    }, [user]);

    const copyText = (val) => val && navigator?.clipboard?.writeText(val).catch(() => {});

    const startEdit = () => {
        setEditDraft({ firstName: profileUser?.firstName || displayName, bio: profileUser?.bio || "" });
        setEditError("");
        setIsEditing(true);
    };


    const saveProfileEdit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setEditError("");
        try {
            const updated = await services.userService.updateMe({ firstName: editDraft.firstName.trim(), bio: editDraft.bio });
            setEditableUser(updated);
            setIsEditing(false);
        } catch (err) {
            setEditError(err.message || t("profileSaveError", "Не удалось сохранить профиль"));
        } finally {
            setIsSaving(false);
        }
    };

    const startCall = (type) => () => {
        if (canCall) initiateCall(chat.id, chat?.type, displayName, type, chat?.peerId);
    };

    const actionButtons = [
        { handleClick: onClose, disabled: false, name: "message-circle", title: t("chat", "Чат") },
        { handleClick: startCall("audio"), disabled: !canCall, name: "phone", title: t("call", "Звонок") },
        { handleClick: startCall("video"), disabled: !canCall, name: "video", title: t("videoCall", "Видеозвонок") }
    ];

    return (
        <section
            aria-label={t("profile", "Профиль")}
            className="user-profile-card"
            onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        >
            <header className="user-profile-header">
                <button className="user-profile-back" onClick={onClose} type="button">
                    <span aria-hidden="true">‹</span>{t("back", "Назад")}
                </button>
                <strong>{t("information", "Информация")}</strong>
                {isOwnProfile ? (
                    <button className="user-profile-edit" onClick={isEditing ? () => setIsEditing(false) : startEdit} type="button">
                        {isEditing ? t("cancel", "Отмена") : t("editShort", "Изм.")}
                    </button>
                ) : <span />}
            </header>

            {isLoading ? (
                <div className="user-profile-state">{t("loading", "Загрузка...")}</div>
            ) : error ? (
                <div className="user-profile-state is-error">{error}</div>
            ) : (
                <div className="user-profile-scroll">
                    <div className="user-profile-hero">
                        <div className="user-profile-avatar">
                            {avatarUrl ? <img alt="" src={avatarUrl} /> : (
                                <Identicon userId={profileUser?.id || chat?.peerId || displayName} size={112} />
                            )}
                        </div>
                        <h2>{displayName}</h2>
                        <p className={`user-profile-status ${chat?.peerIsOnline ? "is-online" : ""}`}>{status}</p>
                    </div>

                    <div className="user-profile-actions">
                        {actionButtons.map((button) =>
                            <button
                                disabled={button.disabled}
                                onClick={button.handleClick}
                                type="button"
                            >
                                <Icon name={button.name} />
                                {button.title}
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                        <form className="user-profile-edit-form" onSubmit={saveProfileEdit}>
                            {["firstName", "bio"].map((field) => {
                                const isBio = field === "bio";
                                const Tag = isBio ? "textarea" : "input";
                                return (
                                    <label key={field}>
                                        <span>{t(isBio ? "bio" : "name", isBio ? "О себе" : "Имя")}</span>
                                        <Tag
                                            onChange={(e) => setEditDraft((draft) => ({ ...draft, [field]: e.target.value }))}
                                            rows={isBio ? 4 : undefined}
                                            value={editDraft[field]}
                                        />
                                    </label>
                                );
                            })}
                            {editError && <p>{editError}</p>}
                            <button disabled={isSaving || !editDraft.firstName.trim()} type="submit">
                                {isSaving ? t("saving", "Сохранение...") : t("save", "Сохранить")}
                            </button>
                        </form>
                    ) : (
                        <div className="user-profile-info-card">
                            {username && (
                                <button className="user-profile-copy-row" onClick={() => copyText(username)} type="button">
                                    <span>{t("username", "Имя пользователя")}</span>
                                    <strong>{username}</strong>
                                    <Icon name="copy" />
                                </button>
                            )}
                            <div className="user-profile-info-row">
                                <span>{t("bio", "О себе")}</span>
                                <strong>{profileUser?.bio || t("profileBioEmpty", "Информация не указана")}</strong>
                            </div>
                        </div>
                    )}

                    <div className="user-profile-tabs">
                        <button className="active" type="button">{t("media", "Медиа")}</button>
                    </div>

                    {sharedMedia.length ? (
                        <div className="user-profile-media-grid">
                            {sharedMedia.map(({ mediaType, type, mediaUrl, id }) => {
                                const isVideo = (mediaType || type) === "video";
                                return (
                                    <a aria-label={t("openMedia", "Открыть медиа")} href={mediaUrl} key={id} rel="noreferrer" target="_blank">
                                        {isVideo ? <video muted preload="metadata" src={mediaUrl} /> : <img alt="" loading="lazy" src={mediaUrl} />}
                                        {isVideo && <span aria-hidden="true">▶</span>}
                                    </a>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="user-profile-empty-media">{t("profileMediaEmpty", "Медиа пока не загружены")}</div>
                    )}
                </div>
            )}
        </section>
    );

}

export default UserProfilePanel
