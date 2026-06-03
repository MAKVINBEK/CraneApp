import { config } from '../../app/config.js';
import { authStore } from '../../store/authStore.js';

/**
 * Chat API Service
 * Handles all chat-related HTTP requests
 */
export const chatApi = {
  baseUrl: `${config.apiBaseUrl}/chats`,

  async getChats() {
    const token = authStore.getToken();
    const response = await fetch(this.baseUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch chats');
    }

    return response.json();
  },

  async getChat(chatId) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${chatId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch chat');
    }

    return response.json();
  },

  async createChat(type, participants, title = '') {
    const token = authStore.getToken();
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ type, participants, title })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create chat');
    }

    return response.json();
  },

  async updateChat(chatId, data) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${chatId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update chat');
    }

    return response.json();
  },

  async deleteChat(chatId) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${chatId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete chat');
    }

    return response.json();
  },

  async muteChat(chatId, duration) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${chatId}/mute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ duration })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to mute chat');
    }

    return response.json();
  },

  async pinChat(chatId) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${chatId}/pin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to pin chat');
    }

    return response.json();
  },

  async archiveChat(chatId) {
    const token = authStore.getToken();
    const response = await fetch(`${this.baseUrl}/${chatId}/archive`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to archive chat');
    }

    return response.json();
  }
};