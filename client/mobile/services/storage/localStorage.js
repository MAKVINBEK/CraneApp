/**
 * Local Storage Service Wrapper
 * Provides safe access to localStorage with error handling
 */
export const localStorageService = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.error('LocalStorage get error:', e);
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.error('LocalStorage set error:', e);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('LocalStorage remove error:', e);
      return false;
    }
  },

  clear() {
    try {
      localStorage.clear();
      return true;
    } catch (e) {
      console.error('LocalStorage clear error:', e);
      return false;
    }
  }
};