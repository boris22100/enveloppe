package httpapi_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"jmap-pwa/internal/crypto"
	"jmap-pwa/internal/httpapi"
	"jmap-pwa/internal/jmap"
)

func newTestServer(t *testing.T) (http.Handler, *crypto.Vault) {
	t.Helper()
	vault, err := crypto.NewVault("test-secret-key-for-httpapi", false)
	if err != nil {
		t.Fatalf("NewVault: %v", err)
	}
	staticFS := fstest.MapFS{
		"index.html": {Data: []byte("<!doctype html><html><body>Enveloppe</body></html>")},
	}
	handler := httpapi.NewHandler(httpapi.Config{
		Vault:    vault,
		Proxy:    jmap.NewProxy("*", "", vault, ""),
		StaticFS: staticFS,
		Version:  "0.8.7-test",
	})
	return handler, vault
}

func TestVersionEndpoint(t *testing.T) {
	h, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body["version"] != "0.8.7-test" {
		t.Fatalf("version = %q, want %q", body["version"], "0.8.7-test")
	}
}

func TestListAccountsEmptyAndInvalidCreatePayload(t *testing.T) {
	h, _ := newTestServer(t)

	listReq := httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	listRec := httptest.NewRecorder()
	h.ServeHTTP(listRec, listReq)

	if listRec.Code != http.StatusOK {
		t.Fatalf("GET /api/accounts status = %d, want %d", listRec.Code, http.StatusOK)
	}
	var accounts []crypto.PublicAccount
	if err := json.Unmarshal(listRec.Body.Bytes(), &accounts); err != nil {
		t.Fatalf("unmarshal accounts: %v", err)
	}
	if len(accounts) != 0 {
		t.Fatalf("got %d accounts, want 0", len(accounts))
	}

	badReq := httptest.NewRequest(http.MethodPost, "/api/accounts", bytes.NewBufferString("{invalid-json"))
	badRec := httptest.NewRecorder()
	h.ServeHTTP(badRec, badReq)

	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("POST /api/accounts invalid JSON status = %d, want %d", badRec.Code, http.StatusBadRequest)
	}
}

func TestDeleteAccountWithSealedVaultCookie(t *testing.T) {
	h, vault := newTestServer(t)

	cookieRec := httptest.NewRecorder()
	err := vault.Save(cookieRec, []crypto.Account{
		{ID: "acc-1", Label: "Perso", Username: "boris@mallach.fr", Host: "https://mail.mallach.fr"},
		{ID: "acc-2", Label: "Pro", Username: "admin@mallach.fr", Host: "https://mail.mallach.fr"},
	})
	if err != nil {
		t.Fatalf("vault.Save: %v", err)
	}
	setCookie := cookieRec.Header().Get("Set-Cookie")
	if setCookie == "" {
		t.Fatal("expected Set-Cookie header from vault.Save")
	}

	delReq := httptest.NewRequest(http.MethodDelete, "/api/accounts/acc-1", nil)
	delReq.Header.Set("Cookie", setCookie)
	delRec := httptest.NewRecorder()
	h.ServeHTTP(delRec, delReq)

	if delRec.Code != http.StatusNoContent {
		t.Fatalf("DELETE /api/accounts/acc-1 status = %d, want %d", delRec.Code, http.StatusNoContent)
	}
}

func TestStaticSPAFallback(t *testing.T) {
	h, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/unknown-route", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("SPA fallback status = %d, want %d", rec.Code, http.StatusOK)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("Enveloppe")) {
		t.Fatalf("unexpected SPA body: %q", rec.Body.String())
	}
}

func TestLogoutAndUnauthenticatedJmapSession(t *testing.T) {
	h, _ := newTestServer(t)

	logoutReq := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	logoutRec := httptest.NewRecorder()
	h.ServeHTTP(logoutRec, logoutReq)
	if logoutRec.Code != http.StatusOK && logoutRec.Code != http.StatusNoContent {
		t.Fatalf("unexpected logout status: %d", logoutRec.Code)
	}

	sessReq := httptest.NewRequest(http.MethodGet, "/api/jmap/session", nil)
	sessRec := httptest.NewRecorder()
	h.ServeHTTP(sessRec, sessReq)
	if sessRec.Code == http.StatusInternalServerError {
		t.Fatalf("unexpected 500 on unauthenticated session request")
	}
}
