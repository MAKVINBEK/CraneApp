import type { TMediaMessageType, TMessageType } from '@/types';

export type TChatType = 'private' | 'group';

export type TChatRole = 'member' | 'admin' | 'owner';

export interface ILastMessageDto {
  content: string;
  type: TMessageType;
  senderId: string;
  senderName: string;
}

export interface IChatDto {
  id: string;
  type: TChatType;
  title: string;
  description: string;
  avatarUrl: string;
  peerPublicKey?: string;
  peerId?: string;
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

export type TChatsList = IChatDto[];

export interface IChatResponse {
  chat: IChatDto;
}

export interface IChatsResponse {
  chats: TChatsList;
}

export interface IChatContext {
  type: string;
  peerPublicKey: string | null;
  [key: string]: unknown;
}

export interface IMemberDto {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  role: string;
  permissions: Record<string, unknown>;
  mutedUntil?: string;
  joinedAt: string;
}

export type TMembersList = IMemberDto[];

export interface IMembersListResponse {
  members: TMembersList;
}

export interface IPendingAttachment {
  file: File;
  type: TMediaMessageType;
}
