import { authStore } from '../../store/authStore.js';
import apiClient from '../../infrastructure/api/apiFactory.js';
import AuthService from './AuthService.js';
import ChatService from './ChatService.js';
import MediaService from './MediaService.js';
import MessageService from './MessageService.js';
import CryptoService from './CryptoService.js';

const cryptoService = new CryptoService(apiClient);
if (typeof window !== 'undefined') {
  window.addEventListener('craneapp:auth-session-saved', () => {
    cryptoService.init();
  });
}

export const services = {
  authService: new AuthService(apiClient, authStore),
  chatService: new ChatService(apiClient),
  cryptoService: cryptoService,
  mediaService: new MediaService(apiClient),
  messageService: new MessageService(apiClient, cryptoService),
};

if (typeof window !== 'undefined') {
  window.CraneAppServices = services;
}

export default services;
