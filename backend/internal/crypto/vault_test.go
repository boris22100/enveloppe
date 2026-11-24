package crypto

import (
	"strings"
	"testing"
)

func TestVaultSealAndOpenRoundTrip(t *testing.T) {
	v, err := NewVault("a-reasonably-strong-test-secret", true)
	if err != nil {
		t.Fatalf("NewVault failed: %v", err)
	}

	type sample struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	}
	in := sample{ID: "acc-1", Email: "boris@mallach.fr"}

	token, err := v.SealJSON(in)
	if err != nil {
		t.Fatalf("SealJSON failed: %v", err)
	}
	if token == "" {
		t.Fatalf("expected non-empty sealed token")
	}

	var out sample
	if err := v.OpenJSON(token, &out); err != nil {
		t.Fatalf("OpenJSON failed: %v", err)
	}
	if out != in {
		t.Fatalf("expected %+v, got %+v", in, out)
	}
}

func TestVaultCorruptedCookieAndShortSecrets(t *testing.T) {
	v, err := NewVault("short", false)
	if err != nil {
		t.Fatalf("NewVault with short secret failed: %v", err)
	}

	token, err := v.SealJSON(map[string]string{"k": "v"})
	if err != nil {
		t.Fatalf("SealJSON with short secret failed: %v", err)
	}

	var dst map[string]string
	if err := v.OpenJSON(token, &dst); err != nil {
		t.Fatalf("OpenJSON round-trip with short secret failed: %v", err)
	}
	if dst["k"] != "v" {
		t.Fatalf("expected value 'v', got %q", dst["k"])
	}

	// Données corrompues / tronquées / altérées
	for _, bad := range []string{"", "not-valid-base64!!!", "YWJj", token[:len(token)-2] + "AA"} {
		if bad == token {
			continue
		}
		var out map[string]string
		if err := v.OpenJSON(bad, &out); err == nil {
			t.Fatalf("expected error for corrupted token %q", bad)
		}
	}

	// Déchiffrement avec un autre secret doit échouer
	vOther, err := NewVault("another-secret-key", false)
	if err != nil {
		t.Fatalf("NewVault failed: %v", err)
	}
	var out map[string]string
	if err := vOther.OpenJSON(token, &out); err == nil || !strings.Contains(err.Error(), "déchiffrement") {
		t.Fatalf("expected decryption error with wrong secret, got %v", err)
	}
}
