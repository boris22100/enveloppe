package jmap

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"jmap-pwa/internal/crypto"
)

type SessionResponse struct {
	APIUrl          string            `json:"apiUrl"`
	DownloadUrl     string            `json:"downloadUrl"`
	UploadUrl       string            `json:"uploadUrl"`
	EventSourceUrl  string            `json:"eventSourceUrl"`
	PrimaryAccounts map[string]string `json:"primaryAccounts"`
	Capabilities    map[string]any    `json:"capabilities"`
	Username        string            `json:"username"`
}

type cachedRefresh struct {
	acc         crypto.Account
	cachedUntil time.Time
}

type Proxy struct {
	client         *http.Client
	sseClient      *http.Client
	allowedServers map[string]bool
	allowAll       bool
	oidcIssuer     string
	vault          *crypto.Vault
	clientSecret   string
	oidcIssuer     string
	refreshMu      sync.Mutex
	refreshedCache map[string]cachedRefresh
}

func NewProxy(allowedCSV, oidcIssuer string, vault *crypto.Vault, clientSecret string) *Proxy {
	p := &Proxy{
		allowedServers: make(map[string]bool),
		vault:          vault,
		clientSecret:   clientSecret,
		refreshedCache: make(map[string]cachedRefresh),
	}
	if strings.TrimSpace(allowedCSV) == "" || strings.TrimSpace(allowedCSV) == "*" {
		p.allowAll = true
	} else {
		for _, host := range strings.Split(allowedCSV, ",") {
			p.allowedServers[strings.ToLower(strings.TrimSpace(host))] = true
		}
	}
	if iss := strings.TrimSpace(oidcIssuer); iss != "" {
		p.oidcIssuer = p.NormalizeHost(iss)
		if u, err := url.Parse(p.oidcIssuer); err == nil && u.Hostname() != "" {
			p.allowedServers[strings.ToLower(u.Hostname())] = true
		}
	}

	redirectFn := func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("trop de redirections")
		}
		if !p.IsSafeExternalURL(req.URL.String()) {
			return errors.New("redirection vers cible non autorisée")
		}
		if req.URL.Host == via[0].URL.Host && req.URL.Scheme == via[0].URL.Scheme {
			if auth := via[0].Header.Get("Authorization"); auth != "" {
				req.Header.Set("Authorization", auth)
			}
		}
		return nil
	}

	p.client = &http.Client{Timeout: 30 * time.Second, CheckRedirect: redirectFn}
	p.sseClient = &http.Client{Timeout: 0, CheckRedirect: redirectFn}
	return p
}

func (p *Proxy) IsSafeExternalURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return false
	}
	hostname := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if hostname == "" || hostname == "localhost" || strings.HasSuffix(hostname, ".localhost") {
		return false
	}
	if ip := net.ParseIP(hostname); ip != nil {
		if ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return false
		}
	}
	if !p.allowAll && !p.allowedServers[hostname] {
		return false
	}
	return true
}

func (p *Proxy) IsHostAllowed(rawURL string) bool {
	return p.IsSafeExternalURL(rawURL)
}

func (p *Proxy) applyAuth(w http.ResponseWriter, r *http.Request, req *http.Request, acc *crypto.Account) error {
	if acc.AuthType == "oidc" {
		if acc.ExpiresAt > 0 && time.Now().Unix() >= acc.ExpiresAt-60 && acc.RefreshToken != "" && acc.TokenEndpoint != "" {
			p.refreshMu.Lock()
			now := time.Now()
			for k, entry := range p.refreshedCache {
				if now.After(entry.cachedUntil) {
					delete(p.refreshedCache, k)
				}
			}
			if cached, ok := p.refreshedCache[acc.RefreshToken]; ok && now.Unix() < cached.acc.ExpiresAt-60 {
				*acc = cached.acc
			} else {
				oldRT := acc.RefreshToken
				tok, err := p.RefreshOIDCToken(acc.TokenEndpoint, acc.ClientID, p.clientSecret, acc.RefreshToken)
				if err != nil {
					p.refreshMu.Unlock()
					return err
				}
				acc.AccessToken = tok.AccessToken
				if tok.RefreshToken != "" {
					acc.RefreshToken = tok.RefreshToken
				}
				if tok.ExpiresIn > 0 {
					acc.ExpiresAt = now.Unix() + tok.ExpiresIn
				} else {
					acc.ExpiresAt = now.Unix() + 3600
				}
				p.refreshedCache[oldRT] = cachedRefresh{
					acc:         *acc,
					cachedUntil: now.Add(2 * time.Minute),
				}
			}
			p.refreshMu.Unlock()

			if w != nil && r != nil && p.vault != nil {
				_ = p.vault.UpdateAccount(w, r, *acc)
			}
		}
		req.Header.Set("Authorization", "Bearer "+acc.AccessToken)
		return nil
	}
	req.SetBasicAuth(acc.Username, acc.Password)
	return nil
}

