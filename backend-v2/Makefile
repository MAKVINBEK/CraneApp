.PHONY: test build migrate

test:
	GOCACHE=/tmp/crane-go-cache go test ./...

build:
	GOCACHE=/tmp/crane-go-cache go build ./cmd/edge ./cmd/auth ./cmd/user ./cmd/chat ./cmd/migrate-legacy

migrate:
	for migration in migrations/*.sql; do psql "$${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "$$migration"; done

migrate-legacy-dry-run:
	GOCACHE=/tmp/crane-go-cache go run ./cmd/migrate-legacy

migrate-legacy:
	GOCACHE=/tmp/crane-go-cache go run ./cmd/migrate-legacy --apply
