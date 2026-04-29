import { config } from '../../../app/config.js';

/**
 * Authentication API Service
 * Handles all auth-related HTTP requests
 */
export const authApi = {
  baseUrl: config.apiBaseUrl || '/api/v1/auth',

  async sendCode(phone) {
    const response = await fetch(`${this.baseUrl}/send-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send code');
    }

    return response.json();
  },

  async verifyCode(code) {
    const response = await fetch(`${this.baseUrl}/verify-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Invalid code');
    }

    const data = await response.json();
    return data.token;
  },

  async register(userData) {
    const response = await fetch(`${this.baseUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    return response.json();
  },

  async resendCode() {
    const response = await fetch(`${this.baseUrl}/resend-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to resend code');
    }

    return response.json();
  }
};