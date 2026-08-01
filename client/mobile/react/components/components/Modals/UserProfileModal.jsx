import UserProfilePanel from "../ProfilePanel/UserProfilePanel";
import {useChat} from "../../../context/ChatContext";

const UserProfileModal = ({
                              onClose,
                              profileModal
                          }) => {
    const { messages, chat } = useChat()
    if (!profileModal.isOpen) return null;

    return (
        <div className="user-profile-modal" onClick={onClose} role="presentation">
            <UserProfilePanel
                chat={chat}
                error={profileModal.error}
                isLoading={profileModal.isLoading}
                messages={messages}
                onClose={onClose}
                stopPropagation
                user={profileModal.user}
            />
        </div>
    );
}

export default UserProfileModal;