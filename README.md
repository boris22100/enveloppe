# ✉️ Enveloppe

Webmail PWA ultraléger, 100 % **JMAP** (Mail, Contacts JSContact, Calendrier JSCalendar) et multi-serveurs (pensé pour **Stalwart Mail Server**).

## Déploiement rapide (Docker Compose)

1. Télécharger `docker-compose.yml` et `.env.example` :
   ```bash
   cp .env.example .env
   sed -i "s/remplace_moi_par_une_chaine_aleatoire_longue/$(openssl rand -hex 32)/" .env
   ```
2. Lancer le conteneur :
   ```bash
   docker compose up -d
   ```
3. Exposer `http://127.0.0.1:8080` en **HTTPS** derrière votre reverse-proxy (requis pour la PWA et les cookies sécurisés).

Image officielle : `ghcr.io/boris22100/enveloppe:latest`
