package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	cryptoclient "craneapp/backend-v2/internal/platform/crypto"
	"github.com/lib/pq"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUsernameTaken      = errors.New("username already exists")
)

type User struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	FirstName    string `json:"firstName"`
	LastName     string `json:"lastName"`
	Bio          string `json:"bio"`
	AvatarUrl    string `json:"avatarUrl"`
	PasswordHash string `json:"-"`
}

type Service struct {
	db     *sql.DB
	crypto *cryptoclient.Client
}

func NewService(db *sql.DB, crypto *cryptoclient.Client) *Service {
	return &Service{db: db, crypto: crypto}
}

func (s *Service) Register(ctx context.Context, username, password, firstName, lastName, language string) (User, string, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	hash, err := s.crypto.HashPassword(ctx, password)
	if err != nil {
		return User{}, "", err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, "", err
	}
	defer tx.Rollback()

	var user User
	err = tx.QueryRowContext(ctx, `
		INSERT INTO auth.users (username, password_hash, first_name, last_name)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text, username, first_name, last_name
	`, username, hash, strings.TrimSpace(firstName), strings.TrimSpace(lastName)).Scan(
		&user.ID, &user.Username, &user.FirstName, &user.LastName,
	)
	if err != nil {
		var postgresError *pq.Error
		if errors.As(err, &postgresError) && postgresError.Constraint == "auth_users_username_key" {
			return User{}, "", ErrUsernameTaken
		}
		return User{}, "", err
	}

	user.Bio = ""
	user.AvatarUrl = ""

	_, err = tx.ExecContext(ctx, `
		INSERT INTO users.profiles (user_id, first_name, last_name, bio, avatar_url)
		VALUES ($1, $2, $3, '', '')
	`, user.ID, user.FirstName, user.LastName)
	if err != nil {
		return User{}, "", err
	}

	lang := language
	if lang == "" {
		lang = "ru"
	}
	langJSON, _ := json.Marshal(lang)
	defaultSettings := `{"theme":"dark","notifications":true,"sounds":true,"language":` + string(langJSON) + `}`

	_, err = tx.ExecContext(ctx, `
		INSERT INTO users.settings (user_id, settings, privacy_settings, notification_settings, sound_settings, storage_settings, advanced_settings, folders)
		VALUES ($1, $2, '{"lastSeen":"all","phoneVisibility":"contacts","photoVisibility":"all","messagesFromStrangers":true,"groupsAdd":"all","twoFactorAuth":false,"autoDeleteAccount":true}', '{"privateChats":true,"groups":true,"channels":true,"calls":true,"videoCalls":true,"inAppNotifications":true,"messagePreview":true,"readReceipts":false,"reactions":true,"newContacts":true}', '{"notificationsVolume":80,"mediaVolume":100,"notificationsSound":true,"messagesSound":true,"sendSound":true,"callsSound":true,"vibrateOnCall":true,"notificationSound":"default","messageSound":"default","ringtone":"default"}', '{"autoDownloadMobile":true,"autoDownloadWifi":true,"autoDownloadRoaming":false,"deleteMediaAfter":"never"}', '{"autoReconnect":true,"fastConnection":true,"connectionType":"auto","dataCompression":true,"saveDrafts":true,"analytics":false,"developerMode":false,"debugLog":false,"hardwareAcceleration":true,"autoplayGifs":true}', '[]')
	`, user.ID, defaultSettings)
	if err != nil {
		return User{}, "", err
	}

	if err := tx.Commit(); err != nil {
		return User{}, "", err
	}

	token, err := s.crypto.IssueToken(ctx, user.ID, user.Username)
	return user, token, err
}

func (s *Service) Login(ctx context.Context, username, password string) (User, string, error) {
	var user User
	err := s.db.QueryRowContext(ctx, `
		SELECT u.id::text, u.username, u.first_name, u.last_name, u.password_hash,
		       COALESCE(p.bio, ''), COALESCE(p.avatar_url, '')
		FROM auth.users u
		LEFT JOIN users.profiles p ON p.user_id = u.id
		WHERE u.username = $1 AND u.disabled_at IS NULL
	`, strings.ToLower(strings.TrimSpace(username))).Scan(
		&user.ID, &user.Username, &user.FirstName, &user.LastName, &user.PasswordHash,
		&user.Bio, &user.AvatarUrl,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, "", ErrInvalidCredentials
	}
	if err != nil {
		return User{}, "", err
	}

	valid, err := s.crypto.VerifyPassword(ctx, password, user.PasswordHash)
	if err != nil {
		return User{}, "", err
	}
	if !valid {
		return User{}, "", ErrInvalidCredentials
	}

	token, err := s.crypto.IssueToken(ctx, user.ID, user.Username)
	return user, token, err
}

func (s *Service) SavePublicKey(ctx context.Context, userID, publicKey string) error {
	publicKey = strings.TrimSpace(publicKey)
	if publicKey == "" {
		return errors.New("public key is required")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO auth.public_keys (user_id, public_key, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (user_id) DO UPDATE SET public_key = EXCLUDED.public_key, updated_at = NOW()
	`, userID, publicKey)
	return err
}
