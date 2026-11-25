package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"jmap-pwa/internal/crypto"
	"jmap-pwa/internal/httpapi"
	"jmap-pwa/internal/jmap"
)

//go:embed all:static
var staticFS embed.FS

var appVersion = "0.8.5"

func resolveVersion() string {
	if v := strings.TrimSpace(os.Getenv("APP_VERSION")); v != "" {
		return v
	}
	return appVersion
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

	handler := httpapi.NewHandler(httpapi.Config{
		Vault:            vault,
		Proxy:            proxy,
		StaticFS:         subFS,
		OIDCClientSecret: oidcClientSecret,
		Version:          resolveVersion(),
	})

	log.Println("Enveloppe BFF démarré sur :8080")
	srv := &http.Server{
		Addr:              ":8080",
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
