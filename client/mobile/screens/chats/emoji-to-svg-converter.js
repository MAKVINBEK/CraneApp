/**
 * Автоматическая замена эмодзи на SVG-иконки в UI элементах
 * Оставляет эмодзи в реакциях, эмодзи-пикере и сообщениях
 */

// Маппинг эмодзи на SVG-иконки для UI элементов
const emojiToSvgMap = {
    // Кнопки и UI элементы
    '📁': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
    '📂': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
    '📄': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2v16a2 2 0 0 0 2h8a2 2 0 0 0 2V4a2 2 0 0 0-2z"/></svg>',
    '📅': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '📆': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '📇': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v2h4l5-5z"/><path d="M13 5l5 4h4v2h-4l-5-5z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
    '🔊': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v2h4l5-5z"/><path d="M13 5l5 4h4v2h-4l-5-5z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
    '📝': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2v16a2 2 0 0 0 2h8a2 2 0 0 0 2V4a2 2 0 0 0-2z"/></svg>',
    '📨': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="12" cy="10" r="1" fill="currentColor"/></svg>',
    '📷': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h4l2-3h9a2 2 0 0 1 2 2v6z"/><circle cx="12" cy="13" r="4"/></svg>',
    '🎬': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    '🎞': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-5 5L5 21l5-5z"/></svg>',
    '🎨': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    '📢': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v2h4l5-5z"/><path d="M13 5l5 4h4v2h-4l-5-5z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
    '💬': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="12" cy="10" r="1" fill="currentColor"/></svg>',
    '👤': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    '👥': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    '🔍': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="3"/></svg>',
    '📱': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M9 9h6M9 15h6M9 12h6"/></svg>',
    '🔫': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V7a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v7"/><path d="M9 18h6"/><path d="M9 22h6v-2H9v2z"/></svg>',
    '🚫': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V7a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v7"/><path d="M9 18h6"/><path d="M9 22h6v-2H9v2z"/></svg>',
    '📮': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="12" cy="10" r="1" fill="currentColor"/></svg>',
    '✓': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/><polyline points="20 12 9 17 16 12"/></svg>',
    '✅': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 16.17 16.17z"/><path d="M21 11h-6l-2 2 2 2v-1c0-.55-.45-1-1-1s-1 .45-1 1v1l2-2z"/></svg>',
    '🎭': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9l6 6M9 15l6-6M9 15l6-6"/></svg>',
    '💰': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6M12 18v6M12 18v6"/></svg>',
    '🔫': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V7a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v7"/><path d="M9 18h6"/><path d="M9 22h6v-2H9v2z"/></svg>',
    '🚧': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.47 10.94l.39-.39a2 2 0 0 1 1.46l2.53 2.53a2 2 0 0 1 1.46l-.39.39a2 2 0 0 1-1.46L14.47 10.94z"/></svg>',
    '🖼️': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    '📌': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 21.7 20 13 20 10c0-1.66-4-3-4-3s-4 1.34-4 3c0 1.66 4 3 4 3 0 4 3 4-3 4-3z"/></svg>',
    '📎': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2v16a2 2 0 0 0 2h8a2 2 0 0 0 2V4a2 2 0 0 0-2z"/></svg>',
    '🔊': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v2h4l5-5z"/><path d="M13 5l5 4h4v2h-4l-5-5z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
    '🔔': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2v16a2 2 0 0 0 2h8a2 2 0 0 0 2V4a2 2 0 0 0-2z"/></svg>',
    '📨': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="12" cy="10" r="1" fill="currentColor"/></svg>',
    '📞': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-5 5L5 21l5-5z"/></svg>',
    '📃': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2v16a2 2 0 0 0 2h8a2 2 0 0 0 2V4a2 2 0 0 0-2z"/></svg>',
    '📄': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    '📅': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '📆': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '📇': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v2h4l5-5z"/><path d="M13 5l5 4h4v2h-4l-5-5z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
    '✏️': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.5 2.5 0 0 0-3.5 0h-5.5a2.5 2.5 0 0 0-3.5 0v2a2.5 2.5 0 0 0 3.5 0h5.5a2.5 2.5 0 0 0 3.5 0v-2z"/></svg>',
    '✨': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    '🚧': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.47 10.94l.39-.39a2 2 0 0 1 1.46l2.53 2.53a2 2 0 0 1 1.46l-.39.39a2 2 0 0 1-1.46L14.47 10.94z"/></svg>',
    '🎤': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3v8"/><path d="M19 10a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2v-1"/></svg>',
    '📍': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    '🔗': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 7.07L5.93 7.07a5 5 0 0 0-7.07 0l4.14 4.14a5 5 0 0 0 7.07 7.07z"/></svg>',
    '🔎': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="3"/></svg>',
    '📞': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-5 5L5 21l5-5z"/></svg>',
    '📃': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2v16a2 2 0 0 0 2h8a2 2 0 0 0 2V4a2 2 0 0 0-2z"/></svg>',
    '📄': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    '📅': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '📆': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '📇': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v2h4l5-5z"/><path d="M13 5l5 4h4v2h-4l-5-5z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="12" y1="17" x2="12" y2="17"/></svg>',
    '✏️': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.5 2.5 0 0 0-3.5 0h-5.5a2.5 2.5 0 0 0-3.5 0v2a2.5 2.5 0 0 0 3.5 0h5.5a2.5 2.5 0 0 0 3.5 0v-2z"/></svg>',
    '✨': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    '🚧': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.47 10.94l.39-.39a2 2 0 0 1 1.46l2.53 2.53a2 2 0 0 1 1.46l-.39.39a2 2 0 0 1-1.46L14.47 10.94z"/></svg>',
    '🎤': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3v8"/><path d="M19 10a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2v-1"/></svg>',
    '📍': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    '🔗': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 7.07L5.93 7.07a5 5 0 0 0-7.07 0l4.14 4.14a5 5 0 0 0 7.07 7.07z"/></svg>',
    '🔎': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="3"/></svg>'
};

