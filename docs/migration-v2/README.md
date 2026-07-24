# Backend v2 Migration

`backend-v2` is the replacement backend. It is intentionally isolated from the
legacy Node gateway until the single production cutover.

## Implemented vertical slice

- `edge`: public `/api/v2` routing and common HTTP response policy.
- `auth`: registration and login with ownership of the `auth` PostgreSQL schema.
- `user`: profile, user search, settings, privacy, and blocked users.
- `chat`: private/group chats, members, per-user pin/archive/read state.
- `crypto-rust`: Argon2id password hashing, signed short-lived access tokens,
  AES-256-GCM envelope encryption, and transition MLS artifact validation.
- OpenAPI v2 and Protobuf contract sources.
- Docker Compose and Kubernetes foundation.

The current internal crypto transport is HTTP and is isolated by Kubernetes
NetworkPolicy. Replace it with generated gRPC stubs and mTLS before production;
`contracts/proto/crypto.proto` is the source contract for that step.

## Local start

1. Start PostgreSQL, NATS, Redis, MinIO, crypto, auth, and edge:
   `docker compose -f infrastructure/docker/docker-compose.v2.yml up --build`.
2. Apply all SQL files in `backend-v2/migrations` to PostgreSQL.
3. Use the public API at `http://localhost:8080/api/v2`.

Before a cutover, run `make migrate-legacy-dry-run` from `backend-v2`. The
command uses a serializable transaction, verifies row counts, and always rolls
back unless `--apply` is explicitly passed.

### Legacy media migration

The `media` migration domain transfers:

- embedded `public.media_files.data` payloads to MinIO while preserving media
  UUIDs in `media.uploads`;
- file-backed legacy uploads when `LEGACY_UPLOADS_DIR` points to the legacy
  `uploads` directory;
- GIFs and favorite GIF relations;
- sticker packs and stickers;
- message media links from legacy `/uploads/...` URLs to
  `/api/v2/media/{preserved-uuid}` when a matching `media_files` row exists.

Dry-run validates embedded base64 and local file availability without writing
objects:

```sh
go run ./cmd/migrate-legacy --domain media
```

Applying media migration requires `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`,
`MINIO_SECRET_KEY`, `MINIO_REGION`, and `MEDIA_BUCKET`. Development defaults
match the local Compose stack. If any legacy row stores only `file_url`, also
set `LEGACY_UPLOADS_DIR`:

```sh
LEGACY_UPLOADS_DIR=/absolute/path/to/CraneApp/uploads \
  go run ./cmd/migrate-legacy --domain media --apply
```

The migration uses deterministic object keys
`legacy/{user-id}/{media-id}.{ext}`. Retries overwrite the same object instead
of creating duplicates. Database changes remain transactional; object storage
is not transactional, so a failed database commit can leave deterministic
objects that a retry safely replaces.

### Single-container Amvera cutover

`Dockerfile.prod` includes both `migrate` and `migrate-legacy`. On the first
start, the entrypoint applies v2 schema migrations, starts a temporary MinIO,
runs the complete legacy migration, and writes the persistent marker:

```text
/data/.legacy-v2-migration-complete
```

`RUN_LEGACY_MIGRATION=true` is the production-image default. Later container
restarts skip the legacy migration while the marker exists. A fresh
installation without `public` legacy tables is detected automatically and
continues without an error. The flag can still be set to `false` when legacy
migration is intentionally managed by a separate job.

Database-embedded media needs no filesystem preparation. If legacy
`media_files` rows contain only `/uploads/...` URLs, copy the old uploads tree
to `/data/legacy-uploads` before the first cutover start or set
`LEGACY_UPLOADS_DIR` to its persistent location. The deployment intentionally
fails instead of silently losing a referenced file.

## Required migration order

1. Add message, realtime, call, media, and support/admin services.
2. Add transactional outbox and NATS JetStream event consumers.
3. Implement the legacy-to-v2 migration tool while preserving UUIDs.
4. Generate the React API client from `contracts/openapi/api-v2.yaml`.
5. Run full migration rehearsals and load tests before enabling maintenance mode.

The Node backend remains the production source of truth until every client-used
feature has an API v2 implementation and the cutover checklist passes.
