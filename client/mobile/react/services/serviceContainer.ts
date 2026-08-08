import { apiClient } from '@/api';
import { STORAGE_KEYS } from '@/consts';
import { AdminService, AuthService, CallService, ChatService, CryptoService, EmojiService, MediaService, MessageService, UserService } from '@/services';
import { useProfileStore } from '@/store';

const cryptoService = new CryptoService(apiClient);
if (typeof window !== 'undefined') {
  const initCryptoForCurrentSession = () => {
    if (!window.localStorage.getItem(STORAGE_KEYS.TOKEN)) return;
    if (!window.localStorage.getItem(STORAGE_KEYS.USER)) return;
    cryptoService.init();
  };

  window.addEventListener('craneapp:auth-session-saved', () => {
    initCryptoForCurrentSession();
  });

  window.setTimeout(initCryptoForCurrentSession, 0);
}

export const services = {
  adminService: new AdminService(apiClient),
  authService: new AuthService(apiClient, useProfileStore.getState()),
  callService: new CallService(apiClient),
  chatService: new ChatService(apiClient),
  cryptoService: cryptoService,
  emojiService: new EmojiService(apiClient),
  mediaService: new MediaService(apiClient),
  messageService: new MessageService(apiClient, cryptoService),
  userService: new UserService(apiClient),
};

export default services;
