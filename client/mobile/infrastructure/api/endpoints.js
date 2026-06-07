export const API_ENDPOINTS = {
  AUTH_SEND_CODE: '/auth/send-code',
  AUTH_VERIFY_CODE: '/auth/verify-code',
  AUTH_REGISTER: '/auth/register',
  AUTH_RESEND_CODE: '/auth/resend-code',
  AUTH_VALIDATE: '/auth/validate',

  CHATS: '/chats',
  CHAT_PRIVATE: '/chats/private',
  CHAT_GROUPS: '/chats/groups',
  CHAT_BY_ID: (chatId) => `/chats/${chatId}`,
  CHAT_MUTE: (chatId) => `/chats/${chatId}/mute`,
  CHAT_PIN: (chatId) => `/chats/${chatId}/pin`,
  CHAT_ARCHIVE: (chatId) => `/chats/${chatId}/archive`,

  MESSAGES: (chatId) => `/messages/${chatId}`,
  MESSAGE_SEND: (chatId) => `/messages/${chatId}`,
  MESSAGE_BY_ID: (messageId) => `/messages/${messageId}`,
  MESSAGE_READ: '/messages/read',
  MESSAGE_FORWARD: (messageId) => `/messages/${messageId}/forward`,
  MESSAGE_REACT: (messageId) => `/messages/${messageId}/reactions`,

  CHAT_PINS: (chatId) => `/chats/${chatId}/pins`,
  CHAT_PIN_MESSAGE: (chatId, messageId) => `/chats/${chatId}/pins/${messageId}`,

  MEDIA_UPLOAD: '/media',
  MEDIA_GET: (uploadId) => `/media/${uploadId}`,

  ADMIN_USERS: '/admin/users',
  ADMIN_USER_DISABLE: (userId) => `/admin/users/${userId}/disable`,
  ADMIN_USER_ENABLE: (userId) => `/admin/users/${userId}/enable`,
  ADMIN_REPORTS: '/admin/reports',
  ADMIN_REPORT_RESOLVE: (reportId) => `/admin/reports/${reportId}/resolve`,
};

export default API_ENDPOINTS;
