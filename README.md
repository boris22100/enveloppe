# <img src="frontend/public/pwa-192.png" alt="Enveloppe" width="32" align="absmiddle" /> Enveloppe

[![CI/CD](https://github.com/boris22100/enveloppe/actions/workflows/docker.yml/badge.svg?style=flat-square)](https://github.com/boris22100/enveloppe/actions/workflows/docker.yml) [![Release](https://img.shields.io/github/v/release/boris22100/enveloppe?include_prereleases&style=flat-square&color=48B17F)](https://github.com/boris22100/enveloppe/releases) [![Docker](https://img.shields.io/badge/docker-ghcr.io-0D3A4D?style=flat-square)](https://github.com/boris22100/enveloppe/pkgs/container/enveloppe) [![Go](https://img.shields.io/badge/Go-1.26-00ADD8?style=flat-square)](backend/go.mod) [![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?style=flat-square)](frontend/package.json) [![License](https://img.shields.io/badge/license-MIT-0D3A4D?style=flat-square)](LICENSE)

Webmail **PWA** ultraléger, moderne, **100 % français** et **100 % JMAP** (*Mail, Contacts JSContact, Calendrier JSCalendar*), conçu pour **Stalwart Mail Server** et compatible multi-serveurs.

> 📖 **Documentation complète** : consultez le **[Wiki Enveloppe](https://github.com/boris22100/enveloppe/wiki)** (guides d'[installation](https://github.com/boris22100/enveloppe/wiki/Installation), [configuration](https://github.com/boris22100/enveloppe/wiki/Configuration), [utilisation](https://github.com/boris22100/enveloppe/wiki/Utilisation)) ainsi que le **[CHANGELOG](CHANGELOG.md)**.

---

## 🎯 Périmètre de la version 1.0

- **Interface 100 % française** : choix de périmètre assumé pour la v1.0 afin de garantir une terminologie homogène (messagerie, calendrier JSCalendar, filtres Sieve) et un bundle minimaliste sans surcoût i18n. Les contributions de localisation pourront être envisagées après la 1.0.
- **Périmètre fonctionnel figé** : messagerie JMAP complète (fils de discussion, brouillons auto, *Undo Send*, Outbox hors-ligne, pièces jointes et images `cid:`), contacts JSContact, calendrier JSCalendar (vues Mois/Semaine/Jour, récurrences, invitations `.ics`, tâches), filtres Sieve (RFC 9661) et authentification OIDC PKCE / CIMD ou mot de passe d'application.

---

## ✨ Fonctionnalités

- **Connexion OIDC / SSO automatique (PKCE & CIMD)** : découverte automatique via `/.well-known/openid-configuration`, support **Authorization Code + PKCE (`S256`)** avec rafraîchissement transparent des jetons, support **CIMD** (`/oauth-client.json`) et connexion classique par mot de passe d'application en secours.
- **Messagerie JMAP complète** : gestion des dossiers et sous-dossiers, menus contextuels (*Archiver, Supprimer, Lu/Non lu, Favori, Spam, Déplacer vers, Exporter en `.eml`, Imprimer*), actions groupées avec barre flottante, regroupement par fil (`threadId`), brouillons automatiques, *Undo Send* et file d'attente hors-ligne (`Outbox`).
- **Calendrier (JSCalendar)** : vues *Mois*, *Semaine* et *Jour*, glisser-déposer, création et édition d'événements récurrents, invitations `.ics` interactives, tâches et anniversaires.
- **Contacts (JSContact)** : consultation, création, édition synchronisée (`ContactCard/set`) et autocomplétion des destinataires.
- **Filtres serveur Sieve (JMAP RFC 9661)** : éditeur hybride combinant un constructeur visuel (*Conditions → Actions* + répondeur *Vacances*) et un éditeur de code Sieve avec validation serveur.
- **Sécurité & thèmes** : changement de mot de passe intégré (API Stalwart), trois thèmes harmonisés (*BoWiz*, *Sombre*, *Clair*) et accessibilité clavier/ARIA vérifiée.
- **Expérience PWA** : installable sur desktop et mobile, cache hors-ligne (`IndexedDB` + Service Worker) et notifications Web Push (auto-découverte VAPID).

---

## 📋 Matrice de support

| Composant | Version / Cible supportée | Notes |
| :--- | :--- | :--- |
| **Serveur JMAP** | **Stalwart Mail Server** (recommandé) & serveurs conformes RFC 8620 / 8621 | Extensions optionnelles : JSContact, JSCalendar, JMAP Sieve (RFC 9661), OIDC PKCE/CIMD |
| **Backend BFF** | **Go 1.26+** (compilé en binaire statique Linux `amd64` / `arm64`) | Image Distroless non-root (`read_only: true`), zéro dépendance runtime |
| **Frontend Build** | **Node.js 22 LTS**, Svelte 5, Vite, TypeScript | Bundle statique embarqué directement dans le binaire Go (`go:embed`) |
| **Navigateurs cibles** | Chromium / Chrome / Edge, Firefox, Safari (Desktop & Mobile récents) | HTTPS obligatoire pour Service Worker, Web Push et cookies `Secure` |

---

## 🌱 Sobriété & Green-IT

- **Image Docker minimale** : ~10 Mo (binaire Go statique sur `gcr.io/distroless/static-debian12:nonroot`, multi-arch `linux/amd64` & `linux/arm64`).
- **Empreinte runtime** : ~10 MiB de RAM et ~0 % CPU au repos, assets `dist/` ~413 Ko (budget CI strictement plafonné à 2 MiB).
- **Réseau optimisé** : compression Gzip native, cache immuable (`max-age=31536000, immutable`) sur les assets versionnés et requêtes JMAP groupées.

---

## 🏗️ Architecture & Persistance

Enveloppe repose sur un **BFF (Backend-for-Frontend) en Go** qui sert l'interface **Svelte 5** et proxyfie les appels JMAP vers votre serveur de messagerie.

- **Backend 100 % *stateless*** : aucun volume Docker requis, exécution en lecture seule (`read_only: true`).
- **Données persistantes** : emails, dossiers, contacts, calendriers et scripts Sieve restent exclusivement sur votre serveur JMAP. Tant que `SESSION_SECRET` est conservé, les sessions survivent aux redémarrages.
- **Cache local** : préférences, brouillons/outbox et cache de lecture stockés dans le navigateur (`localStorage` + `IndexedDB`).

---

## 🚀 Déploiement rapide (Docker Compose)

### 1. Récupérer les fichiers

```bash
mkdir enveloppe && cd enveloppe
curl -O [https://raw.githubusercontent.com/boris22100/enveloppe/main/docker-compose.yml](https://raw.githubusercontent.com/boris22100/enveloppe/main/docker-compose.yml)
curl -O [https://raw.githubusercontent.com/boris22100/enveloppe/main/.env.example](https://raw.githubusercontent.com/boris22100/enveloppe/main/.env.example)
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
sed -i "s/remplace_moi_par_une_chaine_aleatoire_longue/$(openssl rand -hex 32)/" .env
```

Éditez `.env` pour adapter votre configuration :

| Variable | Description | Exemple / Défaut |
| :--- | :--- | :--- |
| `PUBLIC_APP_URL` | URL HTTPS publique de votre instance | `[https://webmail.mondomaine.fr](https://webmail.mondomaine.fr)` |
| `SESSION_SECRET` | Clé secrète (64 caractères hex) pour chiffrer les cookies de session en AES-GCM | *(générée via `openssl rand -hex 32`)* |
| `ALLOWED_JMAP_SERVERS` | Domaines JMAP autorisés (`*` pour tous, ou liste séparée par des virgules) | `mail.mondomaine.fr` |
| `OIDC_USE_CIMD` | *(Optionnel)* Utilise l'URL `https://<PUBLIC_APP_URL>/oauth-client.json` comme `client_id` (CIMD) | `false` *(défaut)* |
| `OIDC_CLIENT_ID` | *(Optionnel)* Identifiant d'un client OAuth2 déclaré manuellement dans Stalwart (prioritaire sur CIMD) | `enveloppe` *(défaut)* |
| `OIDC_CLIENT_SECRET` | *(Optionnel)* Secret client uniquement pour un client confidentiel (inutile en PKCE public) | *(vide par défaut)* |

### 3. Activer la connexion OIDC dans Stalwart (Optionnel)

#### Option A — Automatique via CIMD (sans créer de client)
1. Dans `.env`, ajoutez `OIDC_USE_CIMD=true`.
2. Dans Stalwart (**Settings → OAuth2 → Client Registration**), passez **Client ID Metadata Documents** sur **`Same domain only`** (si Enveloppe et Stalwart partagent le même domaine racine) ou **`Any HTTPS URL`**.
3. *(Optionnel, pour retirer le badge « Unverified application » et afficher votre logo)* : dans **Settings → OAuth2 → Create OAuth client**, pré-enregistrez `https://<votre-domaine>/oauth-client.json` comme **Client ID**, renseignez `Enveloppe` dans **Description**, ajoutez un logo en `data:image/...`, la Redirect URI `https://<votre-domaine>/api/auth/oidc/callback` et les scopes **Mail**, **Contacts**, **Calendars**.

#### Option B — Client OAuth classique
1. Laissez `OIDC_USE_CIMD` désactivé (le `client_id` par défaut est `enveloppe`).
2. Dans Stalwart (**Settings → OAuth2 → Create OAuth client**) :
   - **Client ID** : `enveloppe` (laissez **Client Secret** vide pour PKCE public) et **Description** : `Enveloppe`.
   - **Redirect URIs** : `https://<votre-domaine>/api/auth/oidc/callback` (puis cliquez sur `+`).
   - **Allowed Scopes** : cochez **Mail**, **Contacts** et **Calendars**.
   - **Allowed Grant Types** : laissez cochés **Authorization code** et **Refresh token**.

### 4. Lancer le conteneur

```bash
docker compose up -d
```

L'application écoute sur le port `8080` du conteneur (mappé sur `8089` par défaut dans `docker-compose.yml`). Exposez-la impérativement en **HTTPS** afin d'activer les cookies `Secure`, OIDC et l'installation PWA.

> **Note SSO (Pangolin, Authelia, Authentik...)** : si vous placez Enveloppe derrière un portail SSO, autorisez l'accès public à `/manifest.webmanifest` (et à `/oauth-client.json` si vous utilisez CIMD) afin que le navigateur et Stalwart puissent les lire sans blocage.

### Mise à jour

```bash
docker compose pull && docker compose up -d
```

---

## 🛡️ Sécurité, CI/CD & Limites connues

### Mesures intégrées
- **Sessions chiffrées** : identifiants ou jetons OAuth2 (`access_token` / `refresh_token`) stockés uniquement dans un cookie chiffré en **AES-GCM** côté client (`HttpOnly`, `Secure`, `SameSite=Lax`).
- **Isolation du conteneur** : image Distroless sans shell, utilisateur non-root, système de fichiers `read_only: true`, `no-new-privileges:true`.
- **Durcissement HTTP & Anti-SSRF** : `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, blocage des plages IP privées RFC 1918 (`ip.IsPrivate()`) sur le proxy et non-propagation du header `Authorization` sur redirection cross-domain.
- **Pipeline CI/CD automatisé** : `go vet`, `go test -race`, `govulncheck`, `svelte-check`, `tsc --noEmit`, `Vitest`, contrôle des budgets Green IT (`dist/` et taille image Docker), audit Lighthouse Accessibility (`>= 90 %`) et scan Trivy (`CRITICAL`/`HIGH` bloquants).

### Limites connues & compromis assumés (v1.0)
- **Cookie de session *stateless* (30 jours)** : le BFF ne conservant aucune base de données serveur, la révocation côté serveur avant expiration du cookie passe par la rotation de `SESSION_SECRET` ou la révocation du jeton OAuth2 dans Stalwart.
- **Liste blanche JMAP par défaut (`ALLOWED_JMAP_SERVERS=*`)** : activée par défaut pour faciliter l'usage multi-serveurs dès le premier démarrage ; en production mono-serveur, restreignez explicitement cette variable à votre domaine (`mail.mondomaine.fr`).
- **File d'attente hors-ligne (`Outbox`) *best-effort*** : stockée dans `localStorage` et rejouée séquentiellement au retour de la connexion (`online`), sans garantie transactionnelle ni persistance des pièces jointes lourdes entre rechargements hors-ligne.
- **Interface uniquement en français** : aucune bascule multilingue intégrée en v1.0.

---

## 📦 Image officielle

```text
ghcr.io/boris22100/enveloppe:latest
```

## 📄 Licence

Distribué sous licence **MIT**. Voir `LICENSE` pour plus d'informations.
