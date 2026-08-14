import { useCall } from '@/hooks';
import type { IProfileModal } from '@/pages';
import { services } from '@/services';
import { useChatStore } from '@/store';
import { getChatSubtitle } from '@/utils';
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Identicon } from '../ui';

interface Props {
  typingUserId?: string | null;
  setIsGroupInfoOpen?: Dispatch<SetStateAction<boolean>>;
  profileModal?: IProfileModal;
  setProfileModal?: Dispatch<SetStateAction<IProfileModal>>;
  locationPage?: 'pinned-messages' | 'chat-thread';
  onClosePinnedMessagePage?: () => void;
}

export const ChatThreadHeader = ({
  typingUserId,
  setIsGroupInfoOpen,
  profileModal,
  setProfileModal,
  locationPage = 'chat-thread',
  onClosePinnedMessagePage,
}: Props) => {
  const { t } = useTranslation();
  const chat = useChatStore((state) => state.chat);
  const { chatId = '' } = useParams<{ chatId: string }>();
  const { initiateCall } = useCall();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const [showCallMenu, setShowCallMenu] = useState(false);

  if (!chat) return;

  const subtitle = getChatSubtitle(chat, typingUserId, t);
  const isPeerOnline = Boolean(chat.type === 'private' && chat?.peerIsOnline);

  const handleCallClick = () => {
    if (isLongPress.current) return;
    if (showCallMenu) {
      setShowCallMenu(false);
      return;
    }
    initiateCall(chatId, chat.type, chat.title, 'audio');
  };

  const handleTouchStart = () => {
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      setShowCallMenu((prev) => !prev);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  async function openChatProfile() {
    if (!setProfileModal) return;

    if (profileModal?.isOpen) {
      setProfileModal({ isOpen: false, isLoading: false, error: '', user: null });
      return;
    }

    if (chat?.type === 'group' && setIsGroupInfoOpen) {
      setIsGroupInfoOpen(true);
      return;
    }
    if (chat?.type !== 'private' || !chat.peerId) return;

    setProfileModal({ isOpen: true, isLoading: true, error: '', user: null });
    try {
      const profile = await services.userService.getProfile(chat.peerId);
      setProfileModal({
        isOpen: true,
        isLoading: false,
        error: '',
        user: profile,
      });
    } catch (err: any) {
      setProfileModal({
        isOpen: true,
        isLoading: false,
        error: err.message || t('profileLoadError', 'Не удалось загрузить профиль'),
        user: null,
      });
    }
  }

  return (
    <header className="thread-header">
      {locationPage === 'chat-thread' && (
        <Link aria-label={t('back', 'Назад')} className="thread-back" to="/chats">
          <svg
            fill="none"
            height="27"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            viewBox="3 0 20 22"
            width="27"
          >
            <line x1="19" x2="5" y1="12" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
      )}

      {locationPage === 'pinned-messages' && (
        <button
          aria-label={t('back', 'Назад')}
          className="pinned-thread-back p-2 cursor-pointer"
          onClick={onClosePinnedMessagePage}
        >
          <svg
            fill="none"
            className="size-6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            viewBox="3 0 20 22"
          >
            <line x1="19" x2="5" y1="12" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
      )}

      {locationPage === 'chat-thread' && (
        <>
          <div
            className="thread-header-card thread-header-info"
            onClick={openChatProfile}
            style={{
              cursor: chat?.type === 'group' || chat?.type === 'private' ? 'pointer' : 'default',
            }}
          >
            <button
              aria-label={chat.title}
              className={`thread-avatar ${isPeerOnline ? 'is-online' : ''}`}
              tabIndex={-1}
              type="button"
            >
              {chat.avatarUrl ? (
                <img alt="" src={chat.avatarUrl} />
              ) : chat?.type === 'private' && chat?.peerId ? (
                <Identicon size={50} userId={chat.peerId} />
              ) : (
                chat.title.slice(0, 1).toUpperCase()
              )}
            </button>

            <div className="thread-title-wrap">
              <h1>{chat.title}</h1>
              <p>{subtitle}</p>
            </div>
          </div>

          <div className="thread-call-actions-wrap">
            <div className="thread-header-card thread-call-actions thread-call-desktop">
              <button
                className="thread-call-button"
                onClick={() => initiateCall(chatId, chat.type, chat.title, 'audio', chat?.peerId)}
                title={t('audioCall', 'Аудиозвонок')}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="thread-call-icon"
                  height="24"
                  viewBox="0 0 24 24"
                  width="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g fill="none">
                    <path d="M0 0h24v24H0z" />
                    <path
                      d="M4.477 4.116c-2.924 3.217-1.362 8.196 2.932 12.51 4.204 4.222 9.407 5.8 12.486 2.936 1.685-1.567 1.436-4.343-.645-6.198l-.19-.161c-1.931-1.563-4.734-1.568-6.445-.027l-.088.082-.05-.042c-.187-.16-.43-.381-.724-.673l-.298-.303-.306-.326q-.138-.152-.246-.277l-.124-.147-.07.075c1.69-1.697 1.706-4.72.006-6.75-1.887-2.255-4.75-2.335-6.238-.699M9.335 5.97c1.18 1.41 1.049 3.371.099 4.325l-.148.14c-.63.567-1.246.901 1.032 3.218 2.458 2.499 2.765 1.622 3.405.952 1.006-1.01 2.975-1.104 4.329.103 1.497 1.334 1.335 2.868.617 3.536-2.222 2.067-6.476.636-9.984-2.888S3.621 7.734 5.81 5.326c.508-.558 2.101-1.057 3.526.644"
                      fill="currentColor"
                    />
                  </g>
                </svg>
              </button>

              <button
                className="thread-call-button"
                onClick={() => initiateCall(chatId, chat?.type, chat.title, 'video', chat?.peerId)}
                title={t('videoCall', 'Видео')}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="thread-call-icon thread-call-icon-video"
                  height="24"
                  viewBox="0 0 24 24"
                  width="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g fill="none">
                    <path d="M0 0h24v24H0z" />
                    <path
                      clipRule="evenodd"
                      d="M6.5 5.75A3.5 3.5 0 0 0 3 9.25v5.5a3.5 3.5 0 0 0 3.5 3.5h7a3.5 3.5 0 0 0 3.5-3.5v-.52l2.65 2.07A1.45 1.45 0 0 0 22 15.15v-6.3a1.45 1.45 0 0 0-2.35-1.15L17 9.77v-.52a3.5 3.5 0 0 0-3.5-3.5h-7Zm-1.7 3.5A1.7 1.7 0 0 1 6.5 7.55h7a1.7 1.7 0 0 1 1.7 1.7v5.5a1.7 1.7 0 0 1-1.7 1.7h-7a1.7 1.7 0 0 1-1.7-1.7v-5.5Zm12.2 2.8 3.2 2.5v-5.1L17 11.95v.1Z"
                      fill="currentColor"
                      fillRule="evenodd"
                    />
                  </g>
                </svg>
              </button>
            </div>

            {/* Мобильная версия */}
            <div className="thread-header-card thread-call-mobile">
              <button
                className="thread-call-button"
                onClick={handleCallClick}
                onMouseDown={handleTouchStart}
                onMouseUp={handleTouchEnd}
                onTouchEnd={handleTouchEnd}
                onTouchStart={handleTouchStart}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="thread-call-icon"
                  height="22"
                  viewBox="0 0 24 24"
                  width="22"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g fill="none">
                    <path d="M0 0h24v24H0z" />
                    <path
                      d="M4.477 4.116c-2.924 3.217-1.362 8.196 2.932 12.51 4.204 4.222 9.407 5.8 12.486 2.936 1.685-1.567 1.436-4.343-.645-6.198l-.19-.161c-1.931-1.563-4.734-1.568-6.445-.027l-.088.082-.05-.042c-.187-.16-.43-.381-.724-.673l-.298-.303-.306-.326q-.138-.152-.246-.277l-.124-.147-.07.075c1.69-1.697 1.706-4.72.006-6.75-1.887-2.255-4.75-2.335-6.238-.699M9.335 5.97c1.18 1.41 1.049 3.371.099 4.325l-.148.14c-.63.567-1.246.901 1.032 3.218 2.458 2.499 2.765 1.622 3.405.952 1.006-1.01 2.975-1.104 4.329.103 1.497 1.334 1.335 2.868.617 3.536-2.222 2.067-6.476.636-9.984-2.888S3.621 7.734 5.81 5.326c.508-.558 2.101-1.057 3.526.644"
                      fill="currentColor"
                    />
                  </g>
                </svg>
              </button>

              {showCallMenu && (
                <div className="thread-call-menu">
                  <button
                    onClick={() => {
                      setShowCallMenu(false);
                      initiateCall(chatId, chat?.type, chat.title, 'audio', chat?.peerId);
                    }}
                    type="button"
                  >
                    <svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
                      <path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                    </svg>
                    {t('audioCall', 'Аудио')}
                  </button>

                  <button
                    onClick={() => {
                      setShowCallMenu(false);
                      initiateCall(chatId, chat?.type, chat.title, 'video', chat?.peerId);
                    }}
                    type="button"
                  >
                    <svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18">
                      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                    </svg>
                    {t('videoCall', 'Видео')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {locationPage === 'pinned-messages' && (
        <div className="thread-header-card thread-header-info">
          {t('pinnedMessagesTitle', 'Закрепленные сообщения')}
        </div>
      )}
    </header>
  );
};
