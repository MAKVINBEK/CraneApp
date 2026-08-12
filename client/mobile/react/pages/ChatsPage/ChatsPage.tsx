import {
  EmptyChatListPlaceholder,
  ErrorChatListPlaceholder,
  UserProfilePanel,
} from '@/components/components';
import { ChatListItem, ChatsSkeleton } from '@/components/ui';
import { WS_EVENTS } from '@/consts';
import { useIsMobile, useRealtimeSocket } from '@/hooks';
import { services } from '@/services';
import { useChatsStore, useProfileStore } from '@/store';
import type { IChatDto, ITypingEvent } from '@/types';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useParams } from 'react-router-dom';
import type { IProfileState } from '..';

export function ChatsPage() {
  const chats = useChatsStore((state) => state.chats);
  const setChats = useChatsStore((state) => state.setChats);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const currentUser = useProfileStore((state) => state.user);
  const typingTimeoutsRef = useRef(new Map());
  const { eventBus } = useRealtimeSocket(true);
  const { chatId } = useParams();
  const isMobile = useIsMobile();
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [profileWidth, setProfileWidth] = useState<number | null>(null);
  const [profileState, setProfileState] = useState<IProfileState>({
    isOpen: false,
    isLoading: false,
    error: '',
    user: null,
    chat: null,
    messages: [],
  });
  const [profileCloseToken, setProfileCloseToken] = useState(0);
  const { t } = useTranslation();

  useEffect(() => {
    let isMounted = true;

    services.chatService
      .getChats()
      .then((items) => Promise.all(items.map((chat) => decryptChatPreview(chat))))
      .then((items) => {
        if (!isMounted) return;
        setChats(items);
        setError('');
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || t('chatsLoadError', 'Не удалось загрузить чаты'));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);
  useEffect(() => {
    const updatePreview = async (payload) => {
      const incomingMessage = payload?.message;
      const chatId = payload?.chatId ?? incomingMessage?.chatId;
      if (!chatId || !incomingMessage) return;

      const previewChat = await decryptChatPreview({
        id: chatId,
        lastMessage: {
          ...incomingMessage,
          chatId,
        },
      });

      setChats((items) => {
        const index = items.findIndex((chat) => chat.id === chatId);
        if (index === -1) return items;

        const nextChat = {
          ...items[index],
          typingUserId: null,
          lastMessage: previewChat.lastMessage,
          lastMessageAt:
            incomingMessage.createdAt || incomingMessage.timestamp || new Date().toISOString(),
        };
        window.clearTimeout(typingTimeoutsRef.current.get(chatId));
        typingTimeoutsRef.current.delete(chatId);
        const nextItems = [nextChat, ...items.slice(0, index), ...items.slice(index + 1)];
        return nextItems;
      });
    };

    const handleTyping = (event: ITypingEvent) => {
      const chatId = event.chatId;
      const userId = event.userId || event.senderId;
      if (!chatId || !userId || userId === currentUser?.id) return;

      setChats((items) =>
        items.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                typingUserId: userId,
                peerIsOnline: chat.type === 'private' ? true : chat.peerIsOnline,
              }
            : chat
        )
      );

      window.clearTimeout(typingTimeoutsRef.current.get(chatId));
      typingTimeoutsRef.current.set(
        chatId,
        window.setTimeout(() => {
          setChats((items) =>
            items.map((chat) => (chat.id === chatId ? { ...chat, typingUserId: null } : chat))
          );
          typingTimeoutsRef.current.delete(chatId);
        }, 3000)
      );
    };

    const unsubscribeNewMessage = eventBus.on(WS_EVENTS.MESSAGE.NEW, updatePreview);
    // const unsubscribeEdited = eventBus.on("message:edited", updatePreview);
    const unsubscribeMessageEdited = eventBus.on(WS_EVENTS.MESSAGE.EDITED, updatePreview);
    // const unsubscribeSent = eventBus.on("message:sent", updatePreview);
    const unsubscribeUserTyping = eventBus.on(WS_EVENTS.USER.TYPING, handleTyping);
    // const unsubscribeUserTyping = eventBus.on("user_typing", handleTyping);
    // const unsubscribeMessagesRead = eventBus.on(WS_EVENTS.MESSAGE.MESSAGE_READ, ({ chatId }) => {
    //   setChats((items) =>
    //     items.map((chat) =>
    //       chat.id === chatId ? { ...chat, unreadCount: 0 } : chat,
    //     ),
    //   );
    // });

    return () => {
      unsubscribeNewMessage();
      // unsubscribeEdited();
      unsubscribeMessageEdited();
      // unsubscribeSent();
      unsubscribeUserTyping();
      // unsubscribeUserTyping();
      // unsubscribeMessagesRead();
      typingTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      typingTimeoutsRef.current.clear();
    };
  }, [currentUser?.id, eventBus]);

  // --- новое: ресайз, перенесён из ChatLayout без изменений ---
  function startResize(kind: string, event: PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startSidebarWidth = sidebarWidth;
    const startProfileWidth = profileWidth || Math.round(window.innerWidth * 0.25);

    function handleMove(moveEvent: PointerEvent) {
      if (kind === 'sidebar') {
        const nextWidth = Math.min(
          Math.max(startSidebarWidth + moveEvent.clientX - startX, 280),
          520
        );
        setSidebarWidth(nextWidth);
      } else {
        const nextWidth = Math.min(
          Math.max(startProfileWidth - (moveEvent.clientX - startX), 300),
          560
        );
        setProfileWidth(nextWidth);
      }
    }

    function handleUp() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  const listContent = (
    <>
      <section className="chats-toolbar">
        <Link
          className="chats-search"
          to="/contacts"
          aria-label={t('search', 'Поиск чатов и людей...')}
        >
          <span className="chats-search-placeholder">{t('search', 'Поиск чатов и людей...')}</span>
        </Link>
      </section>

      <section className="chats-list styled-scrollbar" aria-busy={isLoading}>
        {isLoading ? <ChatsSkeleton /> : null}
        {!isLoading && error && (
          <ErrorChatListPlaceholder message={error} onRetry={() => window.location.reload()} />
        )}
        {!isLoading && !error && chats.length === 0 && <EmptyChatListPlaceholder />}
        {!isLoading && !error && chats.map((chat) => <ChatListItem chat={chat} key={chat.id} />)}
      </section>
    </>
  );

  // Мобильный экран: если чат выбран — на весь экран рендерится Outlet (ChatThreadPage),
  // список чатов при этом не рендерится вообще. Если не выбран — список на весь экран,
  // Outlet (заглушка) не рендерим — на мобиле заглушка не нужна.
  if (isMobile) {
    if (chatId) {
      return (
        <Outlet
          context={{
            onProfileStateChange: setProfileState,
            profileCloseToken,
            profileMode: 'modal',
          }}
        />
      );
    }
    return <main className="chats-page">{listContent}</main>;
  }

  // Десктоп: список слева (ресайзабельный) + Outlet справа (тред или заглушка) +
  // опциональная панель профиля, которую открывает сам ChatThreadPage через context.
  return (
    <div className={`chat-workspace ${profileState.isOpen ? 'has-profile' : ''}`}>
      <div className="app-sidebar-pane" style={{ flexBasis: sidebarWidth }}>
        <main className="chats-page">{listContent}</main>
      </div>

      <div
        aria-label="Изменить ширину списка чатов"
        className="app-pane-resizer app-pane-resizer-sidebar"
        onPointerDown={(event) => startResize('sidebar', event.nativeEvent)}
        role="separator"
      />

      <div className="app-chat-pane">
        <Outlet
          context={{
            onProfileStateChange: setProfileState,
            profileCloseToken,
            profileMode: 'panel',
          }}
        />
      </div>

      {profileState.isOpen && (
        <>
          <div
            aria-label="Изменить ширину профиля"
            className="app-pane-resizer app-pane-resizer-profile"
            onPointerDown={(event) => startResize('profile', event.nativeEvent)}
            role="separator"
          />
          <div
            className="app-profile-pane"
            style={profileWidth ? { flexBasis: profileWidth } : undefined}
          >
            <UserProfilePanel
              onClose={() => {
                setProfileState({
                  isOpen: false,
                  isLoading: false,
                  error: '',
                  user: null,
                  chat: null,
                  messages: [],
                });
                setProfileCloseToken((value) => value + 1);
              }}
              profileState={profileState}
            />
          </div>
        </>
      )}
    </div>
  );
}

async function decryptChatPreview(chat: IChatDto): Promise<IChatDto> {
  if (!chat?.id || !chat.lastMessage || typeof chat.lastMessage === 'string') {
    return chat;
  }

  if (chat.lastMessage.type === 'call') {
    return {
      ...chat,
      lastMessage: {
        ...chat.lastMessage,
        content: formatCallPreview(chat.lastMessage.content),
      },
    };
  }

  try {
    const message = await services.messageService.processLastMessageForDisplay(
      chat.id,
      chat.lastMessage
    );
    return {
      ...chat,
      lastMessage: message,
    };
  } catch (error) {
    console.warn('Failed to decrypt chat preview', error);
    return chat;
  }
}

function formatCallPreview(content: string | null) {
  if (!content || typeof content !== 'string') return 'Звонок завершен';
  try {
    const parsed = JSON.parse(content);
    const duration = Number(parsed?.duration) || 0;
    if (duration > 0) {
      return `Звонок завершен · ${formatCallDuration(duration)}`;
    }
  } catch {}
  return 'Звонок завершен';
}

function formatCallDuration(seconds: number) {
  const total = Number(seconds) || 0;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (!minutes) return `${rest} сек`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
