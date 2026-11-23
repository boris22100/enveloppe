package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"io"
	"compress/gzip"
	"time"
	"os"
	"strings"

	"jmap-pwa/internal/crypto"
	"jmap-pwa/internal/jmap"
)

//go:embed all:static
var staticFS embed.FS



type gzipResponseWriter struct {
	io.Writer
	http.ResponseWriter
}

func (w gzipResponseWriter) Write(b []byte) (int, error) {
	return w.Writer.Write(b)
}

func (w gzipResponseWriter) Flush() {
	if gz, ok := w.Writer.(*gzip.Writer); ok {
		_ = gz.Flush()
	}
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func greenMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/assets/"):
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasPrefix(r.URL.Path, "/api/"):
			w.Header().Set("Cache-Control", "no-store")
		default:
			w.Header().Set("Cache-Control", "no-cache")
		}

		isSSE := strings.Contains(r.URL.Path, "/events") || strings.Contains(r.Header.Get("Accept"), "text/event-stream")
		isDownload := strings.Contains(r.URL.Path, "/download/")
		if !isSSE && !isDownload && strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Add("Vary", "Accept-Encoding")
			w.Header().Del("Content-Length")
			gz, _ := gzip.NewWriterLevel(w, gzip.DefaultCompression)
			defer gz.Close()
			next.ServeHTTP(gzipResponseWriter{Writer: gz, ResponseWriter: w}, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		next.ServeHTTP(w, r)
	})
}

func main() {
	secret := os.Getenv("SESSION_SECRET")
	if len(secret) < 16 {
		log.Fatal("SESSION_SECRET doit contenir au moins 16 caractères")
	}
	secureCookie := strings.HasPrefix(os.Getenv("PUBLIC_APP_URL"), "https://")

	vault, err := crypto.NewVault(secret, secureCookie)
	if err != nil {
		log.Fatal(err)
	}
	proxy := jmap.NewProxy(os.Getenv("ALLOWED_JMAP_SERVERS"))
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/accounts", func(w http.ResponseWriter, r *http.Request) {
		accounts, _ := vault.Load(r)
		pub := make([]crypto.PublicAccount, 0, len(accounts))
		for _, a := range accounts {
			pub = append(pub, crypto.PublicAccount{
				ID: a.ID, Label: a.Label, Color: a.Color, Host: a.Host, Username: a.Username,
			})
		}
		writeJSON(w, http.StatusOK, pub)
	})

	mux.HandleFunc("POST /api/accounts", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Label    string `json:"label"`
			Color    string `json:"color"`
			Host     string `json:"host"`
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "JSON invalide", http.StatusBadRequest)
			return
		}
		session, err := proxy.Discover(payload.Host, payload.Username, payload.Password)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		accounts, _ := vault.Load(r)
		idBytes := make([]byte, 6)
		_, _ = rand.Read(idBytes)
		newAcc := crypto.Account{
			ID:             hex.EncodeToString(idBytes),
			Label:          payload.Label,
			Color:          payload.Color,
			Host:           strings.TrimRight(payload.Host, "/"),
			Username:       payload.Username,
			Password:       payload.Password,
			APIUrl:         session.APIUrl,
			DownloadUrl:    session.DownloadUrl,
			UploadUrl:      session.UploadUrl,
			EventSourceUrl: session.EventSourceUrl,
		}
		accounts = append(accounts, newAcc)
		if err := vault.Save(w, accounts); err != nil {
			http.Error(w, "erreur sauvegarde cookie", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, crypto.PublicAccount{
			ID: newAcc.ID, Label: newAcc.Label, Color: newAcc.Color, Host: newAcc.Host, Username: newAcc.Username,
		})
	})

	mux.HandleFunc("DELETE /api/accounts/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		accounts, _ := vault.Load(r)
		filtered := make([]crypto.Account, 0, len(accounts))
		for _, a := range accounts {
			if a.ID != id {
				filtered = append(filtered, a)
			}
		}
		_ = vault.Save(w, filtered)
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /api/jmap/{id}/session", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok {
			http.Error(w, "compte introuvable", http.StatusNotFound)
			return
		}
		session, err := proxy.Discover(acc.Host, acc.Username, acc.Password)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, session)
	})

	mux.HandleFunc("POST /api/jmap/{id}/api", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok {
			http.Error(w, "compte introuvable", http.StatusNotFound)
			return
		}
		proxy.ForwardAPI(w, r, acc)
	})

	mux.HandleFunc("POST /api/jmap/{id}/upload/{accountId}", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok {
			http.Error(w, "compte introuvable", http.StatusNotFound)
			return
		}
		proxy.ForwardUpload(w, r, acc, r.PathValue("accountId"))
	})

	mux.HandleFunc("GET /api/jmap/{id}/download/{accountId}/{blobId}/{name}", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok {
			http.Error(w, "compte introuvable", http.StatusNotFound)
			return
		}
		mime := r.URL.Query().Get("type")
		if mime == "" {
			mime = "application/octet-stream"
		}
		proxy.ForwardDownload(w, r, acc, r.PathValue("accountId"), r.PathValue("blobId"), r.PathValue("name"), mime)
	})

	mux.HandleFunc("POST /api/security/{id}/password", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok { http.Error(w, "compte introuvable", http.StatusNotFound); return }
		proxy.ForwardStalwartAPI(w, r, acc, "/api/account/password")
	})
	mux.HandleFunc("GET /api/security/{id}/app-passwords", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok { http.Error(w, "compte introuvable", http.StatusNotFound); return }
		proxy.ForwardStalwartAPI(w, r, acc, "/api/account/auth")
	})
	mux.HandleFunc("POST /api/security/{id}/app-passwords", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok { http.Error(w, "compte introuvable", http.StatusNotFound); return }
		proxy.ForwardStalwartAPI(w, r, acc, "/api/account/auth")
	})
	mux.HandleFunc("DELETE /api/security/{id}/app-passwords/{keyId}", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok { http.Error(w, "compte introuvable", http.StatusNotFound); return }
		proxy.ForwardStalwartAPI(w, r, acc, "/api/account/auth/"+r.PathValue("keyId"))
	})

	mux.HandleFunc("GET /api/jmap/{id}/events", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok {
			http.Error(w, "compte introuvable", http.StatusNotFound)
			return
		}
		proxy.ForwardEvents(w, r, acc)
	})

	subFS, _ := fs.Sub(staticFS, "static")
	fileServer := http.FileServer(http.FS(subFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(subFS, path); err != nil {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})

	log.Println("JMAP PWA BFF v2 démarré sur :8080")
	srv := &http.Server{
		Addr:              ":8080",
		Handler:           securityHeaders(greenMiddleware(mux)),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}

func findAccount(v *crypto.Vault, r *http.Request, id string) (crypto.Account, bool) {
	accounts, _ := v.Load(r)
	for _, a := range accounts {
		if a.ID == id {
			return a, true
		}
	}
	return crypto.Account{}, false
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
