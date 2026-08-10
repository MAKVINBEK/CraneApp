package chat_test

import (
	"context"
	"craneapp/backend-v2/internal/chat"
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

func TestLeaveChat_Success_memberLeaves(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	// Инициализируем сервис. WSServer пока nil.
	svc := chat.NewService(db, nil)

	// Запросить роль текущего пользователя
	chatID := "550e8400-e29b-41d4-a716-446655440002"
	userID := "550e8400-e29b-41d4-a716-446655440003"
	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(userID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("member"))

	mock.ExpectBegin()
	mock.ExpectExec(`DELETE FROM crypto.chat_encryption_keys WHERE chat_id = $1 AND user_id = $2`).
		WithArgs(chatID, userID).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`DELETE FROM chats.user_chat_settings WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(userID, chatID).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`DELETE FROM chats.members WHERE chat_id=$1 AND user_id=$2 AND role<>'owner'`).
		WithArgs(chatID, userID).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	err = svc.LeaveChat(context.Background(), userID, chatID)
	require.NoError(t, err)
	err = mock.ExpectationsWereMet()
	require.NoError(t, err)
}

func TestLeaveChat_OwnerCannotLeave(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	// Инициализируем сервис. WSServer пока nil.
	svc := chat.NewService(db, nil)
	chatID := "550e8400-e29b-41d4-a716-446655440002"
	userID := "550e8400-e29b-41d4-a716-446655440003"

	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(userID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("owner"))

	err = svc.LeaveChat(context.Background(), userID, chatID)
	require.ErrorIs(t, err, chat.ErrOwnershipTransferRequired)
}

func TestLeaveChat_NotMember(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	// Инициализируем сервис. WSServer пока nil.
	svc := chat.NewService(db, nil)
	chatID := "550e8400-e29b-41d4-a716-446655440002"
	userID := "550e8400-e29b-41d4-a716-446655440003"

	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(userID, chatID).
		WillReturnError(sql.ErrNoRows)

	err = svc.LeaveChat(context.Background(), userID, chatID)
	require.ErrorIs(t, err, chat.ErrForbidden)
}

func TestLeaveChat_InvalidUUID(t *testing.T) {
	db, _, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	// Инициализируем сервис. WSServer пока nil.
	svc := chat.NewService(db, nil)
	userID := "not-a-uuid"

	err = svc.LeaveChat(context.Background(), userID, "not-a-uuid")
	require.ErrorIs(t, err, chat.ErrInvalidInput)
}

func TestLeaveChat_RollbackOnSettingsDeleteError(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	// Инициализируем сервис. WSServer пока nil.
	svc := chat.NewService(db, nil)

	chatID := "550e8400-e29b-41d4-a716-446655440002"
	userID := "550e8400-e29b-41d4-a716-446655440003"

	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(userID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("member"))

	mock.ExpectBegin()
	mock.ExpectExec(`DELETE FROM crypto.chat_encryption_keys WHERE chat_id = $1 AND user_id = $2`).
		WithArgs(chatID, userID).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`DELETE FROM chats.user_chat_settings WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(userID, chatID).
		WillReturnError(sql.ErrConnDone)
	mock.ExpectRollback()

	err = svc.LeaveChat(context.Background(), userID, chatID)
	require.Error(t, err)
	require.ErrorIs(t, err, sql.ErrConnDone)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestLeaveChat_RaceMemberDeleted(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	// Инициализируем сервис. WSServer пока nil.
	svc := chat.NewService(db, nil)

	chatID := "550e8400-e29b-41d4-a716-446655440002"
	userID := "550e8400-e29b-41d4-a716-446655440003"

	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(userID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("member"))

	mock.ExpectBegin()
	mock.ExpectExec(`DELETE FROM crypto.chat_encryption_keys WHERE chat_id = $1 AND user_id = $2`).
		WithArgs(chatID, userID).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`DELETE FROM chats.user_chat_settings WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(userID, chatID).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`DELETE FROM chats.members WHERE chat_id=$1 AND user_id=$2 AND role<>'owner'`).
		WithArgs(chatID, userID).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectRollback()

	err = svc.LeaveChat(context.Background(), userID, chatID)
	require.ErrorIs(t, err, chat.ErrForbidden)
	require.NoError(t, mock.ExpectationsWereMet())
}
