package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"

	"jmap-pwa/internal/crypto"
)

func (s *Server) findAccount(r *http.Request, id string) (crypto.Account, bool) {
	accounts, _ := s.vault.Load(r)
	for _, a := range accounts {
		if a.ID == id {
			return a, true
		}
	}
	return crypto.Account{}, false
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{
		"version": s.version,
	})
}

func (s *Server) handleListAccounts(w http.ResponseWriter, r *http.Request) {
	accounts, _ := s.vault.Load(r)
	pub := make([]crypto.PublicAccount, 0, len(accounts))
	for _, a := range accounts {
		pub = append(pub, crypto.PublicAccount{
			ID: a.ID, Label: a.Label, Color: a.Color, Host: a.Host, Username: a.Username, AuthType: a.AuthType,
		})
	}
	WriteJSON(w, http.StatusOK, pub)
}

func (s *Server) handleCreateAccount(w http.ResponseWriter, r *http.Request) {
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
	session, err := s.proxy.Discover(payload.Host, payload.Username, payload.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}
	accounts, _ := s.vault.Load(r)
	idBytes := make([]byte, 6)
	_, _ = rand.Read(idBytes)
	newAcc := crypto.Account{
		ID:             hex.EncodeToString(idBytes),
		Label:          payload.Label,
		Color:          payload.Color,
		Host:           s.proxy.NormalizeHost(payload.Host),
		Username:       payload.Username,
		Password:       payload.Password,
		AuthType:       "basic",
		APIUrl:         session.APIUrl,
		DownloadUrl:    session.DownloadUrl,
		UploadUrl:      session.UploadUrl,
		EventSourceUrl: session.EventSourceUrl,
	}
	accounts = append(accounts, newAcc)
	if err := s.vault.Save(w, accounts); err != nil {
		http.Error(w, "erreur sauvegarde cookie", http.StatusInternalServerError)
		return
	}
	WriteJSON(w, http.StatusCreated, crypto.PublicAccount{
		ID: newAcc.ID, Label: newAcc.Label, Color: newAcc.Color, Host: newAcc.Host, Username: newAcc.Username, AuthType: newAcc.AuthType,
	})
}

func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	accounts, _ := s.vault.Load(r)
	filtered := make([]crypto.Account, 0, len(accounts))
	for _, a := range accounts {
		if a.ID != id {
			filtered = append(filtered, a)
		}
	}
	_ = s.vault.Save(w, filtered)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleJMAPSession(w http.ResponseWriter, r *http.Request) {
	acc, ok := s.findAccount(r, r.PathValue("id"))
	if !ok {
		http.Error(w, "compte introuvable", http.StatusNotFound)
		return
	}
	session, err := s.proxy.DiscoverWithAccount(w, r, &acc)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	WriteJSON(w, http.StatusOK, session)
}

func (s *Server) handleJMAPAPI(w http.ResponseWriter, r *http.Request) {
	acc, ok := s.findAccount(r, r.PathValue("id"))
	if !ok {
		http.Error(w, "compte introuvable", http.StatusNotFound)
		return
	}
	s.proxy.ForwardAPI(w, r, acc)
}

func (s *Server) handleJMAPUpload(w http.ResponseWriter, r *http.Request) {
	acc, ok := s.findAccount(r, r.PathValue("id"))
	if !ok {
		http.Error(w, "compte introuvable", http.StatusNotFound)
		return
	}
	s.proxy.ForwardUpload(w, r, acc, r.PathValue("accountId"))
}

func (s *Server) handleJMAPDownload(w http.ResponseWriter, r *http.Request) {
	acc, ok := s.findAccount(r, r.PathValue("id"))
	if !ok {
		http.Error(w, "compte introuvable", http.StatusNotFound)
		return
	}
	mime := r.URL.Query().Get("type")
	if mime == "" {
		mime = "application/octet-stream"
	}
	s.proxy.ForwardDownload(w, r, acc, r.PathValue("accountId"), r.PathValue("blobId"), r.PathValue("name"), mime)
}

func (s *Server) handleJMAPEvents(w http.ResponseWriter, r *http.Request) {
	acc, ok := s.findAccount(r, r.PathValue("id"))
	if !ok {
		http.Error(w, "compte introuvable", http.StatusNotFound)
		return
	}
	s.proxy.ForwardEvents(w, r, acc)
}

func (s *Server) handleSecurityPassword(w http.ResponseWriter, r *http.Request) {
	acc, ok := s.findAccount(r, r.PathValue("id"))
	if !ok {
		http.Error(w, "compte introuvable", http.StatusNotFound)
		return
	}
	s.proxy.ForwardStalwartAPI(w, r, acc, "/api/account/password")
}

func (s *Server) handleSecurityAppPasswords(w http.ResponseWriter, r *http.Request) {
	acc, ok := s.findAccount(r, r.PathValue("id"))
	if !ok {
		http.Error(w, "compte introuvable", http.StatusNotFound)
		return
	}
	s.proxy.ForwardStalwartAPI(w, r, acc, "/api/account/auth")
}

func (s *Server) handleSecurityDeleteAppPassword(w http.ResponseWriter, r *http.Request) {
	acc, ok := s.findAccount(r, r.PathValue("id"))
	if !ok {
		http.Error(w, "compte introuvable", http.StatusNotFound)
		return
	}
	s.proxy.ForwardStalwartAPI(w, r, acc, "/api/account/auth/"+r.PathValue("keyId"))
}

func (s *Server) handleStaticSPA(w http.ResponseWriter, r *http.Request) {
	fileServer := http.FileServer(http.FS(s.staticFS))
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "index.html"
	}
	if _, err := fs.Stat(s.staticFS, path); err != nil {
		r.URL.Path = "/"
	}
	fileServer.ServeHTTP(w, r)
}
