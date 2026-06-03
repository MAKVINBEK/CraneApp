import { config } from '../../app/config.js';
import { authStore } from '../../store/authStore.js';

/**
 * Message API Service
 * Handles all message-related HTTP requests
 */
export const messageApi = {
  baseUrl: `${config.apiBaseUrl}/messages`,

  async getMessages(chatId, limit = 50, offset = 0) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}?chatId=${chatId}&limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch messages');
    }

    return response.json();
  },

  async sendMessage(chatId, content, type = 'text', replyTo = null) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ chatId, content, type, replyTo })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send message');
    }

    return response.json();
  },

  async editMessage(messageId, content) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${messageId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ content })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to edit message');
    }

    return response.json();
  },

  async deleteMessage(messageId) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${messageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete message');
    }

    return response.json();
  },

  async markAsRead(chatId, messageIds) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ chatId, messageIds })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to mark as read');
    }

    return response.json();
  },

  async forwardMessage(messageId, chatId) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${messageId}/forward`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ chatId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to forward message');
    }

    return response.json();
  },

  async pinMessage(messageId) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${messageId}/pin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to pin message');
    }

    return response.json();
  },

  async reactToMessage(messageId, emoji) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${messageId}/react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ emoji })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to react to message');
    }

    return response.json();
  }
};