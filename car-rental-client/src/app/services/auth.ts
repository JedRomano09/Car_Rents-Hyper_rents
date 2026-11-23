import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { map, tap } from 'rxjs';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from './api';

export interface AuthUser {
  id: number;
  email: string;
  username?: string | null;
  role: string;
}

export interface LoginResponse {
  status: string;
  message: string;
  user?: AuthUser;
}

export interface AuthMessageResponse {
  status: string;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  readonly currentUser = signal<AuthUser | null>(null);
  private readonly apiUrl = API_BASE_URL;
  private readonly http = inject(HttpClient);

  login(email: string, password: string): Observable<LoginResponse> {
    const payload = {
      email: email.trim(),
      password,
    };

    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, payload, { withCredentials: true }).pipe(
      tap((res) => {
        if (res.status === 'success' && res.user) {
          this.currentUser.set(res.user);
        }
      }),
    );
  }

  signup(username: string, email: string, password: string): Observable<AuthMessageResponse> {
    const payload = {
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
    };

    return this.http.post<AuthMessageResponse>(`${this.apiUrl}/auth/signup`, payload, { withCredentials: true });
  }

  changePassword(email: string, newPassword: string): Observable<AuthMessageResponse> {
    return this.http.post<AuthMessageResponse>(
      `${this.apiUrl}/auth/change-password`,
      {
        email: email.trim().toLowerCase(),
        new_password: newPassword,
      },
      { withCredentials: true },
    );
  }

  getSession(): Observable<AuthUser | null> {
    return this.http.get<AuthUser | null>(`${this.apiUrl}/auth/session`, { withCredentials: true }).pipe(
      map((user) => {
        const loginUser = this.currentUser();
        const sessionUser =
          user && loginUser?.id === user.id && !user.username && loginUser.username
            ? { ...user, username: loginUser.username }
            : user;
        this.currentUser.set(sessionUser);
        return sessionUser;
      }),
    );
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser();
  }

  logout(): Observable<AuthMessageResponse> {
    return this.http
      .post<AuthMessageResponse>(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true })
      .pipe(tap(() => this.currentUser.set(null)));
  }
}
