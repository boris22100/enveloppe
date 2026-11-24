package jmap

import "testing"

func TestIsSafeExternalURL(t *testing.T) {
	p := &Proxy{allowAll: true}

	if !p.IsSafeExternalURL("https://example.com/resource") {
		t.Fatalf("expected valid https URL to be allowed when allowAll is true")
	}
	if p.IsSafeExternalURL("http://127.0.0.1:8080/admin") {
		t.Fatalf("expected loopback URL to be blocked")
	}
	if p.IsSafeExternalURL("http://169.254.169.254/latest/meta-data") {
		t.Fatalf("expected link-local metadata URL to be blocked")
	}
	if p.IsSafeExternalURL("file:///etc/passwd") {
		t.Fatalf("expected file scheme to be blocked")
	}

	restricted := &Proxy{
		allowAll:       false,
		allowedServers: map[string]bool{"jmap.example.org": true},
	}
	if !restricted.IsSafeExternalURL("https://jmap.example.org/api") {
		t.Fatalf("expected allowlisted server to be allowed")
	}
	if restricted.IsSafeExternalURL("https://untrusted.example.org/api") {
		t.Fatalf("expected non-allowlisted server to be blocked")
	}
}
