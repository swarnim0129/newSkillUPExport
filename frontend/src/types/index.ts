export interface User {
    _id: string;
    name: string;
    email: string;
    role: 'user' | 'admin';
    status: 'pending' | 'active' | 'suspended';
    createdAt: string;
}

export interface AuthResponse {
    _id: string;
    name: string;
    email: string;
    role: 'user' | 'admin';
    status: string;
    token: string;
}

export interface Pagination {
    current: number;
    pages: number;
    total: number;
}

