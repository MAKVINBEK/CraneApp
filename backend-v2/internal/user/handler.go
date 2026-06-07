package user

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"craneapp/backend-v2/internal/platform/authctx"
	"craneapp/backend-v2/internal/platform/httpx"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		current := authctx.MustUser(r)
		profile, err := h.service.Me(r.Context(), current.ID)
		respondProfile(w, r, profile, err)
	case http.MethodPut:
		current := authctx.MustUser(r)
		var input struct {
			FirstName *string `json:"firstName"`
			LastName  *string `json:"lastName"`
			Bio       *string `json:"bio"`
			AvatarURL *string `json:"avatarUrl"`
		}
		if !decode(w, r, &input) {
			return
		}
		profile, err := h.service.UpdateProfile(r.Context(), current.ID, input.FirstName, input.LastName, input.Bio, input.AvatarURL)
		respondProfile(w, r, profile, err)
	default:
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
	}
}

func (h *Handler) Avatar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	current := authctx.MustUser(r)
	var input struct {
		Avatar    *string `json:"avatar"`
		AvatarURL *string `json:"avatarUrl"`
	}
	if !decode(w, r, &input) {
		return
	}
	avatar := input.AvatarURL
	if avatar == nil {
		avatar = input.Avatar
	}
	profile, err := h.service.UpdateProfile(r.Context(), current.ID, nil, nil, nil, avatar)
	respondProfile(w, r, profile, err)
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	current := authctx.MustUser(r)
	users, err := h.service.Search(r.Context(), current.ID, r.URL.Query().Get("q"))
	if err != nil {
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "search failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"users": users})
}

func (h *Handler) Settings(w http.ResponseWriter, r *http.Request) {
	current := authctx.MustUser(r)
	switch r.Method {
	case http.MethodGet:
		settings, privacy, err := h.service.Settings(r.Context(), current.ID)
		if err != nil {
			httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "settings fetch failed")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"settings": settings, "privacy": privacy})
	case http.MethodPut:
		var body map[string]any
		if !decode(w, r, &body) {
			return
		}
		settings, err := h.service.UpdateSettings(r.Context(), current.ID, body)
		if err != nil {
			httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "settings update failed")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"settings": settings})
	default:
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
	}
}

func (h *Handler) Privacy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	current := authctx.MustUser(r)
	var body map[string]any
	if !decode(w, r, &body) {
		return
	}
	privacy, err := h.service.UpdatePrivacy(r.Context(), current.ID, body)
	if err != nil {
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "privacy update failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"privacy": privacy})
}

func (h *Handler) Blocked(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		current := authctx.MustUser(r)
		blocked, err := h.service.Blocked(r.Context(), current.ID)
		if err != nil {
			httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "blocked users fetch failed")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"blocked": blocked})
	case http.MethodPost:
		current := authctx.MustUser(r)
		var input struct {
			UserID string `json:"userId"`
		}
		if !decode(w, r, &input) {
			return
		}
		if strings.TrimSpace(input.UserID) == "" {
			httpx.ErrorJSON(w, r, http.StatusBadRequest, "validation_failed", "userId is required")
			return
		}
		err := h.service.Block(r.Context(), current.ID, input.UserID)
		switch {
		case errors.Is(err, ErrSelfBlock):
			httpx.ErrorJSON(w, r, http.StatusBadRequest, "self_block", "cannot block yourself")
		case errors.Is(err, ErrAlreadyBlocked):
			httpx.ErrorJSON(w, r, http.StatusConflict, "already_blocked", "user is already blocked")
		case errors.Is(err, ErrNotFound):
			httpx.ErrorJSON(w, r, http.StatusNotFound, "user_not_found", "user not found")
		case err != nil:
			httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "block failed")
		default:
			httpx.JSON(w, http.StatusCreated, map[string]bool{"success": true})
		}
	default:
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
	}
}

func (h *Handler) Unblock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	current := authctx.MustUser(r)
	blockedUserID := strings.TrimPrefix(r.URL.Path, "/api/v2/users/blocked/")
	if blockedUserID == "" || blockedUserID == r.URL.Path {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "validation_failed", "blocked user id is required")
		return
	}
	if err := h.service.Unblock(r.Context(), current.ID, blockedUserID); err != nil {
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "unblock failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"success": true})
}

func respondProfile(w http.ResponseWriter, r *http.Request, profile Profile, err error) {
	if errors.Is(err, ErrNotFound) {
		httpx.ErrorJSON(w, r, http.StatusNotFound, "user_not_found", "user not found")
		return
	}
	if err != nil {
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "profile operation failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": profile})
}

func (h *Handler) Devices(w http.ResponseWriter, r *http.Request) {
	current := authctx.MustUser(r)
	if r.Method == http.MethodGet {
		devices, err := h.service.Devices(r.Context(), current.ID)
		if err != nil {
			httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "failed to fetch devices")
			return
		}
		if devices == nil {
			devices = []Session{}
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"devices": devices})
		return
	}
	httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
}

func (h *Handler) RegisterDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	current := authctx.MustUser(r)
	var input struct {
		DeviceName string `json:"deviceName"`
		DeviceType string `json:"deviceType"`
		UserAgent  string `json:"userAgent"`
		ClientIP   string `json:"clientIP"`
	}
	if !decode(w, r, &input) {
		return
	}
	sessionID, err := h.service.RegisterDevice(r.Context(), current.ID, input.DeviceName, input.DeviceType, input.ClientIP, "Unknown", input.UserAgent)
	if err != nil {
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "failed to register device")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"success": true, "sessionId": sessionID})
}

func (h *Handler) DeleteDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	current := authctx.MustUser(r)
	sessionID := strings.TrimPrefix(r.URL.Path, "/api/v2/users/devices/")
	if sessionID == "" || sessionID == r.URL.Path {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "invalid_request", "missing session id")
		return
	}
	err := h.service.DeleteDevice(r.Context(), current.ID, sessionID)
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.ErrorJSON(w, r, http.StatusNotFound, "not_found", "session not found")
		return
	case err != nil:
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "operation failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"success": true})
}

func (h *Handler) TerminateAllDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	current := authctx.MustUser(r)
	err := h.service.TerminateAllDevices(r.Context(), current.ID)
	if err != nil {
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "failed to terminate devices")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"success": true})
}

func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10)).Decode(value); err != nil {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "invalid_json", "invalid JSON body")
		return false
	}
	return true
}
