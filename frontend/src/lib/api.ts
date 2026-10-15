import axios from 'axios';

const isDev = process.env.NODE_ENV === 'development';

const api = axios.create({
    baseURL: isDev
        ? '/api'
        : (process.env.NEXT_PUBLIC_API_URL || ''),
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add JWT token
api.interceptors.request.use(
    (config) => {
        if (typeof window !== 'undefined') {
            // Check if it's an admin route
            if (config.url?.includes('/admin')) {
                const adminToken = localStorage.getItem('adminToken');
                if (adminToken) {
                    config.headers.Authorization = `Bearer ${adminToken}`;
                }
            } else {
                // Legacy token, used only when the caller did not pass a Clerk token itself
                const token = localStorage.getItem('token');
                if (token && !config.headers.Authorization) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            if (typeof window !== 'undefined') {
                // Check if it was an admin request
                if (error.config.url?.includes('/admin')) {
                    localStorage.removeItem('adminToken');
                    localStorage.removeItem('adminUser');
                    window.location.href = '/admin/login';
                } else if (localStorage.getItem('token')) {
                    // Only a stale legacy session is cleared; Clerk sessions refresh on their own
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/';
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