// Селекторы элементов, где нужно заменять эмодзи
const uiSelectors = [
    'button', 'span', 'div', 'h1', 'h2', 'h3', 'p', 'label', 'a', 
    '.modal-title', '.create-option-icon', '.sticker-pack-icon', 
    '.profile-avatar-large', '.profile-notifications span',
    '.media-option-icon', '.sticker-empty', '.modal-empty-icon'
];

// Элементы, где НЕ нужно заменять эмодзи (оставить как есть)
const excludeSelectors = [
    '.emoji-picker', '.emoji-grid', '.emoji-tab', 
    '.context-reaction-btn', '.reaction-badge', '.message-reactions',
    '.message-content', '[data-emoji]', '.sticker-item'
];

// Функция замены эмодзи на SVG
function replaceEmojisWithSvg() {
    uiSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            // Пропускаем элементы, где эмодзи не трогаем
            const shouldExclude = excludeSelectors.some(excludeSelector => 
                element.matches(excludeSelector) || element.closest(excludeSelector)
            );
            
            if (shouldExclude) return;
            
            // Проверяем, что это текстовый узел
            if (element.nodeType === Node.TEXT_NODE || element.childNodes.length === 0) {
                const text = element.textContent;
                if (text && text.length > 0 && text.length < 50) { // Только короткие тексты
                    let replacedText = text;
                    
                    // Заменяем эмодзи на SVG
                    Object.entries(emojiToSvgMap).forEach(([emoji, svg]) => {
                        replacedText = replacedText.split(emoji).join(svg);
                    });
                    
                    if (replacedText !== text) {
                        element.textContent = replacedText;
                    }
                }
            } else if (element.nodeType === Node.ELEMENT_NODE) {
                // Обрабатываем HTML элементы
                let html = element.innerHTML;
                let changed = false;
                
                Object.entries(emojiToSvgMap).forEach(([emoji, svg]) => {
                    if (html.includes(emoji)) {
                        html = html.split(emoji).join(svg);
                        changed = true;
                    }
                });
                
                if (changed) {
                    element.innerHTML = html;
                }
            }
        });
    });
}

// Функция инициализации
function initEmojiToSvgConverter() {
    // Ждем загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', replaceEmojisWithSvg);
    } else {
        replaceEmojisWithSvg();
    }
    
    // Наблюдаем за динамически добавляемыми элементами
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        replaceEmojisWithSvg.call(node);
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Автоматический запуск при загрузке страницы
initEmojiToSvgConverter();

// Экспорт для использования в других скриптах
window.emojiToSvgConverter = {
    replaceEmojisWithSvg,
    initEmojiToSvgConverter
};
