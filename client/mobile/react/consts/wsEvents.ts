
export const WS_EVENTS = {
  MESSAGE: {
    NEW: "new_message",
    EDITED: "message_edited",
    DELETED: "message_deleted",
    PINNED: "message_pinned",
    UNPINNED: "message_unpinned",
    SENT: "message_sent",
    MESSAGE_SENT: "message:sent",
    MESSAGE_READ: "message:read",
  },
  CHAT: {
    ADD_MEMBER: "add_chat_member",
  },
  USER: {
    TYPING: "typing",
    USER_TYPING: "user_typing",
  },
  CALL: {
    INCOMING: "call_incoming",
    CANCELED: "call_cancelled",
    INVITE_RESPONSE: "call_invite_response",
  },
} as const;
