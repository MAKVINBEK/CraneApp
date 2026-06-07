package main

import (
	"context"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"craneapp/backend-v2/internal/platform/config"
	"craneapp/backend-v2/internal/platform/httpx"
)

func main() {
	authURL, err := url.Parse(config.Value("AUTH_URL", "http://127.0.0.1:8081"))
	if err != nil {
		log.Fatal(err)
	}
	authProxy := httputil.NewSingleHostReverseProxy(authURL)
	authProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("auth upstream: %v", err)
		httpx.ErrorJSON(w, r, http.StatusBadGateway, "upstream_unavailable", "auth service unavailable")
	}

	userURL, err := url.Parse(config.Value("USER_URL", "http://127.0.0.1:8082"))
	if err != nil {
		log.Fatal(err)
	}
	userProxy := httputil.NewSingleHostReverseProxy(userURL)
	userProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("user upstream: %v", err)
		httpx.ErrorJSON(w, r, http.StatusBadGateway, "upstream_unavailable", "user service unavailable")
	}

	chatURL, err := url.Parse(config.Value("CHAT_URL", "http://127.0.0.1:8083"))
	if err != nil {
		log.Fatal(err)
	}
	chatProxy := httputil.NewSingleHostReverseProxy(chatURL)
	chatProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("chat upstream: %v", err)
		httpx.ErrorJSON(w, r, http.StatusBadGateway, "upstream_unavailable", "chat service unavailable")
	}

	mediaURL, err := url.Parse(config.Value("MEDIA_URL", "http://127.0.0.1:8084"))
	if err != nil {
		log.Fatal(err)
	}
	mediaProxy := httputil.NewSingleHostReverseProxy(mediaURL)
	mediaProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("media upstream: %v", err)
		httpx.ErrorJSON(w, r, http.StatusBadGateway, "upstream_unavailable", "media service unavailable")
	}

	adminURL, err := url.Parse(config.Value("ADMIN_URL", "http://127.0.0.1:8085"))
	if err != nil {
		log.Fatal(err)
	}
	adminProxy := httputil.NewSingleHostReverseProxy(adminURL)
	adminProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("admin upstream: %v", err)
		httpx.ErrorJSON(w, r, http.StatusBadGateway, "upstream_unavailable", "admin service unavailable")
	}

	frontendDir := config.Value("FRONTEND_DIR", "../../dist")
	fs := http.FileServer(http.Dir(frontendDir))

	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Route new versions explicitly
	mux.Handle("/api/v2/auth/", authProxy)
	mux.Handle("/api/v2/users/", userProxy)
	mux.Handle("/api/v2/chats/", chatProxy)
	mux.Handle("/api/v2/chats", chatProxy)
	mux.Handle("/api/v2/messages/", chatProxy)
	mux.Handle("/api/v2/messages", chatProxy)
	mux.Handle("/api/v2/calls/", chatProxy)
	mux.Handle("/api/v2/media", mediaProxy)
	mux.Handle("/api/v2/media/", mediaProxy)
	mux.Handle("/api/v2/admin/", adminProxy)
	mux.Handle("/ws", chatProxy)
	mux.HandleFunc("/api/v2/emojis", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			httpx.ErrorJSON(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"emojis": []any{}})
	})

	// Serve static files for frontend, fallback to index.html for React Router
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// If requesting API or WS but not matched above, return 404
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/ws") {
			httpx.ErrorJSON(w, r, http.StatusNotFound, "not_found", "route not found")
			return
		}

		// Attempt to serve file
		if _, err := http.Dir(frontendDir).Open(r.URL.Path); err != nil {
			// Fallback to index.html for SPA routing
			http.ServeFile(w, r, frontendDir+"/index.html")
			return
		}
		fs.ServeHTTP(w, r)
	})

	handler := httpx.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" && allowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Crane-Language")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		mux.ServeHTTP(w, r)
	}))

	server := &http.Server{Addr: config.Value("EDGE_ADDR", ":8080"), Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		log.Printf("edge gateway listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdown)
}

func allowedOrigin(origin string) bool {
	for _, allowed := range strings.Split(config.Value("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173"), ",") {
		if strings.TrimSpace(allowed) == origin || allowed == "*" {
			return true
		}
	}
	return false
}
