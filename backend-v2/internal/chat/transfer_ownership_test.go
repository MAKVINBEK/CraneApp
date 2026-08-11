package chat_test

import (
	"context"
	"craneapp/backend-v2/internal/chat"
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

// TestTransferOwnership_Success_ownerTransfers проверяет транзакционную передачу владения:
// обновляются owner_id в chats.chats и роли обеих сторон в chats.members в одной транзакции,
// прежний владелец становится member.
func TestTransferOwnership_Success_ownerTransfers(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	svc := chat.NewService(db, nil)

	actorID := "550e8400-e29b-41d4-a716-446655440001" // прежний владельц
	chatID := "550e8400-e29b-41d4-a716-446655440002"
	targetID := "550e8400-e29b-41d4-a716-446655440003" // новый владельц

	// 1. Проверка роли актора — должен быть owner
	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(actorID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("owner"))

	// 2. Проверка роли цели — должен быть членом (не-owner)
	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(targetID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("member"))

	// 3. Транзакция передачи владения
	mock.ExpectBegin()

	// 3.1. Новый владельц в chats.chats
	mock.ExpectExec(`UPDATE chats.chats SET owner_id = $1, updated_at = NOW() WHERE id = $2`).
		WithArgs(targetID, chatID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// 3.2. Новый владельц становится 'owner' в chats.members
	mock.ExpectExec(`UPDATE chats.members SET role = 'owner' WHERE chat_id = $1 AND user_id = $2`).
		WithArgs(chatID, targetID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	// 3.3. Прежний владельц становится 'member'
	mock.ExpectExec(`UPDATE chats.members SET role = 'member' WHERE chat_id = $1 AND user_id = $2`).
		WithArgs(chatID, actorID).
		WillReturnResult(sqlmock.NewResult(0, 1))

	mock.ExpectCommit()

	// Act
	err = svc.TransferOwnership(context.Background(), actorID, chatID, targetID)
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestTransferOwnership_NotOwner проверяет, что не-владелец (admin/member) не может
// передать владение: отказ с ErrForbidden до любых UPDATE-операций.
func TestTransferOwnership_NotOwner(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	svc := chat.NewService(db, nil)

	actorID := "550e8400-e29b-41d4-a716-446655440001" // прежний владельц
	chatID := "550e8400-e29b-41d4-a716-446655440002"
	targetID := "550e8400-e29b-41d4-a716-446655440003" // новый владельц

	// 1. Проверка роли актора — не owner
	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(actorID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("member"))

	// Act
	err = svc.TransferOwnership(context.Background(), actorID, chatID, targetID)
	require.ErrorIs(t, err, chat.ErrForbidden)
}

// TestTransferOwnership_TargetNotMember проверяет, что нельзя передать владение
// пользователю, не состоящему в чате: возвращается ErrNotMember, транзакция не открывается.
func TestTransferOwnership_TargetNotMember(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	svc := chat.NewService(db, nil)

	actorID := "550e8400-e29b-41d4-a716-446655440001" // прежний владелец
	chatID := "550e8400-e29b-41d4-a716-446655440002"
	targetID := "550e8400-e29b-41d4-a716-446655440003" // новый владелец

	// 1. Проверка роли актора — должен быть owner
	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(actorID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("owner"))

	// 2. Проверка роли цели — не член (не-member)
	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(targetID, chatID).
		WillReturnError(sql.ErrNoRows)

	// Act
	err = svc.TransferOwnership(context.Background(), actorID, chatID, targetID)
	require.ErrorIs(t, err, chat.ErrNotMember)
}

// TestTransferOwnership_SelfTransfer проверяет запрет передачи самому себе:
// возвращается ErrInvalidInput. (Note: проверка должна сработать до SQL-запросов.)
func TestTransferOwnership_SelfTransfer(t *testing.T) {
	db, _, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	svc := chat.NewService(db, nil)

	actorID := "550e8400-e29b-41d4-a716-446655440001" // прежний владелец
	chatID := "550e8400-e29b-41d4-a716-446655440002"
	targetID := "550e8400-e29b-41d4-a716-446655440001" // новый владельц = прежний владелец

	// Act
	err = svc.TransferOwnership(context.Background(), actorID, chatID, targetID)
	require.ErrorIs(t, err, chat.ErrInvalidInput)
}

// TestTransferOwnership_InvalidUUID проверяет отказ при невалидных UUID:
// возвращается ErrInvalidInput, обращений к БД нет.
func TestTransferOwnership_InvalidUUID(t *testing.T) {
	db, _, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	// Инициализируем сервис. WSServer пока nil.
	svc := chat.NewService(db, nil)
	actorID := "550e8400-e29b-41d4-a716-446655440001" // прежний владелец
	chatID := "550e8400-e29b-41d4-a716-446655440002"
	targetID := "not-a-uuid"

	err = svc.TransferOwnership(context.Background(), actorID, chatID, targetID)
	require.ErrorIs(t, err, chat.ErrInvalidInput)
}

// TestTransferOwnership_RollbackOnUpdateError проверяет откат транзакции:
// если первый UPDATE (owner_id в chats.chats) падает, транзакция откатывается,
// исходная ошибка возвращается. Последующие UPDATE не должны выполниться.
func TestTransferOwnership_RollbackOnUpdateError(t *testing.T) {
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherEqual))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	// Инициализируем сервис. WSServer пока nil.
	svc := chat.NewService(db, nil)

	actorID := "550e8400-e29b-41d4-a716-446655440001" // прежний владелец
	chatID := "550e8400-e29b-41d4-a716-446655440002"
	targetID := "550e8400-e29b-41d4-a716-446655440003" // новый владелец

	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(actorID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("owner"))

	mock.ExpectQuery(`SELECT role FROM chats.members WHERE user_id = $1 AND chat_id = $2`).
		WithArgs(targetID, chatID).
		WillReturnRows(sqlmock.NewRows([]string{"role"}).AddRow("member"))

	mock.ExpectBegin()
	mock.ExpectExec(`UPDATE chats.chats SET owner_id = $1, updated_at = NOW() WHERE id = $2`).
		WithArgs(targetID, chatID).
		WillReturnError(sql.ErrConnDone)
	mock.ExpectRollback()

	err = svc.TransferOwnership(context.Background(), actorID, chatID, targetID)
	require.Error(t, err)
	require.ErrorIs(t, err, sql.ErrConnDone)
	require.NoError(t, mock.ExpectationsWereMet())
}
