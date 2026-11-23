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
	Password       string `json:"password,omitempty"`
	APIUrl         string `json:"apiUrl"`
	DownloadUrl    string `json:"downloadUrl"`
	UploadUrl      string `json:"uploadUrl"`
	EventSourceUrl string `json:"eventSourceUrl"`
	AuthType       string `json:"authType,omitempty"`
	AccessToken    string `json:"accessToken,omitempty"`
	RefreshToken   string `json:"refreshToken,omitempty"`
	TokenEndpoint  string `json:"tokenEndpoint,omitempty"`
	ClientID       string `json:"clientId,omitempty"`
	ExpiresAt      int64  `json:"expiresAt,omitempty"`
}

type PublicAccount struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Color    string `json:"color"`
	Host     string `json:"host"`
	Username string `json:"username"`
	AuthType string `json:"authType,omitempty"`
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

func (v *Vault) SealJSON(payload any) (string, error) {
	plain, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, v.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := v.gcm.Seal(nonce, nonce, plain, nil)
	return base64.RawURLEncoding.EncodeToString(sealed), nil
}

func (v *Vault) OpenJSON(encoded string, dst any) error {
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil || len(raw) < v.gcm.NonceSize() {
		return errors.New("données chiffrées invalides")
	}
	nonce, ciphertext := raw[:v.gcm.NonceSize()], raw[v.gcm.NonceSize():]
	plain, err := v.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return errors.New("échec déchiffrement")
	}
	return json.Unmarshal(plain, dst)
}

func (v *Vault) Load(r *http.Request) ([]Account, error) {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return []Account{}, nil
	}
	var accounts []Account
	if err := v.OpenJSON(c.Value, &accounts); err != nil {
		return nil, err
	}
	return accounts, nil
}

func (v *Vault) Save(w http.ResponseWriter, accounts []Account) error {
	sealed, err := v.SealJSON(accounts)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    sealed,
		Path:     "/",
		HttpOnly: true,
		Secure:   v.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400 * 30,
	})
	return nil
}

func (v *Vault) UpdateAccount(w http.ResponseWriter, r *http.Request, updated Account) error {
	accounts, err := v.Load(r)
	if err != nil {
		return err
	}
	for i := range accounts {
		if accounts[i].ID == updated.ID {
			accounts[i] = updated
			return v.Save(w, accounts)
		}
	}
	return nil
}

func (v *Vault) Secure() bool {
	return v.secure
}
