class Message {
  constructor({
    id,
    chatId,
    senderId,
    content,
    type = 'text',
    timestamp = new Date(),
    isRead = false,
    attachments = [],
    replyTo = null,
    status = 'sent',
  }) {
    this.id = id;
    this.chatId = chatId;
    this.senderId = senderId;
    this.content = content;
    this.type = type;
    this.timestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
    this.isRead = Boolean(isRead);
    this.attachments = attachments;
    this.replyTo = replyTo;
    this.status = status;
  }

  static fromAPI(data) {
    return new Message({
      id: data.id,
      chatId: data.chatId ?? data.chat_id,
      senderId: data.senderId ?? data.sender_id,
      content: data.content,
      type: data.type ?? 'text',
      timestamp: data.timestamp ?? data.createdAt ?? data.created_at,
      isRead: data.isRead ?? data.is_read ?? false,
      attachments: data.attachments ?? [],
      replyTo: data.replyTo ?? data.reply_to ?? null,
      status: data.status ?? 'sent',
    });
  }

  toAPI() {
    return {
      id: this.id,
      chatId: this.chatId,
      senderId: this.senderId,
      content: this.content,
      type: this.type,
      timestamp: this.timestamp.toISOString(),
      isRead: this.isRead,
      attachments: this.attachments,
      replyTo: this.replyTo,
      status: this.status,
    };
  }

  markAsRead() {
    this.isRead = true;
    this.status = 'read';
    return this;
  }

  isFromUser(userId) {
    return this.senderId === userId;
  }

  hasAttachments() {
    return this.attachments.length > 0;
  }
}

export default Message;
