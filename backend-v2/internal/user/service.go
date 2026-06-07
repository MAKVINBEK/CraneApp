package user

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

var (
	ErrNotFound       = errors.New("user not found")
	ErrSelfBlock      = errors.New("cannot block yourself")
	ErrAlreadyBlocked = errors.New("user already blocked")
)

type Profile struct {
	ID        string   `json:"id"`
	Username  string   `json:"username"`
	FirstName string   `json:"firstName"`
	LastName  string   `json:"lastName"`
	Bio       string   `json:"bio"`
	AvatarURL string   `json:"avatarUrl"`
	Badges    []string `json:"badges"`
}

type SearchResult struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	AvatarURL string `json:"avatarUrl"`
}

type BlockedUser struct {
	SearchResult
	BlockedAt string `json:"blockedAt"`
}

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

func (s *Service) Me(ctx context.Context, userID string) (Profile, error) {
	profile, err := s.profileByID(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		if err := s.ensureProfile(ctx, userID); err != nil {
			return Profile{}, err
		}
		return s.profileByID(ctx, userID)
	}
	return profile, err
}

func (s *Service) UpdateProfile(ctx context.Context, userID string, firstName, lastName, bio, avatarURL *string) (Profile, error) {
	if err := s.ensureProfile(ctx, userID); err != nil {
		return Profile{}, err
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE users.profiles SET
			first_name = COALESCE(NULLIF($2, ''), first_name),
			last_name = COALESCE($3, last_name),
			bio = COALESCE($4, bio),
			avatar_url = COALESCE($5, avatar_url),
			updated_at = NOW()
		WHERE user_id = $1
	`, userID, stringOrNil(firstName), stringOrNil(lastName), stringOrNil(bio), stringOrNil(avatarURL))
	if err != nil {
		return Profile{}, err
	}
	return s.profileByID(ctx, userID)
}

func (s *Service) Search(ctx context.Context, viewerID, query string) ([]SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []SearchResult{}, nil
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT au.id::text, au.username, COALESCE(up.first_name, au.first_name), COALESCE(up.last_name, au.last_name), COALESCE(up.avatar_url, '')
		FROM auth.users au
		LEFT JOIN users.profiles up ON up.user_id = au.id
		WHERE au.disabled_at IS NULL
		  AND au.id::text != $2
		  AND (au.username ILIKE $1 OR au.first_name ILIKE $1 OR au.last_name ILIKE $1 OR up.bio ILIKE $1)
		ORDER BY au.username
		LIMIT 50
	`, "%"+query+"%", viewerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []SearchResult
	for rows.Next() {
		var user SearchResult
		if err := rows.Scan(&user.ID, &user.Username, &user.FirstName, &user.LastName, &user.AvatarURL); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

func (s *Service) Settings(ctx context.Context, userID string) (map[string]any, map[string]any, error) {
	if err := s.ensureSettings(ctx, userID); err != nil {
		return nil, nil, err
	}
	var settings, privacy map[string]any
	err := s.db.QueryRowContext(ctx, `
		SELECT settings, privacy_settings FROM users.settings WHERE user_id = $1
	`, userID).Scan((*jsonMap)(&settings), (*jsonMap)(&privacy))
	return settings, privacy, err
}

func (s *Service) UpdateSettings(ctx context.Context, userID string, settings map[string]any) (map[string]any, error) {
	if err := s.ensureSettings(ctx, userID); err != nil {
		return nil, err
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE users.settings SET settings = settings || $2::jsonb, updated_at = NOW() WHERE user_id = $1
	`, userID, jsonMap(settings))
	if err != nil {
		return nil, err
	}
	next, _, err := s.Settings(ctx, userID)
	return next, err
}

func (s *Service) UpdatePrivacy(ctx context.Context, userID string, privacy map[string]any) (map[string]any, error) {
	if err := s.ensureSettings(ctx, userID); err != nil {
		return nil, err
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE users.settings SET privacy_settings = privacy_settings || $2::jsonb, updated_at = NOW() WHERE user_id = $1
	`, userID, jsonMap(privacy))
	if err != nil {
		return nil, err
	}
	_, next, err := s.Settings(ctx, userID)
	return next, err
}

func (s *Service) Blocked(ctx context.Context, userID string) ([]BlockedUser, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT au.id::text, au.username, COALESCE(up.first_name, au.first_name), COALESCE(up.last_name, au.last_name),
		       COALESCE(up.avatar_url, ''), bu.blocked_at::text
		FROM users.blocked_users bu
		JOIN auth.users au ON au.id = bu.blocked_user_id
		LEFT JOIN users.profiles up ON up.user_id = au.id
		WHERE bu.user_id = $1
		ORDER BY bu.blocked_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var blocked []BlockedUser
	for rows.Next() {
		var item BlockedUser
		if err := rows.Scan(&item.ID, &item.Username, &item.FirstName, &item.LastName, &item.AvatarURL, &item.BlockedAt); err != nil {
			return nil, err
		}
		blocked = append(blocked, item)
	}
	return blocked, rows.Err()
}

func (s *Service) Block(ctx context.Context, userID, blockedUserID string) error {
	if userID == blockedUserID {
		return ErrSelfBlock
	}
	var exists bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = $1)`, blockedUserID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO users.blocked_users (user_id, blocked_user_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, blocked_user_id) DO NOTHING
	`, userID, blockedUserID)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return ErrAlreadyBlocked
	}
	return nil
}

