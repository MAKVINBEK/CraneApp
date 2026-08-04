import API_ENDPOINTS from "../../infrastructure/api/endpoints";

const cache = new Map(); // chatId -> { promise, expiresAt }
const TTL_MS = 5000;

export function getRawChat(apiClient, chatId) {
  const cached = cache.get(chatId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = apiClient
    .get(API_ENDPOINTS.CHAT_BY_ID(chatId))
    .then((response) => response.data?.chat ?? response.data)
    .catch((error) => {
      cache.delete(chatId);
      throw error;
    });

  cache.set(chatId, { promise, expiresAt: Date.now() + TTL_MS });
  return promise;
}

export function invalidateChat(chatId) {
  cache.delete(chatId);
}