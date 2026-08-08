import { create } from "zustand";
import services from "../services/serviceContainer";
import type { TChats } from "@/types";

interface InitialState {
	chats: TChats;
	setChats: (chats: TChats | ((prev: TChats) => TChats)) => void;
	deleteChat: (chatId: string) => Promise<IDeleteChatResponse>;
}

interface IDeleteChatResponse {
	success: boolean;
}

export const useChatsStore = create<InitialState>((set, get) => ({
	chats: [],
	setChats: (chats) =>
		set((state) => ({
			chats: typeof chats === "function" ? chats(state.chats) : chats,
		})),
	deleteChat: async (chatId) => {
		const result: IDeleteChatResponse = await services.chatService.deleteChat(chatId);

		if (result.success) {
			const chats = get().chats;
			const updatedChatsList = chats.filter((chat) => chat.id !== chatId);

			set({ chats: updatedChatsList });
		}

		return result;
	},
}));
