import type { WS_EVENTS } from "@/consts";
import type { IMessageDto } from "./message.types";

export interface IMessageDeletedEvent {
  messageId: string;
}
export interface IMessagesReadEvent {
  chatId: string;
  messageIds: string[];
}
export interface IMessageSentEvent {
  message: IMessageDto;
  chatId: string;
}
export interface IMessagePinEvent {
  chatId: string;
  messageId: string;
}
export interface IChatMemberEvent {
  chatId: string;
  userId: string;
}
export interface ITypingEvent {
  chatId: string;
  userId: string;
  isTyping: boolean;
}
export interface IIncomingCallEvent {
  callId: string;
  callerId: string;
}
export interface ICallCanceledEvent {
  callId: string;
}
export interface ICallInviteResponseEvent {
  callId: string;
  accepted: boolean;
}

type ValueOf<T> = T[keyof T];

export type TWsEventType = ValueOf<{
  [K in keyof typeof WS_EVENTS]: ValueOf<(typeof WS_EVENTS)[K]>;
}>;

export interface IWsEventMap {
  [WS_EVENTS.MESSAGE.NEW]: IMessageDto;
  [WS_EVENTS.MESSAGE.EDITED]: IMessageDto;
  [WS_EVENTS.MESSAGE.DELETED]: {
    messageId: string;
  };
  [WS_EVENTS.MESSAGE.PINNED]: {
    chatId: string;
    messageId: string;
  };
  [WS_EVENTS.MESSAGE.UNPINNED]: {
    chatId: string;
    messageId: string;
  };
  [WS_EVENTS.MESSAGE.SENT]: {
    message: IMessageDto;
    chatId: string;
  };
  [WS_EVENTS.MESSAGE.MESSAGE_SENT]: {
    message: IMessageDto;
    chatId: string;
  };
  [WS_EVENTS.MESSAGE.MESSAGE_READ]: {
    chatId: string;
    messageIds: string[];
  };

  [WS_EVENTS.CHAT.ADD_MEMBER]: {
    chatId: string;
    userId: string;
  };

  [WS_EVENTS.USER.TYPING]: {
    chatId: string;
    userId: string;
    isTyping: boolean;
  };

  [WS_EVENTS.USER.USER_TYPING]: {
    chatId: string;
    userId: string;
    isTyping: boolean;
  };

  [WS_EVENTS.CALL.INCOMING]: {
    callId: string;
    callerId: string;
  };

  [WS_EVENTS.CALL.CANCELED]: {
    callId: string;
  };

  [WS_EVENTS.CALL.INVITE_RESPONSE]: {
    callId: string;
    accepted: boolean;
  };
}
