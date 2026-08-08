import type { TMessageType } from "@/types";

export type TChatType = "private" | "group";

export type TChatRole = "member" | "admin" | "owner";

export interface ILastMessageDto {
  content: string;
  type: TMessageType;
  senderId: string;
  senderName: string;
}

export interface IPrivateChatDto {
  id: string;
  type: TChatType;
  title: string;
  description: string;
  avatarUrl: string;
  peerPublicKey: string;
  peerId: string;
  ownerId: string;
  role: TChatRole;
  isPinned: boolean;
  isArchived: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  lastMessageAt: Date;
  unreadCount: number;
  lastMessage: ILastMessageDto;
}

export interface IGroupChatDto {
  id: string;
  type: TChatType;
  title: string;
  description: string;
  avatarUrl: string;
  ownerId: string;
  role: TChatRole;
  isPinned: boolean;
  isArchived: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  lastMessageAt: Date;
  unreadCount: number;
  lastMessage: ILastMessageDto;
}

export type TChats = (IPrivateChatDto | IGroupChatDto)[];

export type TChat = IPrivateChatDto | IGroupChatDto;

export interface IChatResponse {
  chat: TChat;
}

export interface IChatsResponse {
  chats: TChats;
}

export interface IChatContext {
  type: string;
  peerPublicKey: string | null;
  [key: string]: unknown;
}
