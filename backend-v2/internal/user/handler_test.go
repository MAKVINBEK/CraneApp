package user

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMeRejectsUnsupportedMethodWithoutServiceCall(t *testing.T) {
	handler := NewHandler(nil)
	request := httptest.NewRequest(http.MethodDelete, "/api/v2/users/me", nil)
	response := httptest.NewRecorder()

	handler.Me(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status 405, got %d", response.Code)
	}
}
