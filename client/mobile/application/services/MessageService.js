import { eventBus } from '../../core/EventBus.js';
import Message from '../../domain/entities/Message.js';
import MessageValidator from '../../domain/validators/MessageValidator.js';
import API_ENDPOINTS from '../../infrastructure/api/endpoints.js';

class MessageService {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.messages = new Map();
  }

  async getMessages(chatId, limit = 50, offset = 0) {
    const cached = this.messages.get(chatId);
    if (cached && offset === 0) {
      return cached;
    }

    const response = await this.apiClient.get(API_ENDPOINTS.MESSAGES, {
      chatId,
      limit,
      offset,
    });
    const messages = this.normalizeList(response.data).map((item) => Message.fromAPI(item));

    if (offset === 0) {
      this.messages.set(chatId, messages);
    }

    return messages;
  }

  async sendMessage(chatId, content, type = 'text', replyTo = null) {
    const validation = MessageValidator.validateContent(content);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const response = await this.apiClient.post(API_ENDPOINTS.MESSAGES, {
      chatId,
      content: content.trim(),
      type,
      replyTo,
    });
    const message = Message.fromAPI(response.data);

    this.addMessageToCache(chatId, message);
    eventBus.emit('message:sent', message);

    return message;
  }

  async editMessage(messageId, content) {
    const validation = MessageValidator.validateContent(content);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const response = await this.apiClient.put(API_ENDPOINTS.MESSAGE_BY_ID(messageId), {
      content: content.trim(),
    });
    const message = Message.fromAPI(response.data);
    eventBus.emit('message:edited', message);

    return message;
  }

  async deleteMessage(messageId) {
    const response = await this.apiClient.delete(API_ENDPOINTS.MESSAGE_BY_ID(messageId));
    this.removeMessageFromCache(messageId);
    eventBus.emit('message:deleted', { messageId });
    return response.data;
  }

  async markAsRead(chatId, messageIds) {
    const response = await this.apiClient.post(API_ENDPOINTS.MESSAGE_READ, {
      chatId,
      messageIds,
    });

    this.messages.get(chatId)?.forEach((message) => {
      if (messageIds.includes(message.id)) {
        message.markAsRead();
      }
    });

    eventBus.emit('messages:read', { chatId, messageIds });
    return response.data;
  }

  forwardMessage(messageId, chatId) {
    return this.apiClient
      .post(API_ENDPOINTS.MESSAGE_FORWARD(messageId), { chatId })
      .then((response) => response.data);
  }

  pinMessage(messageId) {
    return this.apiClient
      .post(API_ENDPOINTS.MESSAGE_PIN(messageId))
      .then((response) => response.data);
  }

  reactToMessage(messageId, emoji) {
    return this.apiClient
      .post(API_ENDPOINTS.MESSAGE_REACT(messageId), { emoji })
      .then((response) => response.data);
  }

  addMessageToCache(chatId, message) {
    if (!this.messages.has(chatId)) {
      this.messages.set(chatId, []);
    }
    this.messages.get(chatId).push(message);
  }

  removeMessageFromCache(messageId) {
    this.messages.forEach((messages, chatId) => {
      this.messages.set(chatId, messages.filter((message) => message.id !== messageId));
    });
  }

  normalizeList(data) {
    if (Array.isArray(data)) return data;
    return data?.messages ?? data?.items ?? [];
  }
}

export default MessageService;
