import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from './api';
import { AuthService } from './auth';
import type { AuthUser } from './auth';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('creates a cookie-backed FastAPI session on login', () => {
    const user: AuthUser = { id: 12, email: 'user@example.com', username: 'renter', role: 'customer' };
    service.login(user.email, 'secret-password').subscribe();

    const request = http.expectOne(`${API_BASE_URL}/auth/login`);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ email: user.email, password: 'secret-password' });
    request.flush({ status: 'success', message: 'Login successful!', user });

    expect(service.currentUser()).toEqual(user);
  });

  it('restores the current user from the FastAPI session cookie', () => {
    const user: AuthUser = { id: 12, email: 'user@example.com', username: 'renter', role: 'customer' };
    service.getSession().subscribe();

    const request = http.expectOne(`${API_BASE_URL}/auth/session`);
    expect(request.request.withCredentials).toBe(true);
    request.flush(user);

    expect(service.currentUser()).toEqual(user);
  });

  it('keeps the username returned at login when the session response omits it', () => {
    service.currentUser.set({ id: 12, email: 'user@example.com', username: 'renter', role: 'customer' });
    service.getSession().subscribe((user) => {
      expect(user?.username).toBe('renter');
    });

    const request = http.expectOne(`${API_BASE_URL}/auth/session`);
    request.flush({ id: 12, email: 'user@example.com', role: 'customer' });

    expect(service.currentUser()?.username).toBe('renter');
  });

  it('clears the in-memory user after FastAPI logout', () => {
    service.currentUser.set({ id: 12, email: 'user@example.com', role: 'customer' });
    service.logout().subscribe();

    const request = http.expectOne(`${API_BASE_URL}/auth/logout`);
    expect(request.request.withCredentials).toBe(true);
    request.flush({ status: 'success', message: 'Logged out.' });

    expect(service.currentUser()).toBeNull();
  });

  it('uses credentialed FastAPI requests for signup and password changes', () => {
    service.signup('Renter', ' USER@example.com ', 'secret-password').subscribe();
    const signupRequest = http.expectOne(`${API_BASE_URL}/auth/signup`);
    expect(signupRequest.request.withCredentials).toBe(true);
    expect(signupRequest.request.body).toEqual({
      username: 'Renter',
      email: 'user@example.com',
      password: 'secret-password',
    });
    signupRequest.flush({ status: 'success', message: 'Signup successful!' });

    service.changePassword('user@example.com', 'new-password').subscribe();
    const passwordRequest = http.expectOne(`${API_BASE_URL}/auth/change-password`);
    expect(passwordRequest.request.withCredentials).toBe(true);
    expect(passwordRequest.request.body).toEqual({
      email: 'user@example.com',
      new_password: 'new-password',
    });
    passwordRequest.flush({ status: 'success', message: 'Password change request submitted.' });
  });
});
