package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"jmap-pwa/internal/crypto"
	"jmap-pwa/internal/jmap"
)

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

func (s *Server) handleOAuthClientJSON(w http.ResponseWriter, r *http.Request) {
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
	if _, err := fs.Stat(s.staticFS, "icon-192.png"); err == nil {
		meta["logo_uri"] = base + "/icon-192.png"
	}
	WriteJSON(w, http.StatusOK, meta)
}

func (s *Server) handleOIDCDiscover(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	cfg, err := s.proxy.DiscoverOIDC(host)
	if err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{"supported": false})
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"supported": true,
		"issuer":    cfg.Issuer,
		"cimd":      cfg.ClientIDMetadataDocumentSupport,
	})
}

func (s *Server) handleOIDCStart(w http.ResponseWriter, r *http.Request) {
	host := s.proxy.NormalizeHost(r.URL.Query().Get("host"))
	label := strings.TrimSpace(r.URL.Query().Get("label"))
	color := strings.TrimSpace(r.URL.Query().Get("color"))
	if color == "" {
		color = "#48B17F"
	}

	cfg, err := s.proxy.DiscoverOIDC(host)
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
	sealed, err := s.vault.SealJSON(tx)
	if err != nil {
		http.Error(w, "erreur chiffrement OIDC", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     oidcTxCookie,
		Value:    sealed,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.vault.Secure(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   600,
	})

	authURL := jmap.BuildOIDCAuthURL(cfg, clientID, redirectURI, state, challenge)
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (s *Server) handleOIDCCallback(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     oidcTxCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   s.vault.Secure(),
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
	if err := s.vault.OpenJSON(c.Value, &tx); err != nil {
		http.Redirect(w, r, "/?oidc_error="+url.QueryEscape("transaction OIDC invalide"), http.StatusFound)
		return
	}

	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	if tx.State == "" || tx.State != state || code == "" {
		http.Redirect(w, r, "/?oidc_error="+url.QueryEscape("vérification state OIDC échouée"), http.StatusFound)
		return
	}

	tok, err := s.proxy.ExchangeCode(tx.TokenEndpoint, tx.ClientID, s.oidcClientSecret, code, tx.RedirectURI, tx.Verifier)
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

	session, err := s.proxy.DiscoverWithAccount(nil, nil, &newAcc)
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

	accounts, _ := s.vault.Load(r)
	accounts = append(accounts, newAcc)
	if err := s.vault.Save(w, accounts); err != nil {
		http.Redirect(w, r, "/?oidc_error="+url.QueryEscape("erreur sauvegarde session"), http.StatusFound)
		return
	}

	http.Redirect(w, r, "/", http.StatusFound)
}
