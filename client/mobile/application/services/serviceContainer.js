import { authStore } from '../../store/authStore.js';
import apiClient from '../../infrastructure/api/apiFactory.js';
import AuthService from './AuthService.js';
import ChatService from './ChatService.js';
import MessageService from './MessageService.js';

export const services = {
  authService: new AuthService(apiClient, authStore),
  chatService: new ChatService(apiClient),
  messageService: new MessageService(apiClient),
};

export default services;
