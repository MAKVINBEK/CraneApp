import { createContext, useContext, useState } from "react";

const ChatContext = createContext(null);


export default function ChatProvider ({ children }) {
    const [chat, setChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [error, setError] = useState("");
    const [editingMessage, setEditingMessage] = useState(null);
    const [draft, setDraft] = useState("");
    const [replyToMessage, setReplyToMessage] = useState(null);
    const [selectedMessages, setSelectedMessages] = useState([]);
    const [pinnedMessages, setPinnedMessages] = useState([]);
    const [selectionMode, setSelectionMode] = useState(false);
    const [translations, setTranslations] = useState({});
    const [actionMenu, setActionMenu] = useState(null);
    return (
        <ChatContext.Provider value={{
            chat, setChat,
            messages, setMessages,
            error, setError,
            editingMessage, setEditingMessage,
            draft, setDraft,
            replyToMessage, setReplyToMessage,
            selectedMessages, setSelectedMessages,
            pinnedMessages, setPinnedMessages,
            selectionMode, setSelectionMode,
            translations, setTranslations,
            actionMenu, setActionMenu
        }}>
            {children}
        </ChatContext.Provider>
    );
};

// Кастомный хук для удобного использования в компонентах
export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error("useChat должен использоваться внутри ChatProvider");
    }
    return context;
};