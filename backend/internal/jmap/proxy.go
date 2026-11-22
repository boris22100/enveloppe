package jmap

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
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

type Proxy struct {
	client         *http.Client
	sseClient      *http.Client
	allowedServers map[string]bool
	allowAll       bool
}

func NewProxy(allowedCSV string) *Proxy {
	redirectFn := func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("trop de redirections")
		}
		if auth := via[0].Header.Get("Authorization"); auth != "" {
			req.Header.Set("Authorization", auth)
		}
		return nil
	}
	p := &Proxy{
		allowedServers: make(map[string]bool),
		client:         &http.Client{Timeout: 30 * time.Second, CheckRedirect: redirectFn},
		sseClient:      &http.Client{Timeout: 0, CheckRedirect: redirectFn},
	}
	if strings.TrimSpace(allowedCSV) == "" || strings.TrimSpace(allowedCSV) == "*" {
		p.allowAll = true
	} else {
		for _, host := range strings.Split(allowedCSV, ",") {
			p.allowedServers[strings.ToLower(strings.TrimSpace(host))] = true
		}
	}
	return p
}

func (p *Proxy) IsHostAllowed(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return false
	}
	if p.allowAll {
		return true
	}
	return p.allowedServers[strings.ToLower(u.Hostname())]
}

func (p *Proxy) Discover(host, username, password string) (*SessionResponse, error) {
	if !p.IsHostAllowed(host) {
		return nil, errors.New("serveur JMAP non autorisé")
	}
	endpoint := strings.TrimRight(host, "/") + "/.well-known/jmap"
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(username, password)
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
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return nil, err
	}
	return &session, nil
}

func (p *Proxy) ForwardAPI(w http.ResponseWriter, r *http.Request, acc crypto.Account) {
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, acc.APIUrl, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	req.SetBasicAuth(acc.Username, acc.Password)
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, "erreur réseau JMAP", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	log.Printf("[Stalwart API] %s %s -> %d", r.Method, req.URL.String(), resp.StatusCode)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (p *Proxy) ForwardUpload(w http.ResponseWriter, r *http.Request, acc crypto.Account, jmapAccountId string) {
	target := strings.ReplaceAll(acc.UploadUrl, "{accountId}", url.PathEscape(jmapAccountId))
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	req.SetBasicAuth(acc.Username, acc.Password)
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
	log.Printf("[Stalwart API] %s %s -> %d", r.Method, req.URL.String(), resp.StatusCode)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (p *Proxy) ForwardDownload(w http.ResponseWriter, r *http.Request, acc crypto.Account, jmapAccountId, blobId, name, mimeType string) {
	target := acc.DownloadUrl
	target = strings.ReplaceAll(target, "{accountId}", url.PathEscape(jmapAccountId))
	target = strings.ReplaceAll(target, "{blobId}", url.PathEscape(blobId))
	target = strings.ReplaceAll(target, "{name}", url.PathEscape(name))
	target = strings.ReplaceAll(target, "{type}", url.PathEscape(mimeType))

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	req.SetBasicAuth(acc.Username, acc.Password)
	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, "erreur download JMAP", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	log.Printf("[Stalwart API] %s %s -> %d", r.Method, req.URL.String(), resp.StatusCode)
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

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	req.SetBasicAuth(acc.Username, acc.Password)
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

// ForwardStalwartAPI relaie les appels REST de gestion de compte/sécurité vers Stalwart
func (p *Proxy) ForwardStalwartAPI(w http.ResponseWriter, r *http.Request, acc crypto.Account, targetPath string) {
	target := strings.TrimRight(acc.Host, "/") + targetPath
	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	req.SetBasicAuth(acc.Username, acc.Password)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		http.Error(w, "erreur réseau vers API Stalwart", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	log.Printf("[Stalwart API] %s %s -> %d", r.Method, req.URL.String(), resp.StatusCode)
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
