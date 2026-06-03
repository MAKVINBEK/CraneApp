import Chat from '../../domain/entities/Chat.js';
import API_ENDPOINTS from '../../infrastructure/api/endpoints.js';

class ChatService {
  constructor(apiClient) {
    this.apiClient = apiClient;
  }

  async getChats() {
    const response = await this.apiClient.get(API_ENDPOINTS.CHATS);
    return this.normalizeList(response.data).map((item) => Chat.fromAPI(item));
  }

  async getChat(chatId) {
    const response = await this.apiClient.get(API_ENDPOINTS.CHAT_BY_ID(chatId));
    return Chat.fromAPI(response.data);
  }

  createChat(type, participants, title = '') {
    return this.apiClient
      .post(API_ENDPOINTS.CHATS, { type, participants, title })
      .then((response) => Chat.fromAPI(response.data));
  }

  updateChat(chatId, data) {
    return this.apiClient
      .put(API_ENDPOINTS.CHAT_BY_ID(chatId), data)
      .then((response) => Chat.fromAPI(response.data));
  }

  deleteChat(chatId) {
    return this.apiClient
      .delete(API_ENDPOINTS.CHAT_BY_ID(chatId))
      .then((response) => response.data);
  }

  muteChat(chatId, duration) {
    return this.apiClient
      .post(API_ENDPOINTS.CHAT_MUTE(chatId), { duration })
      .then((response) => response.data);
  }

  pinChat(chatId) {
    return this.apiClient
      .post(API_ENDPOINTS.CHAT_PIN(chatId))
      .then((response) => response.data);
  }

  archiveChat(chatId) {
    return this.apiClient
      .post(API_ENDPOINTS.CHAT_ARCHIVE(chatId))
      .then((response) => response.data);
  }

  normalizeList(data) {
    if (Array.isArray(data)) return data;
    return data?.chats ?? data?.items ?? [];
  }
}

export default ChatService;
