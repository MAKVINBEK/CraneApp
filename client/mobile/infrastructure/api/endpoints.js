export const API_ENDPOINTS = {
  AUTH_SEND_CODE: '/auth/send-code',
  AUTH_VERIFY_CODE: '/auth/verify-code',
  AUTH_REGISTER: '/auth/register',
  AUTH_RESEND_CODE: '/auth/resend-code',
  AUTH_VALIDATE: '/auth/validate',

  CHATS: '/chats',
  CHAT_BY_ID: (chatId) => `/chats/${chatId}`,
  CHAT_MUTE: (chatId) => `/chats/${chatId}/mute`,
  CHAT_PIN: (chatId) => `/chats/${chatId}/pin`,
  CHAT_ARCHIVE: (chatId) => `/chats/${chatId}/archive`,

  MESSAGES: '/messages',
  MESSAGE_BY_ID: (messageId) => `/messages/${messageId}`,
  MESSAGE_READ: '/messages/read',
  MESSAGE_FORWARD: (messageId) => `/messages/${messageId}/forward`,
  MESSAGE_PIN: (messageId) => `/messages/${messageId}/pin`,
  MESSAGE_REACT: (messageId) => `/messages/${messageId}/react`,
};

export default API_ENDPOINTS;
