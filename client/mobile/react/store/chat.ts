import { services } from "@/services";
import type { IMessageDto, IPinnedDto, TChat, TMessagesList } from "@/types";
import { create } from "zustand";

export interface IActionMenu {
  messageId: string;
  x: number;
  y: number;
}

type TTranslations = Record<string, string>;

interface IChatState {
  chat: TChat | null;
  messages: TMessagesList;
  error: string;
  editingMessage: IMessageDto | null;
  draft: string;
  replyToMessage: IMessageDto | null;
  selectedMessages: TMessagesList;
  pinnedMessages: IPinnedDto[];
  selectionMode: boolean;
  translations: TTranslations;
  actionMenu: IActionMenu | null;
}

type Updater<T> = (updater: T | ((prev: T) => T)) => void;

interface IChatActions {
  setChat: (chat: TChat | null) => void;
  setMessages: Updater<TMessagesList>;
  setError: (error: string) => void;
  setEditingMessage: (message: IMessageDto | null) => void;
  setDraft: (draft: string) => void;
  setReplyToMessage: (message: IMessageDto | null) => void;
  setSelectedMessages: Updater<TMessagesList>;
  setPinnedMessages: Updater<IPinnedDto[]>;
  setSelectionMode: (mode: boolean) => void;
  setTranslations: Updater<TTranslations>;
  setActionMenu: (menu: IActionMenu | null) => void;
  resetChatState: () => void;
  updateChat: (data: Partial<TChat>) => Promise<void>;
}

const initialChatState: IChatState = {
  chat: null,
  messages: [],
  error: "",
  editingMessage: null,
  draft: "",
  replyToMessage: null,
  selectedMessages: [],
  pinnedMessages: [],
  selectionMode: false,
  translations: {},
  actionMenu: null,
};

type InitialState = IChatState & IChatActions;

export const useChatStore = create<InitialState>((set, get) => {
  const withUpdater =
    <K extends keyof IChatState>(key: K) =>
    (updater: IChatState[K] | ((prev: IChatState[K]) => IChatState[K])) =>
      set(
        (state) =>
          ({
            [key]:
              typeof updater === "function"
                ? (updater as (prev: IChatState[K]) => IChatState[K])(
                    state[key],
                  )
                : updater,
          }) as Pick<IChatState, K>,
      );

  return {
    ...initialChatState,
    setChat: (chat) => set({ chat }),
    setMessages: withUpdater("messages"),
    setError: (error) => set({ error }),
    setEditingMessage: (editingMessage) => set({ editingMessage }),
    setDraft: (draft) => set({ draft }),
    setReplyToMessage: (replyToMessage) => set({ replyToMessage }),
    setSelectedMessages: withUpdater("selectedMessages"),
    setPinnedMessages: withUpdater("pinnedMessages"),
    setSelectionMode: (selectionMode) => set({ selectionMode }),
    setTranslations: withUpdater("translations"),
    setActionMenu: (actionMenu) => set({ actionMenu }),
    resetChatState: () => set(initialChatState),
    updateChat: async (data) => {
      const chat = get().chat;
      if (!chat) return;
      await services.chatService.updateChat(chat.id, data);
      set({ chat: { ...chat, ...data } });
    },
  };
});
