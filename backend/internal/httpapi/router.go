package httpapi

import (
	"io/fs"
	"net/http"

	"jmap-pwa/internal/crypto"
	"jmap-pwa/internal/jmap"
)

type Config struct {
	Vault            *crypto.Vault
	Proxy            *jmap.Proxy
	StaticFS         fs.FS
	OIDCClientSecret string
	Version          string
}

type Server struct {
	vault            *crypto.Vault
	proxy            *jmap.Proxy
	staticFS         fs.FS
	oidcClientSecret string
	version          string
}

func NewHandler(cfg Config) http.Handler {
	version := cfg.Version
	if version == "" {
		version = "0.8.0"
	}
	s := &Server{
		vault:            cfg.Vault,
		proxy:            cfg.Proxy,
		staticFS:         cfg.StaticFS,
		oidcClientSecret: cfg.OIDCClientSecret,
		version:          version,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/version", s.handleVersion)
	mux.HandleFunc("GET /oauth-client.json", s.handleOAuthClientJSON)
	mux.HandleFunc("GET /api/auth/oidc/discover", s.handleOIDCDiscover)
	mux.HandleFunc("GET /api/auth/oidc/start", s.handleOIDCStart)
	mux.HandleFunc("GET /api/auth/oidc/callback", s.handleOIDCCallback)

	mux.HandleFunc("GET /api/accounts", s.handleListAccounts)
	mux.HandleFunc("POST /api/accounts", s.handleCreateAccount)
	mux.HandleFunc("DELETE /api/accounts/{id}", s.handleDeleteAccount)

	mux.HandleFunc("GET /api/jmap/{id}/session", s.handleJMAPSession)
	mux.HandleFunc("POST /api/jmap/{id}/api", s.handleJMAPAPI)
	mux.HandleFunc("POST /api/jmap/{id}/upload/{accountId}", s.handleJMAPUpload)
	mux.HandleFunc("GET /api/jmap/{id}/download/{accountId}/{blobId}/{name}", s.handleJMAPDownload)
	mux.HandleFunc("GET /api/jmap/{id}/events", s.handleJMAPEvents)

	mux.HandleFunc("POST /api/security/{id}/password", s.handleSecurityPassword)
	mux.HandleFunc("GET /api/security/{id}/app-passwords", s.handleSecurityAppPasswords)
	mux.HandleFunc("POST /api/security/{id}/app-passwords", s.handleSecurityAppPasswords)
	mux.HandleFunc("DELETE /api/security/{id}/app-passwords/{keyId}", s.handleSecurityDeleteAppPassword)

	mux.HandleFunc("/", s.handleStaticSPA)

	return SecurityHeaders(GreenMiddleware(mux))
}
