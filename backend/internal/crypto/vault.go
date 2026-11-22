package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

const CookieName = "jmap_vault"

type Account struct {
	ID             string `json:"id"`
	Label          string `json:"label"`
	Color          string `json:"color"`
	Host           string `json:"host"`
	Username       string `json:"username"`
	Password       string `json:"password"`
	APIUrl         string `json:"apiUrl"`
	DownloadUrl    string `json:"downloadUrl"`
	UploadUrl      string `json:"uploadUrl"`
	EventSourceUrl string `json:"eventSourceUrl"`
}

type PublicAccount struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Color    string `json:"color"`
	Host     string `json:"host"`
	Username string `json:"username"`
}

type Vault struct {
	gcm    cipher.AEAD
	secure bool
}

func NewVault(secret string, secureCookie bool) (*Vault, error) {
	key := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Vault{gcm: gcm, secure: secureCookie}, nil
}

func (v *Vault) Load(r *http.Request) ([]Account, error) {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return []Account{}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(c.Value)
	if err != nil || len(raw) < v.gcm.NonceSize() {
		return nil, errors.New("cookie invalide")
	}
	nonce, ciphertext := raw[:v.gcm.NonceSize()], raw[v.gcm.NonceSize():]
	plain, err := v.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, errors.New("échec déchiffrement vault")
	}
	var accounts []Account
	if err := json.Unmarshal(plain, &accounts); err != nil {
		return nil, err
	}
	return accounts, nil
}

func (v *Vault) Save(w http.ResponseWriter, accounts []Account) error {
	plain, err := json.Marshal(accounts)
	if err != nil {
		return err
	}
	nonce := make([]byte, v.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}
	sealed := v.gcm.Seal(nonce, nonce, plain, nil)
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    base64.RawURLEncoding.EncodeToString(sealed),
		Path:     "/",
		HttpOnly: true,
		Secure:   v.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400 * 30,
	})
	return nil
}
