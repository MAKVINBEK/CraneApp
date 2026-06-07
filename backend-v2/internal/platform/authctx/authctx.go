package authctx

import (
	"context"
	"net/http"
	"strings"

	cryptoclient "craneapp/backend-v2/internal/platform/crypto"
	"craneapp/backend-v2/internal/platform/httpx"
)

type User struct {
	ID       string
	Username string
}

type contextKey struct{}

func Middleware(crypto *cryptoclient.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				httpx.ErrorJSON(w, r, http.StatusUnauthorized, "missing_token", "authorization bearer token is required")
				return
			}
			claims, err := crypto.VerifyToken(r.Context(), strings.TrimPrefix(header, "Bearer "))
			if err != nil {
				httpx.ErrorJSON(w, r, http.StatusUnauthorized, "invalid_token", "token is invalid or expired")
				return
			}
			user := User{ID: claims.Subject, Username: claims.Username}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, user)))
		})
	}
}

func UserFromContext(ctx context.Context) (User, bool) {
	user, ok := ctx.Value(contextKey{}).(User)
	return user, ok
}

func MustUser(r *http.Request) User {
	user, ok := UserFromContext(r.Context())
	if !ok {
		panic("authenticated user missing from context")
	}
	return user
}
