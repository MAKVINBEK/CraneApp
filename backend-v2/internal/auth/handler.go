package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"craneapp/backend-v2/internal/platform/authctx"
	"craneapp/backend-v2/internal/platform/httpx"
)

var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	var input struct {
		Username  string `json:"username"`
		Password  string `json:"password"`
		FirstName string `json:"firstName"`
		LastName  string `json:"lastName"`
		Language  string `json:"language"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&input); err != nil {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "invalid_json", "invalid JSON body")
		return
	}
	if !usernamePattern.MatchString(input.Username) || len(input.Password) < 10 || strings.TrimSpace(input.FirstName) == "" {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "validation_failed", "username, password or firstName is invalid")
		return
	}
	user, token, err := h.service.Register(r.Context(), input.Username, input.Password, input.FirstName, input.LastName, input.Language)
	if errors.Is(err, ErrUsernameTaken) {
		httpx.ErrorJSON(w, r, http.StatusConflict, "username_taken", "username already exists")
		return
	}
	if err != nil {
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "registration failed")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"user": user, "token": token})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&input); err != nil {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "invalid_json", "invalid JSON body")
		return
	}
	user, token, err := h.service.Login(r.Context(), input.Username, input.Password)
	if errors.Is(err, ErrInvalidCredentials) {
		httpx.ErrorJSON(w, r, http.StatusUnauthorized, "invalid_credentials", "invalid username or password")
		return
	}
	if err != nil {
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": user, "token": token})
}

func (h *Handler) PublicKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	current := authctx.MustUser(r)
	var input struct {
		PublicKey string `json:"publicKey"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&input); err != nil {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "invalid_json", "invalid JSON body")
		return
	}
	if err := h.service.SavePublicKey(r.Context(), current.ID, input.PublicKey); err != nil {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "invalid_public_key", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"success": true})
}
