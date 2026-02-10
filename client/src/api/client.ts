const API_URL = 'http://localhost:3001';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Auth
  async register(email: string, password: string) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // Chat
  async sendMessage(message: string, sessionId?: string) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, sessionId }),
    });
  }

  async getChatSessions() {
    return this.request('/api/chat/sessions');
  }

  async getChatSession(sessionId: string) {
    return this.request(`/api/chat/sessions/${sessionId}`);
  }

  async deleteChatSession(sessionId: string) {
    return this.request(`/api/chat/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  // Tasks
  async getTasks(filters?: { status?: string; priority?: string }) {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    return this.request(`/api/tasks?${params.toString()}`);
  }

  async getTask(taskId: string) {
    return this.request(`/api/tasks/${taskId}`);
  }

  async createTask(task: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
  }) {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async updateTask(taskId: string, updates: any) {
    return this.request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async completeTask(taskId: string) {
    return this.request(`/api/tasks/${taskId}/complete`, {
      method: 'PATCH',
    });
  }

  async deleteTask(taskId: string) {
    return this.request(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();
