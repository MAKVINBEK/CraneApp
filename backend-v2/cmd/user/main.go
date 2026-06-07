package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"craneapp/backend-v2/internal/platform/authctx"
	"craneapp/backend-v2/internal/platform/config"
	cryptoclient "craneapp/backend-v2/internal/platform/crypto"
	"craneapp/backend-v2/internal/platform/db"
	"craneapp/backend-v2/internal/platform/httpx"
	"craneapp/backend-v2/internal/user"
	_ "github.com/lib/pq"
)

func main() {
	pool, err := db.Open(config.Required("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	crypto := cryptoclient.NewClient(config.Value("CRYPTO_URL", "http://127.0.0.1:5005"))
	handler := user.NewHandler(user.NewService(pool))
	authenticated := authctx.Middleware(crypto)
	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ping(r.Context(), pool); err != nil {
			httpx.ErrorJSON(w, r, http.StatusServiceUnavailable, "database_unavailable", "database unavailable")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.Handle("/api/v2/users/me", authenticated(http.HandlerFunc(handler.Me)))
	mux.Handle("/api/v2/users/avatar", authenticated(http.HandlerFunc(handler.Avatar)))
	mux.Handle("/api/v2/users/search", authenticated(http.HandlerFunc(handler.Search)))
	mux.Handle("/api/v2/users/settings", authenticated(http.HandlerFunc(handler.Settings)))
	mux.Handle("/api/v2/users/privacy", authenticated(http.HandlerFunc(handler.Privacy)))
	mux.Handle("/api/v2/users/blocked", authenticated(http.HandlerFunc(handler.Blocked)))
	mux.Handle("/api/v2/users/blocked/", authenticated(http.HandlerFunc(handler.Unblock)))
	mux.Handle("/api/v2/users/devices", authenticated(http.HandlerFunc(handler.Devices)))
	mux.Handle("/api/v2/users/devices/register", authenticated(http.HandlerFunc(handler.RegisterDevice)))
	mux.Handle("/api/v2/users/devices/terminate-all", authenticated(http.HandlerFunc(handler.TerminateAllDevices)))
	mux.Handle("/api/v2/users/devices/", authenticated(http.HandlerFunc(handler.DeleteDevice)))

	server := &http.Server{Addr: config.Value("USER_ADDR", ":8082"), Handler: httpx.Middleware(mux), ReadHeaderTimeout: 5 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		log.Printf("user service listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdown)
}
