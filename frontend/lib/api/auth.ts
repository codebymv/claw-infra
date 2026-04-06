import { api } from './client';
import type { ApiKeyEntry } from './types';

export interface LoginResponse {
  access_token: string;
  user: { id: string; email: string; role: string; displayName: string };
}

class AuthApi {
  async login(email: string, password: string): Promise<LoginResponse> {
    return api.post('/auth/login', { email, password });
  }

  async register(email: string, password: string, displayName?: string): Promise<void> {
    return api.post('/auth/register', { email, password, displayName });
  }

  async getApiKeys(): Promise<ApiKeyEntry[]> {
    return api.get('/auth/api-keys');
  }

  async createApiKey(name: string, type?: string): Promise<{ key: string } & ApiKeyEntry> {
    return api.post('/auth/api-keys', { name, type });
  }

  async revokeApiKey(id: string): Promise<void> {
    return api.delete(`/auth/api-keys/${id}`);
  }
}

export const authApi = new AuthApi();

export const apiKeysApi = {
  list: () => authApi.getApiKeys(),
  create: (name: string, type?: string) => authApi.createApiKey(name, type),
  revoke: (id: string) => authApi.revokeApiKey(id),
};