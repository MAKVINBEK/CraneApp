import { useTranslate } from "../../hooks/useTranslate";

export function ErrorChatListPlaceholder({ message, onRetry }) {
  const { t } = useTranslate();
  return (
    <div className="chats-state">
      <div className="chats-state-icon">!</div>
      <h2>{t("loadingError", "Ошибка загрузки")}</h2>
      <p>{message}</p>
      <button className="chats-retry" onClick={onRetry} type="button">
        {t("retry", "Повторить")}
      </button>
    </div>
  );
}
