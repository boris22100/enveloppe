package main

import (
	"compress/gzip"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"jmap-pwa/internal/crypto"
	"jmap-pwa/internal/jmap"
)

//go:embed all:static
var staticFS embed.FS

const oidcTxCookie = "enveloppe_oidc_tx"

type oidcTransaction struct {
	State         string `json:"state"`
	Verifier      string `json:"verifier"`
	Host          string `json:"host"`
	Label         string `json:"label"`
	Color         string `json:"color"`
	TokenEndpoint string `json:"tokenEndpoint"`
	ClientID      string `json:"clientId"`
	RedirectURI   string `json:"redirectUri"`
}

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
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		next.ServeHTTP(w, r)
	})
}

func resolveBaseURL(r *http.Request) string {
	if pub := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_APP_URL")), "/"); pub != "" {
		return pub
	}
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		proto = "https"
	}
	return proto + "://" + r.Host
}

func resolveRedirectURI(r *http.Request) string {
	return resolveBaseURL(r) + "/api/auth/oidc/callback"
}

func resolveOIDCClientID(r *http.Request) string {
	if cid := strings.TrimSpace(os.Getenv("OIDC_CLIENT_ID")); cid != "" {
		return cid
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("OIDC_USE_CIMD")), "true") {
		base := resolveBaseURL(r)
		if strings.HasPrefix(base, "https://") {
			return base + "/oauth-client.json"
		}
	}
	return "enveloppe"
}

