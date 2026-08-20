package chat

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

const (
	deleteMessageUserID = "00000000-0000-0000-0000-000000000001"
	deleteMessageChatID = "00000000-0000-0000-0000-000000000002"
	deletedMessageID    = "00000000-0000-0000-0000-000000000004"
	previousMessageID   = "00000000-0000-0000-0000-000000000003"
)

func TestDeleteMessage_EventContainsPreviousMessage(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	ws := &recordingRealtime{}
	svc := NewService(db, ws)
	deletedAt := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE messages\.messages AS m`).
		WithArgs(deletedMessageID, deleteMessageUserID).
		WillReturnRows(sqlmock.NewRows([]string{"chat_id", "created_at"}).AddRow(deleteMessageChatID, deletedAt))
	mock.ExpectQuery(`WHERE m\.chat_id = \$1[\s\S]*m\.deleted_at IS NULL[\s\S]*ORDER BY m\.created_at DESC, m\.id DESC`).
		WithArgs(deleteMessageChatID, deletedAt, deletedMessageID).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "chat_id", "sender_id", "sender_name", "sender_avatar", "content", "type",
			"reply_to", "metadata", "is_pinned", "is_edited", "created_at", "updated_at", "deleted_at",
		}).AddRow(previousMessageID, deleteMessageChatID, deleteMessageUserID, "Alice", "", "Previous message", "text", nil, []byte(`{}`), false, false, "2026-08-20T11:00:00Z", "2026-08-20T11:00:00Z", nil))
	mock.ExpectCommit()

	require.NoError(t, svc.DeleteMessage(context.Background(), deleteMessageUserID, deletedMessageID))
	require.Len(t, ws.broadcasts, 1)

	var event struct {
		Type            string   `json:"type"`
		ChatID          string   `json:"chatId"`
		MessageID       string   `json:"messageId"`
		PreviousMessage *Message `json:"previousMessage"`
	}
	require.NoError(t, json.Unmarshal(ws.broadcasts[0].payload, &event))
	require.Equal(t, "message_deleted", event.Type)
	require.Equal(t, deleteMessageChatID, event.ChatID)
	require.Equal(t, deletedMessageID, event.MessageID)
	require.NotNil(t, event.PreviousMessage)
	require.Equal(t, previousMessageID, event.PreviousMessage.ID)
	require.Equal(t, "Previous message", event.PreviousMessage.Content)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestDeleteMessage_EventContainsNullWhenNoPreviousMessage(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	ws := &recordingRealtime{}
	svc := NewService(db, ws)
	deletedAt := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)

	mock.ExpectBegin()
	mock.ExpectQuery(`UPDATE messages\.messages AS m`).
		WithArgs(deletedMessageID, deleteMessageUserID).
		WillReturnRows(sqlmock.NewRows([]string{"chat_id", "created_at"}).AddRow(deleteMessageChatID, deletedAt))
	mock.ExpectQuery(`WHERE m\.chat_id = \$1[\s\S]*m\.deleted_at IS NULL`).
		WithArgs(deleteMessageChatID, deletedAt, deletedMessageID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "chat_id", "sender_id"}))
	mock.ExpectCommit()

	require.NoError(t, svc.DeleteMessage(context.Background(), deleteMessageUserID, deletedMessageID))
	require.Len(t, ws.broadcasts, 1)

	var event map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(ws.broadcasts[0].payload, &event))
	require.JSONEq(t, `null`, string(event["previousMessage"]))
	require.NoError(t, mock.ExpectationsWereMet())
}
