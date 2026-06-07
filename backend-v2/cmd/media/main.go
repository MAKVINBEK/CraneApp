package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"craneapp/backend-v2/internal/media"
	"craneapp/backend-v2/internal/platform/authctx"
	"craneapp/backend-v2/internal/platform/config"
	cryptoclient "craneapp/backend-v2/internal/platform/crypto"
	"craneapp/backend-v2/internal/platform/db"
	"craneapp/backend-v2/internal/platform/httpx"
	_ "github.com/lib/pq"
)

func main() {
	pool, err := db.Open(config.Required("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	store := media.NewMinioStore(
		config.Value("MINIO_ENDPOINT", "http://127.0.0.1:9000"),
		config.Value("MINIO_ACCESS_KEY", "craneapp"),
		config.Value("MINIO_SECRET_KEY", "craneapp-local-secret"),
		config.Value("MINIO_REGION", "us-east-1"),
	)
	bucket := config.Value("MEDIA_BUCKET", "crane-media")

	svc := media.NewService(pool, store, bucket)
	handler := media.NewHandler(svc)

	crypto := cryptoclient.NewClient(config.Value("CRYPTO_URL", "http://127.0.0.1:5005"))
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
	mux.Handle("/api/v2/media", authenticated(http.HandlerFunc(handler.Upload)))
	mux.Handle("/api/v2/media/", http.HandlerFunc(handler.Serve))

	server := &http.Server{Addr: config.Value("MEDIA_ADDR", ":8084"), Handler: httpx.Middleware(mux), ReadHeaderTimeout: 5 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		log.Printf("media service listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdown)
}
