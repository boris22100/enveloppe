package main

import (
	"crypto/rand"
	"encoding/base64"
)

// GenerateCSPNonce génère un nonce aléatoire base64 pour durcir script-src en v0.7.0.
func GenerateCSPNonce() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
