import UserProfilePanel from "../ProfilePanel/UserProfilePanel";

const UserProfileModal = ({
                              chat,
                              error,
                              isLoading,
                              isOpen,
                              messages,
                              onClose,
                              t,
                              user,
                          }) => {
    if (!isOpen) return null;

    return (
        <div className="user-profile-modal" onClick={onClose} role="presentation">
            <UserProfilePanel
                chat={chat}
                error={error}
                isLoading={isLoading}
                messages={messages}
                onClose={onClose}
                stopPropagation
                t={t}
                user={user}
            />
        </div>
    );
}

export default UserProfileModal;