func (s *Service) Unblock(ctx context.Context, userID, blockedUserID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM users.blocked_users WHERE user_id = $1 AND blocked_user_id = $2`, userID, blockedUserID)
	return err
}

func (s *Service) profileByID(ctx context.Context, userID string) (Profile, error) {
	var profile Profile
	var badges pqStringArray
	err := s.db.QueryRowContext(ctx, `
		SELECT au.id::text, au.username, COALESCE(up.first_name, au.first_name), COALESCE(up.last_name, au.last_name),
		       COALESCE(up.bio, ''), COALESCE(up.avatar_url, ''), COALESCE(up.badges, '{}')
		FROM auth.users au
		LEFT JOIN users.profiles up ON up.user_id = au.id
		WHERE au.id = $1 AND au.disabled_at IS NULL
	`, userID).Scan(&profile.ID, &profile.Username, &profile.FirstName, &profile.LastName, &profile.Bio, &profile.AvatarURL, &badges)
	if errors.Is(err, sql.ErrNoRows) {
		return Profile{}, ErrNotFound
	}
	profile.Badges = []string(badges)
	return profile, err
}

func (s *Service) ensureProfile(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users.profiles (user_id, first_name, last_name)
		SELECT id, first_name, last_name FROM auth.users WHERE id = $1
		ON CONFLICT (user_id) DO NOTHING
	`, userID)
	return err
}

func (s *Service) ensureSettings(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users.settings (user_id) SELECT id FROM auth.users WHERE id = $1 ON CONFLICT (user_id) DO NOTHING
	`, userID)
	return err
}

type Session struct {
	ID          string `json:"id"`
	DeviceName  string `json:"deviceName"`
	DeviceType  string `json:"deviceType"`
	IPAddress   string `json:"ipAddress"`
	Location    string `json:"location"`
	UserAgent   string `json:"userAgent"`
	LastActive  string `json:"lastActive"`
	FirstLogin  string `json:"firstLogin"`
	IsCurrent   bool   `json:"isCurrent"`
}

func (s *Service) RegisterDevice(ctx context.Context, userID, deviceName, deviceType, ipAddress, location, userAgent string) (string, error) {
	var sessionID string
	err := s.db.QueryRowContext(ctx, `SELECT id FROM public.user_sessions WHERE user_id = $1 AND user_agent = $2 LIMIT 1`, userID, userAgent).Scan(&sessionID)
	if err == nil {
		_, _ = s.db.ExecContext(ctx, `UPDATE public.user_sessions SET last_active = NOW(), is_current = TRUE WHERE id = $1`, sessionID)
		_, _ = s.db.ExecContext(ctx, `UPDATE public.user_sessions SET is_current = FALSE WHERE user_id = $1 AND id != $2`, userID, sessionID)
		return sessionID, nil
	}
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO public.user_sessions (id, user_id, device_name, device_type, ip_address, location, user_agent, last_active, first_login, is_current)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW(), TRUE)
		RETURNING id
	`, userID, deviceName, deviceType, ipAddress, location, userAgent).Scan(&sessionID)
	if err != nil {
		return "", err
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE public.user_sessions SET is_current = FALSE WHERE user_id = $1 AND id != $2`, userID, sessionID)
	return sessionID, nil
}

func (s *Service) Devices(ctx context.Context, userID string) ([]Session, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, COALESCE(device_name, ''), COALESCE(device_type, ''), COALESCE(ip_address, ''), COALESCE(location, ''), COALESCE(user_agent, ''), last_active::text, first_login::text, COALESCE(is_current, false)
		FROM public.user_sessions
		WHERE user_id = $1
		ORDER BY last_active DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sessions []Session
	for rows.Next() {
		var sess Session
		if err := rows.Scan(&sess.ID, &sess.DeviceName, &sess.DeviceType, &sess.IPAddress, &sess.Location, &sess.UserAgent, &sess.LastActive, &sess.FirstLogin, &sess.IsCurrent); err != nil {
			return nil, err
		}
		sessions = append(sessions, sess)
	}
	return sessions, rows.Err()
}

func (s *Service) DeleteDevice(ctx context.Context, userID, sessionID string) error {
	var isCurrent bool
	err := s.db.QueryRowContext(ctx, `SELECT is_current FROM public.user_sessions WHERE id = $1 AND user_id = $2`, sessionID, userID).Scan(&isCurrent)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if isCurrent {
		return errors.New("cannot terminate current session")
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM public.user_sessions WHERE id = $1`, sessionID)
	return err
}

func (s *Service) TerminateAllDevices(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM public.user_sessions WHERE user_id = $1 AND is_current = FALSE`, userID)
	return err
}

func stringOrNil(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}
