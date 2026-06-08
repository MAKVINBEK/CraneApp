const assert = require('assert');
const path = require('path');

const helpers = require(path.join(
  __dirname,
  '..',
  'client',
  'mobile',
  'screens',
  'chats',
  'mentionNotifications.js'
));

function run() {
  assert.strictEqual(
    helpers.chatHasUnreadMention({ type: 'group', mentionCount: 2 }),
    true,
    'group chats with mentionCount should show @'
  );

  assert.strictEqual(
    helpers.chatHasUnreadMention({ type: 'group', mentionCount: 0 }),
    false,
    'group chats without mentionCount should not show @'
  );

  assert.deepStrictEqual(
    helpers.clearMentionState({ unreadCount: 3, mentionCount: 2, latestMentionAt: '2026-01-01T00:00:00Z' }),
    { unreadCount: 3, mentionCount: 0, latestMentionAt: null, oldestMentionMessageId: null },
    'clearing mentions should leave normal unread count untouched'
  );

  const messages = [
    { id: 'not-me', senderId: 'u2', mentionedUserIds: ['u3'], createdAt: '2026-01-01T10:00:00Z' },
    { id: 'm2', senderId: 'u2', mentionedUserIds: ['u1'], createdAt: '2026-01-01T10:02:00Z' },
    { id: 'mine', senderId: 'u1', mentionedUserIds: ['u1'], createdAt: '2026-01-01T10:03:00Z' },
    { id: 'm1', senderId: 'u2', mentionedUserIds: ['u1'], createdAt: '2026-01-01T10:01:00Z' }
  ];

  const unread = helpers.getUnreadMentionMessages(messages, {
    userId: 'u1',
    mentionReadAt: '2026-01-01T10:00:30Z'
  });

  assert.deepStrictEqual(
    unread.map((m) => m.id),
    ['m1', 'm2'],
    'unread mentions should be ordered oldest to newest and exclude own messages'
  );

  const nextCursor = helpers.getMentionCursorAfterJump(null, unread[0]);
  assert.strictEqual(nextCursor, '2026-01-01T10:01:00Z');

  const remaining = helpers.getUnreadMentionMessages(messages, {
    userId: 'u1',
    mentionReadAt: nextCursor
  });

  assert.deepStrictEqual(
    remaining.map((m) => m.id),
    ['m2'],
    'after one jump, the next click should target the next unread mention'
  );
}

run();
console.log('mentionNotifications tests passed');