func (p *Proxy) Discover(host, username, password string) (*SessionResponse, error) {
	acc := crypto.Account{Host: host, Username: username, Password: password}
	return p.DiscoverWithAccount(nil, nil, &acc)
}

func (p *Proxy) DiscoverWithAccount(w http.ResponseWriter, r *http.Request, acc *crypto.Account) (*SessionResponse, error) {
	host := p.NormalizeHost(acc.Host)
	if !p.IsSafeExternalURL(host) {
		return nil, errors.New("serveur JMAP non autorisé")
	}
	endpoint := host + "/.well-known/jmap"
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if err := p.applyAuth(w, r, req, acc); err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("échec auth ou endpoint JMAP introuvable (" + resp.Status + ")")
	}
	var session SessionResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&session); err != nil {
		return nil, err
	}
	return &session, nil
}

func (p *Proxy) ForwardAPI(w http.ResponseWriter, r *http.Request, acc crypto.Account) {
	if !p.IsSafeExternalURL(acc.APIUrl) {
		http.Error(w, "endpoint JMAP non autorisé", http.StatusBadGateway)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, acc.APIUrl, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if err := p.applyAuth(w, r, req, &acc); err != nil {
		http.Error(w, "session OIDC expirée", http.StatusUnauthorized)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, "erreur réseau JMAP", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	log.Printf("[Stalwart API] %q %q -> %d", r.Method, req.URL.Path, resp.StatusCode)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (p *Proxy) ForwardUpload(w http.ResponseWriter, r *http.Request, acc crypto.Account, jmapAccountId string) {
	target := strings.ReplaceAll(acc.UploadUrl, "{accountId}", url.PathEscape(jmapAccountId))
	if !p.IsSafeExternalURL(target) {
		http.Error(w, "endpoint upload non autorisé", http.StatusBadGateway)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if err := p.applyAuth(w, r, req, &acc); err != nil {
		http.Error(w, "session OIDC expirée", http.StatusUnauthorized)
		return
	}
	if ct := r.Header.Get("Content-Type"); ct != "" {
		req.Header.Set("Content-Type", ct)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, "erreur upload JMAP", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	log.Printf("[Stalwart API] %q %q -> %d", r.Method, req.URL.Path, resp.StatusCode)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (p *Proxy) ForwardDownload(w http.ResponseWriter, r *http.Request, acc crypto.Account, jmapAccountId, blobId, name, mimeType string) {
	target := acc.DownloadUrl
	target = strings.ReplaceAll(target, "{accountId}", url.PathEscape(jmapAccountId))
	target = strings.ReplaceAll(target, "{blobId}", url.PathEscape(blobId))
	target = strings.ReplaceAll(target, "{name}", url.PathEscape(name))
	target = strings.ReplaceAll(target, "{type}", url.PathEscape(mimeType))

	if !p.IsSafeExternalURL(target) {
		http.Error(w, "endpoint download non autorisé", http.StatusBadGateway)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if err := p.applyAuth(w, r, req, &acc); err != nil {
		http.Error(w, "session OIDC expirée", http.StatusUnauthorized)
		return
	}
	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, "erreur download JMAP", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	log.Printf("[Stalwart API] %q %q -> %d", r.Method, req.URL.Path, resp.StatusCode)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (p *Proxy) ForwardEvents(w http.ResponseWriter, r *http.Request, acc crypto.Account) {
	flusher, ok := w.(http.Flusher)
	if !ok || acc.EventSourceUrl == "" {
		http.Error(w, "SSE non supporté", http.StatusNotImplemented)
		return
	}
	target := acc.EventSourceUrl
	target = strings.ReplaceAll(target, "{types}", "*")
	target = strings.ReplaceAll(target, "{closeafter}", "no")
	target = strings.ReplaceAll(target, "{ping}", "30")

	if !p.IsSafeExternalURL(target) {
		http.Error(w, "endpoint SSE non autorisé", http.StatusBadGateway)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if err := p.applyAuth(w, r, req, &acc); err != nil {
		http.Error(w, "session OIDC expirée", http.StatusUnauthorized)
		return
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.sseClient.Do(req)
	if err != nil {
		http.Error(w, "erreur connexion SSE", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	buf := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			_, _ = w.Write(buf[:n])
			flusher.Flush()
		}
		if err != nil {
			return
		}
	}
}

func (p *Proxy) ForwardStalwartAPI(w http.ResponseWriter, r *http.Request, acc crypto.Account, targetPath string) {
	target := strings.TrimRight(acc.Host, "/") + targetPath
	if !p.IsSafeExternalURL(target) {
		http.Error(w, "API Stalwart non autorisée", http.StatusBadGateway)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if err := p.applyAuth(w, r, req, &acc); err != nil {
		http.Error(w, "session OIDC expirée", http.StatusUnauthorized)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, "erreur réseau vers API Stalwart", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	log.Printf("[Stalwart API] %q %q -> %d", r.Method, req.URL.Path, resp.StatusCode)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