func main() {
	secret := os.Getenv("SESSION_SECRET")
	if len(secret) < 16 {
		log.Fatal("SESSION_SECRET doit contenir au moins 16 caractères")
	}
	publicAppURL := os.Getenv("PUBLIC_APP_URL")
	secureCookie := strings.HasPrefix(publicAppURL, "https://") || publicAppURL == ""
	oidcClientSecret := strings.TrimSpace(os.Getenv("OIDC_CLIENT_SECRET"))
	oidcIssuer := strings.TrimSpace(os.Getenv("OIDC_ISSUER"))

	vault, err := crypto.NewVault(secret, secureCookie)
	if err != nil {
		log.Fatal(err)
	}
	proxy := jmap.NewProxy(os.Getenv("ALLOWED_JMAP_SERVERS"), oidcIssuer, vault, oidcClientSecret)
	subFS, _ := fs.Sub(staticFS, "static")
	mux := http.NewServeMux()

	// Client ID Metadata Document (CIMD) pour pré-enregistrement OAuth automatique sur Stalwart
	mux.HandleFunc("GET /oauth-client.json", func(w http.ResponseWriter, r *http.Request) {
		base := resolveBaseURL(r)
		meta := map[string]any{
			"client_id":                  base + "/oauth-client.json",
			"client_name":                "Enveloppe",
			"client_uri":                 base,
			"redirect_uris":              []string{base + "/api/auth/oidc/callback"},
			"grant_types":                []string{"authorization_code", "refresh_token"},
			"response_types":             []string{"code"},
			"token_endpoint_auth_method": "none",
		}
		if _, err := fs.Stat(subFS, "icon-192.png"); err == nil {
			meta["logo_uri"] = base + "/icon-192.png"
		}
		writeJSON(w, http.StatusOK, meta)
	})

	// Auto-découverte OIDC à partir de l'URL du serveur
	mux.HandleFunc("GET /api/auth/oidc/discover", func(w http.ResponseWriter, r *http.Request) {
		host := r.URL.Query().Get("host")
		cfg, err := proxy.DiscoverOIDC(host)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"supported": false})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"supported": true,
			"issuer":    cfg.Issuer,
			"cimd":      cfg.ClientIDMetadataDocumentSupport,
		})
	})

	// Démarrage du flux Authorization Code + PKCE
	mux.HandleFunc("GET /api/auth/oidc/start", func(w http.ResponseWriter, r *http.Request) {
		host := proxy.NormalizeHost(r.URL.Query().Get("host"))
		label := strings.TrimSpace(r.URL.Query().Get("label"))
		color := strings.TrimSpace(r.URL.Query().Get("color"))
		if color == "" {
			color = "#48B17F"
		}

		cfg, err := proxy.DiscoverOIDC(host)
		if err != nil {
			http.Redirect(w, r, "/?oidc_error="+url.QueryEscape(err.Error()), http.StatusFound)
			return
		}

		verifier, challenge, err := jmap.GeneratePKCE()
		if err != nil {
			http.Error(w, "erreur PKCE", http.StatusInternalServerError)
			return
		}
		state, err := jmap.RandomState()
		if err != nil {
			http.Error(w, "erreur state", http.StatusInternalServerError)
			return
		}

		clientID := resolveOIDCClientID(r)
		redirectURI := resolveRedirectURI(r)
		tx := oidcTransaction{
			State:         state,
			Verifier:      verifier,
			Host:          host,
			Label:         label,
			Color:         color,
			TokenEndpoint: cfg.TokenEndpoint,
			ClientID:      clientID,
			RedirectURI:   redirectURI,
		}
		sealed, err := vault.SealJSON(tx)
		if err != nil {
			http.Error(w, "erreur chiffrement OIDC", http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     oidcTxCookie,
			Value:    sealed,
			Path:     "/",
			HttpOnly: true,
			Secure:   vault.Secure(),
			SameSite: http.SameSiteLaxMode,
			MaxAge:   600,
		})

		authURL := jmap.BuildOIDCAuthURL(cfg, clientID, redirectURI, state, challenge)
		http.Redirect(w, r, authURL, http.StatusFound)
	})

	// Callback OIDC depuis Stalwart
	mux.HandleFunc("GET /api/auth/oidc/callback", func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{
			Name:     oidcTxCookie,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   vault.Secure(),
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})

		if errParam := r.URL.Query().Get("error"); errParam != "" {
			desc := r.URL.Query().Get("error_description")
			if desc == "" {
				desc = errParam
			}
			http.Redirect(w, r, "/?oidc_error="+url.QueryEscape(desc), http.StatusFound)
			return
		}

		c, err := r.Cookie(oidcTxCookie)
		if err != nil {
			http.Redirect(w, r, "/?oidc_error="+url.QueryEscape("session OIDC expirée"), http.StatusFound)
			return
		}
		var tx oidcTransaction
		if err := vault.OpenJSON(c.Value, &tx); err != nil {
			http.Redirect(w, r, "/?oidc_error="+url.QueryEscape("transaction OIDC invalide"), http.StatusFound)
			return
		}

		state := r.URL.Query().Get("state")
		code := r.URL.Query().Get("code")
		if tx.State == "" || tx.State != state || code == "" {
			http.Redirect(w, r, "/?oidc_error="+url.QueryEscape("vérification state OIDC échouée"), http.StatusFound)
			return
		}

		tok, err := proxy.ExchangeCode(tx.TokenEndpoint, tx.ClientID, oidcClientSecret, code, tx.RedirectURI, tx.Verifier)
		if err != nil {
			http.Redirect(w, r, "/?oidc_error="+url.QueryEscape(err.Error()), http.StatusFound)
			return
		}

		expiresAt := time.Now().Unix() + 3600
		if tok.ExpiresIn > 0 {
			expiresAt = time.Now().Unix() + tok.ExpiresIn
		}

		idBytes := make([]byte, 6)
		_, _ = rand.Read(idBytes)

		newAcc := crypto.Account{
			ID:            hex.EncodeToString(idBytes),
			Label:         tx.Label,
			Color:         tx.Color,
			Host:          tx.Host,
			AuthType:      "oidc",
			AccessToken:   tok.AccessToken,
			RefreshToken:  tok.RefreshToken,
			TokenEndpoint: tx.TokenEndpoint,
			ClientID:      tx.ClientID,
			ExpiresAt:     expiresAt,
		}

		session, err := proxy.DiscoverWithAccount(nil, nil, &newAcc)
		if err != nil {
			http.Redirect(w, r, "/?oidc_error="+url.QueryEscape(err.Error()), http.StatusFound)
			return
		}

		username := session.Username
		if username == "" {
			username = jmap.ExtractUsernameFromIDToken(tok.IDToken)
		}
		if username == "" {
			username = "Compte OIDC"
		}
		newAcc.Username = username
		if newAcc.Label == "" {
			newAcc.Label = username
		}
		newAcc.APIUrl = session.APIUrl
		newAcc.DownloadUrl = session.DownloadUrl
		newAcc.UploadUrl = session.UploadUrl
		newAcc.EventSourceUrl = session.EventSourceUrl

		accounts, _ := vault.Load(r)
		accounts = append(accounts, newAcc)
		if err := vault.Save(w, accounts); err != nil {
			http.Redirect(w, r, "/?oidc_error="+url.QueryEscape("erreur sauvegarde session"), http.StatusFound)
			return
		}

		http.Redirect(w, r, "/", http.StatusFound)
	})

	mux.HandleFunc("GET /api/accounts", func(w http.ResponseWriter, r *http.Request) {
		accounts, _ := vault.Load(r)
		pub := make([]crypto.PublicAccount, 0, len(accounts))
		for _, a := range accounts {
			pub = append(pub, crypto.PublicAccount{
				ID: a.ID, Label: a.Label, Color: a.Color, Host: a.Host, Username: a.Username, AuthType: a.AuthType,
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
			Host:           proxy.NormalizeHost(payload.Host),
			Username:       payload.Username,
			Password:       payload.Password,
			AuthType:       "basic",
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
			ID: newAcc.ID, Label: newAcc.Label, Color: newAcc.Color, Host: newAcc.Host, Username: newAcc.Username, AuthType: newAcc.AuthType,
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
		session, err := proxy.DiscoverWithAccount(w, r, &acc)
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
		if !ok {
			http.Error(w, "compte introuvable", http.StatusNotFound)
			return
		}
		proxy.ForwardStalwartAPI(w, r, acc, "/api/account/password")
	})
	mux.HandleFunc("GET /api/security/{id}/app-passwords", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok {
			http.Error(w, "compte introuvable", http.StatusNotFound)
			return
		}
		proxy.ForwardStalwartAPI(w, r, acc, "/api/account/auth")
	})
	mux.HandleFunc("POST /api/security/{id}/app-passwords", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok {
			http.Error(w, "compte introuvable", http.StatusNotFound)
			return
		}
		proxy.ForwardStalwartAPI(w, r, acc, "/api/account/auth")
	})
	mux.HandleFunc("DELETE /api/security/{id}/app-passwords/{keyId}", func(w http.ResponseWriter, r *http.Request) {
		acc, ok := findAccount(vault, r, r.PathValue("id"))
		if !ok {
			http.Error(w, "compte introuvable", http.StatusNotFound)
			return
		}
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

	log.Println("Enveloppe BFF démarré sur :8080")
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
