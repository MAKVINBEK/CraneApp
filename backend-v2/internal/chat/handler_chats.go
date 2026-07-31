package chat

import (
	"errors"
	"net/http"
	"strings"

	"craneapp/backend-v2/internal/platform/authctx"
	"craneapp/backend-v2/internal/platform/httpx"
)

type UpdateGroupInput struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	AvatarURL   string `json:"avatarUrl"`
}

func (h *Handler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	current := authctx.MustUser(r)
	chatID := r.PathValue("chatID")

	var input UpdateGroupInput
	if !decode(w, r, &input) {
		return
	}

	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.AvatarURL = strings.TrimSpace(input.AvatarURL)

	updatedChat, err := h.service.UpdateGroup(
		r.Context(),
		current.ID,
		chatID,
		input.Title,
		input.Description,
		input.AvatarURL,
	)

	switch {
	case errors.Is(err, ErrInvalidInput):
		httpx.ErrorJSON(
			w, r,
			http.StatusBadRequest,
			"validation_failed",
			"invalid group data",
		)
	case errors.Is(err, ErrForbidden):
		httpx.ErrorJSON(
			w, r,
			http.StatusForbidden,
			"access_denied",
			"access denied",
		)
	case errors.Is(err, ErrNotFound):
		httpx.ErrorJSON(
			w, r,
			http.StatusNotFound,
			"chat_not_found",
			"chat not found",
		)
	case errors.Is(err, ErrInvalidChatType):
		httpx.ErrorJSON(
			w, r,
			http.StatusBadRequest,
			"invalid_chat_type",
			"only group chats can be updated",
		)
	case err != nil:
		httpx.ErrorJSON(
			w, r,
			http.StatusInternalServerError,
			"internal_error",
			"group update failed",
		)
	default:
		httpx.JSON(w, http.StatusOK, map[string]any{
			"chat": updatedChat,
		})
	}
}
