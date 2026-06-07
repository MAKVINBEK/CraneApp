package media

import (
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

// POST /api/v2/media — upload a file (multipart/form-data, field "file")
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	current := authctx.MustUser(r)
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "invalid_form", "failed to parse multipart form")
		return
	}
	_, fh, err := r.FormFile("file")
	if err != nil {
		httpx.ErrorJSON(w, r, http.StatusBadRequest, "missing_file", "field 'file' is required")
		return
	}
	up, err := h.service.Upload(r.Context(), current.ID, fh)
	switch {
	case errors.Is(err, ErrTooBig):
		httpx.ErrorJSON(w, r, http.StatusRequestEntityTooLarge, "file_too_large", "file exceeds 100 MB limit")
	case errors.Is(err, ErrBadType):
		httpx.ErrorJSON(w, r, http.StatusUnsupportedMediaType, "unsupported_type", "file type not allowed")
	case err != nil:
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "upload_failed", "upload failed")
	default:
		httpx.JSON(w, http.StatusCreated, map[string]any{"upload": up})
	}
}

// GET /api/v2/media/:id — redirect to presigned download URL
func (h *Handler) Serve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
		return
	}
	uploadID := strings.TrimPrefix(r.URL.Path, "/api/v2/media/")
	if uploadID == "" {
		httpx.ErrorJSON(w, r, http.StatusNotFound, "not_found", "upload id required")
		return
	}
	err := h.service.ServeProxy(r.Context(), uploadID, w)
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.ErrorJSON(w, r, http.StatusNotFound, "not_found", "upload not found")
	case err != nil:
		httpx.ErrorJSON(w, r, http.StatusInternalServerError, "internal_error", "fetch failed")
	}
}
