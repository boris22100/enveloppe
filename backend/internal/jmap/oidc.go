package jmap

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
)

type OIDCConfig struct {
	Issuer                          string   `json:"issuer"`
	AuthorizationEndpoint           string   `json:"authorization_endpoint"`
	TokenEndpoint                   string   `json:"token_endpoint"`
	ScopesSupported                 []string `json:"scopes_supported"`
	ClientIDMetadataDocumentSupport bool     `json:"client_id_metadata_document_supported"`
}

type OIDCTokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int64  `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
	Scope        string `json:"scope"`
}

func (p *Proxy) NormalizeHost(raw string) string {
	h := strings.TrimSpace(raw)
	if h == "" {
		return ""
	}
	if !strings.HasPrefix(h, "http://") && !strings.HasPrefix(h, "https://") {
		h = "https://" + h
	}
	return strings.TrimRight(h, "/")
}

func (p *Proxy) validateOIDCEndpoint(rawURL string) bool {
	if !p.IsSafeExternalURL(rawURL) {
		return false
	}
	u, err := url.Parse(rawURL)
	return err == nil && u.Scheme == "https"
}

func (p *Proxy) DiscoverOIDC(rawHost string) (*OIDCConfig, error) {
	host := p.NormalizeHost(rawHost)
	if p.oidcIssuer != "" {
		host = p.oidcIssuer
	}
	if !p.IsSafeExternalURL(host) {
		return nil, errors.New("serveur non autorisé")
	}
	issuerBase := host
	if p.oidcIssuer != "" {
		if !p.IsSafeExternalURL(p.oidcIssuer) {
			return nil, errors.New("issuer OIDC non autorisé")
		}
		issuerBase = p.oidcIssuer
	}
	endpoint := issuerBase + "/.well-known/openid-configuration"
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("OIDC non disponible sur ce serveur")
	}
	var cfg OIDCConfig
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&cfg); err != nil {
		return nil, err
	}
	if !p.validateOIDCEndpoint(cfg.AuthorizationEndpoint) || !p.validateOIDCEndpoint(cfg.TokenEndpoint) {
		return nil, errors.New("endpoints OIDC invalides ou non sécurisés")
	}
	return &cfg, nil
}

func GeneratePKCE() (string, string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	verifier := base64.RawURLEncoding.EncodeToString(buf)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	return verifier, challenge, nil
}

func RandomState() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func BuildOIDCAuthURL(cfg *OIDCConfig, clientID, redirectURI, state, challenge string) string {
	scopes := []string{"openid"}
	if len(cfg.ScopesSupported) > 0 {
		for _, s := range cfg.ScopesSupported {
			low := strings.ToLower(s)
			if s == "openid" {
				continue
			}
			if s == "profile" || s == "email" || s == "offline_access" ||
				strings.Contains(low, "mail") || strings.Contains(low, "contact") ||
				strings.Contains(low, "calendar") || strings.Contains(low, "jmap") {
				scopes = append(scopes, s)
			}
		}
	} else {
		scopes = append(scopes, "profile", "email", "offline_access")
	}

	u, _ := url.Parse(cfg.AuthorizationEndpoint)
	q := u.Query()
	q.Set("response_type", "code")
	q.Set("client_id", clientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("scope", strings.Join(scopes, " "))
	q.Set("state", state)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")
	u.RawQuery = q.Encode()
	return u.String()
}

func (p *Proxy) ExchangeCode(tokenEndpoint, clientID, clientSecret, code, redirectURI, verifier string) (*OIDCTokenResponse, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("client_id", clientID)
	form.Set("code_verifier", verifier)
	if clientSecret != "" {
		form.Set("client_secret", clientSecret)
	}
	return p.postTokenForm(tokenEndpoint, form)
}

func (p *Proxy) RefreshOIDCToken(tokenEndpoint, clientID, clientSecret, refreshToken string) (*OIDCTokenResponse, error) {
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", clientID)
	if clientSecret != "" {
		form.Set("client_secret", clientSecret)
	}
	return p.postTokenForm(tokenEndpoint, form)
}

func (p *Proxy) postTokenForm(tokenEndpoint string, form url.Values) (*OIDCTokenResponse, error) {
	if !p.validateOIDCEndpoint(tokenEndpoint) {
		return nil, errors.New("token_endpoint OIDC non autorisé")
	}
	req, err := http.NewRequest(http.MethodPost, tokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("échec échange token OIDC (" + resp.Status + ")")
	}
	var tok OIDCTokenResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&tok); err != nil {
		return nil, err
	}
	if tok.AccessToken == "" {
		return nil, errors.New("access_token manquant dans la réponse OIDC")
	}
	return &tok, nil
}

func ExtractUsernameFromIDToken(idToken string) string {
	parts := strings.Split(idToken, ".")
	if len(parts) < 2 {
		return ""
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}
	var claims struct {
		Email             string `json:"email"`
		PreferredUsername string `json:"preferred_username"`
		Sub               string `json:"sub"`
	}
	if err := json.Unmarshal(raw, &claims); err != nil {
		return ""
	}
	if claims.Email != "" {
		return claims.Email
	}
	if claims.PreferredUsername != "" {
		return claims.PreferredUsername
	}
	return claims.Sub
}
