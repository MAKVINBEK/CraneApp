================================================================================
                         CRANEAPP MESSENGER ARCHITECTURE
================================================================================

1. OVERVIEW
--------------------------------------------------------------------------------
CraneApp - современный мессенджер уровня Telegram с поддержкой:
- Личных чатов
- Групповых чатов
- Каналов
- Голосовых и видео звонков
- Медиа обмена
- End-to-end шифрования

2. TECHNOLOGY STACK
--------------------------------------------------------------------------------
Frontend:
- Vanilla JavaScript (ES6+)
- HTML5 / CSS3
- WebSocket for realtime
- Service Workers for PWA

Backend:
- Node.js
- Express.js
- Socket.io
- JWT Authentication
- bcrypt password hashing

Database:
- PostgreSQL (primary)
- Redis (cache & sessions)

3. ARCHITECTURE PATTERNS
--------------------------------------------------------------------------------
- Microservices architecture
- Event-driven communication
- RESTful API + WebSocket
- Layered architecture

4. SECURITY
--------------------------------------------------------------------------------
- JWT tokens (access + refresh)
- bcrypt password hashing
- Rate limiting
- Input validation
- SQL injection prevention
- XSS protection
- CSRF protection

5. SCALABILITY
--------------------------------------------------------------------------------
- Horizontal scaling
- Load balancing
- Message queuing
- CDN for media

================================================================================