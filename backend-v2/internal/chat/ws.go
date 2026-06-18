package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"craneapp/backend-v2/internal/platform/config"
	cryptoclient "craneapp/backend-v2/internal/platform/crypto"
	"github.com/gorilla/websocket"
)

const (
	wsPingInterval  = 30 * time.Second
	wsReadDeadline  = 90 * time.Second
	wsWriteDeadline = 10 * time.Second
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		return allowedWSOrigin(origin)
	},
}

type tokenVerifier interface {
	VerifyToken(context.Context, string) (cryptoclient.TokenClaims, error)
}

type Client struct {
	UserID string
	Conn   *websocket.Conn
	Send   chan []byte
	done   chan struct{}
}

type WSServer struct {
	db       *sql.DB
	crypto   tokenVerifier
	clients  map[string]map[*Client]bool
	mu       sync.RWMutex
	register chan *Client
	unreg    chan *Client
}

func NewWSServer(db *sql.DB, crypto tokenVerifier) *WSServer {
	ws := &WSServer{
		db:       db,
		crypto:   crypto,
		clients:  make(map[string]map[*Client]bool),
		register: make(chan *Client),
		unreg:    make(chan *Client),
	}
	go ws.run()
	return ws
}

func (ws *WSServer) run() {
	for {
		select {
		case client := <-ws.register:
			ws.mu.Lock()
			if ws.clients[client.UserID] == nil {
				ws.clients[client.UserID] = make(map[*Client]bool)
			}
			ws.clients[client.UserID][client] = true
			ws.mu.Unlock()

		case client := <-ws.unreg:
			ws.mu.Lock()
			if conns, ok := ws.clients[client.UserID]; ok {
				if _, ok := conns[client]; ok {
					delete(conns, client)
					close(client.done)
					close(client.Send)
					if len(conns) == 0 {
						delete(ws.clients, client.UserID)
					}
				}
			}
			ws.mu.Unlock()
		}
	}
}

func (ws *WSServer) ServeWS(w http.ResponseWriter, r *http.Request) {
	if ws.crypto == nil {
		http.Error(w, "token verifier unavailable", http.StatusServiceUnavailable)
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" {
		header := r.Header.Get("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			token = strings.TrimPrefix(header, "Bearer ")
		}
	}
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	claims, err := ws.crypto.VerifyToken(r.Context(), token)
	if err != nil || claims.Subject == "" {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	conn.SetReadDeadline(time.Now().Add(wsReadDeadline))

	client := &Client{UserID: claims.Subject, Conn: conn, Send: make(chan []byte, 256), done: make(chan struct{})}
	ws.register <- client

	go ws.writePump(client)
	go ws.readPump(client)
	go ws.heartbeat(client)
}

func (ws *WSServer) readPump(client *Client) {
	defer func() {
		ws.unreg <- client
		client.Conn.Close()
	}()
	for {
		_, message, err := client.Conn.ReadMessage()
		if err != nil {
			break
		}
		// Reset read deadline on any incoming message.
		client.Conn.SetReadDeadline(time.Now().Add(wsReadDeadline))

		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		msgType, _ := msg["type"].(string)
		switch msgType {
		case "ping", "pong":
			client.Send <- []byte(`{"type":"pong"}`)
		case "chat_message":
			chatID, _ := msg["chatId"].(string)
			if chatID != "" {
				content, _ := msg["content"].(string)
				mType, _ := msg["messageType"].(string)
				if mType == "" {
					mType = "text"
				}
				var isMember bool
				ws.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM chats.members WHERE chat_id = $1 AND user_id = $2)`, chatID, client.UserID).Scan(&isMember)
				if isMember {
					var msgID string
					err := ws.db.QueryRow(`
						INSERT INTO messages.messages (chat_id, sender_id, content, type)
						VALUES ($1, $2, $3, $4) RETURNING id`,
						chatID, client.UserID, content, mType).Scan(&msgID)
					if err == nil {
						msg["id"] = msgID
						msg["senderId"] = client.UserID
						msg["createdAt"] = time.Now().Format(time.RFC3339Nano)
						newMessage, _ := json.Marshal(msg)
						ws.BroadcastToChat(chatID, newMessage, client.UserID)
					}
				}
			}
		case "typing":
			chatID, _ := msg["chatId"].(string)
			if chatID != "" {
				var isMember bool
				ws.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM chats.members WHERE chat_id = $1 AND user_id = $2)`, chatID, client.UserID).Scan(&isMember)
				if isMember {
					ws.BroadcastToChat(chatID, message, client.UserID)
				}
			}
		case "call_invite", "call_invite_response", "webrtc_offer", "webrtc_answer", "webrtc_candidate", "crane_hangup":
			to, _ := msg["to"].(string)
			if to != "" {
				ws.sendToUser(to, message)
			} else {
				chatID, _ := msg["chatId"].(string)
				if chatID != "" {
					ws.BroadcastToChat(chatID, message, client.UserID)
				}
			}
		}
	}
}

func (ws *WSServer) heartbeat(client *Client) {
	ticker := time.NewTicker(wsPingInterval)
	defer ticker.Stop()
	ping, _ := json.Marshal(map[string]string{"type": "ping"})
	for {
		select {
		case <-client.done:
			return
		case <-ticker.C:
			select {
			case client.Send <- ping:
			case <-client.done:
				return
			default:
				return
			}
		}
	}
}

func (ws *WSServer) writePump(client *Client) {
	defer client.Conn.Close()
	for {
		message, ok := <-client.Send
		if !ok {
			client.Conn.SetWriteDeadline(time.Now().Add(wsWriteDeadline))
			client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		}
		client.Conn.SetWriteDeadline(time.Now().Add(wsWriteDeadline))
		if err := client.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
}

func (ws *WSServer) BroadcastToChat(chatID string, message []byte, excludeUserID string) {
	if excludeUserID != "" {
		var isMember bool
		if err := ws.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM chats.members WHERE chat_id = $1 AND user_id = $2)`, chatID, excludeUserID).Scan(&isMember); err != nil || !isMember {
			return
		}
	}

	rows, err := ws.db.Query(`SELECT user_id FROM chats.members WHERE chat_id = $1`, chatID)
	if err != nil {
		return
	}
	defer rows.Close()

	ws.mu.RLock()
	defer ws.mu.RUnlock()

	for rows.Next() {
		var memberID string
		if err := rows.Scan(&memberID); err != nil {
			continue
		}
		if memberID == excludeUserID {
			continue
		}
		ws.sendToUserLocked(memberID, message)
	}
}

func (ws *WSServer) sendToUser(userID string, message []byte) {
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	ws.sendToUserLocked(userID, message)
}

func (ws *WSServer) sendToUserLocked(userID string, message []byte) {
	if conns, ok := ws.clients[userID]; ok {
		for client := range conns {
			select {
			case client.Send <- message:
			default:
			}
		}
	}
}

func allowedWSOrigin(origin string) bool {
	for _, allowed := range strings.Split(config.Value("ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080"), ",") {
		allowed = strings.TrimSpace(allowed)
		if allowed == "" || allowed == "*" {
			// Wildcard is never permitted — it opens CSRF on WebSocket upgrades.
			continue
		}
		if allowed == origin {
			return true
		}
	}
	return false
}
