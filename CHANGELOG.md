# Changelog

Toutes les évolutions notables d'**Enveloppe** sont documentées dans ce fichier.
Le format s'inspire de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet suit le [Gestionnaire sémantique de versions](https://semver.org/lang/fr/).

## [0.10.4] - 2026-11-28

### Fixed
- **Injection dynamique de version (`APP_VERSION`)** : transmission systématique de `APP_VERSION` aux étapes de build Frontend (Vite) et Backend (Go `-ldflags`) dans le `Dockerfile` et `.github/workflows/docker.yml`, éliminant l'affichage `vdev`.

## [0.10.3] - 2026-11-28

### Added
- **Thème clair/sombre par message (`MailReader.svelte`)** : sélecteur *Auto / Clair / Sombre* dans l'en-tête du lecteur, appliqué aussi bien au contenu HTML sandboxé qu'au corps texte brut (`<pre>`).
- **Tests E2E Playwright (`frontend/e2e/critical-flows.spec.ts`)** : couverture des parcours critiques (messagerie + thème, calendrier, résilience hors-ligne / retour en ligne) exécutée face au binaire Go.

### Changed
- **TypeScript strict (`tsconfig.json`)** : activation du mode `strict` avec validation `svelte-check` (0 erreur, 0 warning), `tsc --noEmit` et `Vitest` (34 tests).

## [0.10.0] - 2026-11-27

### Added
- **Gouvernance pré-1.0** : création de `CHANGELOG.md`, formalisation du périmètre fonctionnel 1.0 (**100 % français**), de la matrice de support (Go, Node, navigateurs, Stalwart) et d'une section dédiée aux **limites connues et compromis de sécurité** dans `README.md` et le Wiki.

### Changed
- **Documentation & badges** : remplacement des sections empilées de versions et des badges de compteurs ponctuels dans `README.md` par des badges dynamiques liés à la CI/CD et aux releases GitHub.

## [0.9.4] - 2026-11-27

### Changed
- **Injection dynamique de version** : résolution dynamique de `APP_VERSION` (tag Git ou `frontend/package.json`) dans `.github/workflows/docker.yml`, transmission via `ARG APP_VERSION` et `-ldflags "-X main.appVersion=..."` dans le `Dockerfile`, et alignement des fallbacks (`0.9.4`).

## [0.9.3] - 2026-11-27

### Added
- **Tests d'intégration Go (`httptest`)** : couverture de `/api/jmap/session` avec cookie chiffré et serveur JMAP simulé, ainsi que `/api/auth/oidc/config` dans `backend/internal/httpapi/handlers_test.go`.
- **Budget bundle CI** : vérification automatique de la taille de `frontend/dist` (`<= 1500 KiB`) dans `.github/workflows/docker.yml`.

## [0.9.2] - 2026-11-27

### Added
- **Outbox hors-ligne persistante (`frontend/src/lib/outbox.ts`)** : mise en file d'attente des envois lorsque le réseau est indisponible, rejeu ordonné automatique au retour en ligne (`online`) et badge d'état hors-ligne / Outbox.
- **Barre d'actions flottante** : accès rapide en bas d'écran (*Archiver*, désélection `✕`) lors de la sélection multiple de messages.

## [0.9.1] - 2026-11-27

### Added
- **Mise à jour de contacts JSContact** : implémentation de `updateContact` via JMAP `ContactCard/set` (`update`) avec repli REST dans `frontend/src/lib/jmap/contacts.ts`.
- **Suggestions de destinataires** : autocomplétion `<datalist id="compose-to-suggestions">` dans le compositeur à partir des expéditeurs connus.

## [0.9.0] - 2026-11-27

### Added
- **Fils de discussion (`threadHelpers.ts`)** : ciblage automatique du dernier message non lu (`pickReplyTargetId`) lors d'une réponse et cumul des pièces jointes (`countThreadAttachments`).
- **Création d'événements récurrents (`CalendarView.svelte`)** : sélecteur de récurrence (*Aucune*, *Quotidienne*, *Hebdomadaire*, *Mensuelle*, *Annuelle*) et durée en minutes (`PTnM`).

## [0.8.0 - 0.8.9] - 2026-11

### Added
- **Architecture Backend modulaire** : découpage de `backend/main.go` en `internal/httpapi` (`router.go`, `handlers.go`, `middleware.go`, `oidc.go`) et blocage SSRF des adresses privées RFC 1918 (`ip.IsPrivate()`).
- **Messagerie & PWA avancées** : *Undo Send* avec délai d'annulation, brouillons automatiques JMAP avec debounce, images inline `cid:`, actions groupées, éditeur hybride de filtres **Sieve (RFC 9661)** et changement de mot de passe Stalwart.
- **Calendrier JSCalendar complet** : vues *Mois / Semaine / Jour*, glisser-déposer, édition complète d'événements, bannières d'invitation `.ics` interactives et bascule rapide des tâches (`done` / `todo`).
