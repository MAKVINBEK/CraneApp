export function EmptyChatListPlaceholder({ t }) {
  return (
    <div className="chats-state">
      <div className="chats-state-icon">✉</div>
      <h2>{t("noChatsYet", "Чатов пока нет")}</h2>
      <p>
        {t(
          "noChatsYetDescription",
          "Создайте группу или найдите контакт, чтобы начать переписку.",
        )}
      </p>
    </div>
  );
}
