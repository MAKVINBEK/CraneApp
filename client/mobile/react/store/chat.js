import { create } from "zustand";
import services from "../services/serviceContainer";

export const useChatStore = create((set, get) => ({
  chat: null,
  setChat: (chat) => set({ chat }),
  updateChat: async (data) => {
    const chat = get().chat;

    await services.chatService.updateChat(chat.id, data);

    set({ ...chat, ...data });
  },
}));
