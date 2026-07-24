package main

import (
	"database/sql"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func TestReadLegacyMediaDataURL(t *testing.T) {
	row := legacyMediaRow{
		id:       "media-id",
		data:     sql.NullString{String: "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("png-data")), Valid: true},
		mimeType: sql.NullString{String: "application/octet-stream", Valid: true},
	}

	data, contentType, err := readLegacyMedia(row, "")
	if err != nil {
		t.Fatalf("readLegacyMedia returned error: %v", err)
	}
	if string(data) != "png-data" {
		t.Fatalf("unexpected data %q", string(data))
	}
	if contentType != "image/png" {
		t.Fatalf("unexpected content type %q", contentType)
	}
}

func TestReadLegacyEncryptedCiphertext(t *testing.T) {
	row := legacyMediaRow{
		id:        "media-id",
		data:      sql.NullString{String: base64.StdEncoding.EncodeToString([]byte("ciphertext")), Valid: true},
		mimeType:  sql.NullString{String: "image/webp", Valid: true},
		encrypted: true,
	}

	data, contentType, err := readLegacyMedia(row, "")
	if err != nil {
		t.Fatalf("readLegacyMedia returned error: %v", err)
	}
	if string(data) != "ciphertext" {
		t.Fatalf("unexpected data %q", string(data))
	}
	if contentType != "image/webp" {
		t.Fatalf("unexpected content type %q", contentType)
	}
}

func TestReadLegacyMediaFile(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "media", "legacy.png")
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("file-data"), 0o600); err != nil {
		t.Fatal(err)
	}

	row := legacyMediaRow{
		id:      "media-id",
		fileURL: sql.NullString{String: "/uploads/media/legacy.png", Valid: true},
	}
	data, contentType, err := readLegacyMedia(row, root)
	if err != nil {
		t.Fatalf("readLegacyMedia returned error: %v", err)
	}
	if string(data) != "file-data" {
		t.Fatalf("unexpected data %q", string(data))
	}
	if contentType != "image/png" {
		t.Fatalf("unexpected content type %q", contentType)
	}
}

func TestReadLegacyMediaRejectsTraversal(t *testing.T) {
	row := legacyMediaRow{
		id:      "media-id",
		fileURL: sql.NullString{String: "/uploads/../secret", Valid: true},
	}
	if _, _, err := readLegacyMedia(row, t.TempDir()); err == nil {
		t.Fatal("expected traversal path to be rejected")
	}
}

func TestLegacyObjectKeyIsDeterministic(t *testing.T) {
	row := legacyMediaRow{id: "media-id", uploaderID: "user-id"}
	got := legacyObjectKey(row, "photo.png")
	want := "legacy/user-id/media-id.png"
	if got != want {
		t.Fatalf("legacyObjectKey() = %q, want %q", got, want)
	}
}
