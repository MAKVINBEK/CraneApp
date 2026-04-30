/**
 * Application Configuration
 */

const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const config = {
  version: '1.0.0',
  appName: 'CraneApp',

  // API Configuration
  apiBaseUrl: isDevelopment
    ? 'http://localhost:3000/api/v1'
    : `${window.location.origin}/api/v1`,

  // WebSocket Configuration
  socketUrl: isDevelopment
    ? 'ws://localhost:3000/ws'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,

  // Media Configuration
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  allowedVideoTypes: ['video/mp4', 'video/webm'],
  allowedAudioTypes: ['audio/ogg', 'audio/webm', 'audio/mp3', 'audio/m4a'],

  // UI Configuration
  messagesPerPage: 50,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,

  // Feature Flags
  features: {
    voiceCalls: true,
    videoCalls: true,
    e2eEncryption: false, // Not implemented yet
    aiAssistant: true,
    stickers: true,
    channels: true
  }
};
