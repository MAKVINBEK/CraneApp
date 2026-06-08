================================================================================
                         CRANEAPP API SPECIFICATION
================================================================================

BASE URL: /api/v1

================================================================================
AUTHENTICATION
================================================================================

POST /auth/register
- Register new user
- Body: { phone, name, password }
- Response: { user, token }

POST /auth/login
- Login user
- Body: { phone, password }
- Response: { user, accessToken, refreshToken }

POST /auth/verify
- Verify phone number
- Body: { phone, code }
- Response: { verified: true }

POST /auth/refresh
- Refresh access token
- Body: { refreshToken }
- Response: { accessToken, refreshToken }

POST /auth/logout
- Logout user
- Headers: Authorization: Bearer <token>
- Response: { success: true }

================================================================================
USERS
================================================================================

GET /users/me
- Get current user profile
- Headers: Authorization
- Response: { user }

PUT /users/me
- Update user profile
- Body: { name, bio, avatar }
- Response: { user }

GET /users/:id
- Get user by ID
- Response: { user }

GET /users/search
- Search users
- Query: q
- Response: { users: [] }

================================================================================
CHATS
================================================================================

GET /chats
- Get all user chats
- Response: { chats: [] }

POST /chats
- Create new chat
- Body: { type, participants, name }
- Response: { chat }

GET /chats/:id
- Get chat by ID
- Response: { chat }

PUT /chats/:id
- Update chat
- Body: { name, avatar }
- Response: { chat }

DELETE /chats/:id
- Delete chat
- Response: { success: true }

================================================================================
MESSAGES
================================================================================

GET /messages/:chatId
- Get chat messages
- Query: limit, offset
- Response: { messages: [] }

POST /messages
- Send message
- Body: { chatId, content, type, replyTo }
- Response: { message }

PUT /messages/:id
- Edit message
- Body: { content }
- Response: { message }

DELETE /messages/:id
- Delete message
- Response: { success: true }

================================================================================
MEDIA
================================================================================

POST /media/upload
- Upload media file
- Body: FormData with file
- Response: { url, mediaId }

GET /media/:id
- Get media file
- Response: File stream

================================================================================
CALLS
================================================================================

POST /calls/start
- Start call
- Body: { chatId, type }
- Response: { call, offer }

POST /calls/answer
- Answer call
- Body: { callId, answer }
- Response: { success: true }

POST /calls/ice-candidate
- Send ICE candidate
- Body: { callId, candidate }
- Response: { success: true }

POST /calls/end
- End call
- Body: { callId }
- Response: { success: true }

================================================================================
WEBSOCKET EVENTS
================================================================================

Connection:
- Connect with token in auth

Events (client -> server):
- message:send - Send message
- message:read - Mark as read
- typing:start - Start typing
- typing:stop - Stop typing
- call:signal - WebRTC signaling

Events (server -> client):
- message:new - New message
- message:updated - Message updated
- message:deleted - Message deleted
- user:online - User online
- user:offline - User offline
- typing - User typing
- call:incoming - Incoming call

================================================================================