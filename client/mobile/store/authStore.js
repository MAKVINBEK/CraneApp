/**
 * Authentication Store
 * Manages auth state in localStorage
 */

const TOKEN_KEY = 'craneapp_auth_token';
const USER_KEY = 'craneapp_user_data';

export const authStore = {
    getToken() {
        return localStorage.getItem(TOKEN_KEY);
    },

    setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
    },

    removeToken() {
        localStorage.removeItem(TOKEN_KEY);
    },

    getUser() {
        const data = localStorage.getItem(USER_KEY);
        return data ? JSON.parse(data) : null;
    },

    setUser(user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    },

    removeUser() {
        localStorage.removeItem(USER_KEY);
    },

    isAuthenticated() {
        return !!this.getToken() && !!this.getUser();
    },

    logout() {
        this.removeToken();
        this.removeUser();
    },

    async validateSession() {
        const token = this.getToken();
        if (!token) return false;

        try {
            const response = await fetch('/api/v1/auth/validate', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.setUser(data.user);
                return true;
            } else {
                this.logout();
                return false;
            }
        } catch (error) {
            console.error('Session validation error:', error);
            return false;
        }
    }
};