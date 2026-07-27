import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export const PinnedMessages = ({ messages, t }) => {
  const navigate = useNavigate();

  const [currentPinnedMessageIndex, setCurrentPinnedMessageIndex] =
    useState(null);

  useEffect(() => {
    if (messages.length) {
      setCurrentPinnedMessageIndex(messages.length - 1);
    }
  }, [messages.length]);

  if (!messages) return null;

  const pinnedMessage = messages[currentPinnedMessageIndex];

  const handleClick = () => {
    navigate(`#${pinnedMessage.id}`);

    setCurrentPinnedMessageIndex((prev) => {
      if (prev === 0) {
        return messages.length - 1;
      }

      return prev - 1;
    });
  };
	console.log(messages)
  return (
    <button
      className="pinned-messages"
      aria-label="Закреплённые сообщения"
      onClick={handleClick}
      type="button"
    >
      <div className="pinned-messages__progress" aria-hidden="true">
        {messages.map((message, index) => (
          <span
            key={message.id}
            className={`pinned-messages__segment ${
              index === currentPinnedMessageIndex
                ? "pinned-messages__segment--active"
                : ""
            }`}
          />
        ))}
      </div>

      <div className="pinned-messages__content">
        <span className="pinned-messages__title">
          {t("pinnedMessages", "Закреплённое сообщение")} #
          {currentPinnedMessageIndex + 1}
        </span>
      </div>
    </button>
  );
};
