# Étape 1 : Build Frontend (Svelte 5 + PWA)
FROM node:22-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Étape 2 : Build Backend Go (avec embed du frontend)
FROM golang:1.23-alpine AS backend-builder
WORKDIR /build
COPY backend/ ./
COPY --from=frontend-builder /build/dist ./static
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /jmap-pwa .

# Étape 3 : Image finale minimale (~12 Mo)
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend-builder /jmap-pwa /jmap-pwa
EXPOSE 8080
ENTRYPOINT ["/jmap-pwa"]
