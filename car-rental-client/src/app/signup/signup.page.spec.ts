import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';

import { SignupPage } from './signup.page';

describe('SignupPage', () => {
  let component: SignupPage;
  let fixture: ComponentFixture<SignupPage>;
  const auth = { signup: vi.fn().mockReturnValue(of({ status: 'success', message: 'Signup successful!' })) };
  const toast = { show: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    auth.signup.mockReset().mockReturnValue(of({ status: 'success', message: 'Signup successful!' }));
    toast.show.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(SignupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('submits new accounts through FastAPI', () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.username = 'renter';
    component.email = 'user@example.com';
    component.password = 'secret-password';

    component.onSignup();

    expect(auth.signup).toHaveBeenCalledWith('renter', 'user@example.com', 'secret-password');
    expect(toast.show).toHaveBeenCalledWith('Signup successful! You can now log in.');
  });

  it('requires a username before submitting', () => {
    component.email = 'user@example.com';
    component.password = 'secret-password';

    component.onSignup();

    expect(auth.signup).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('the email and password is empty');
  });
});
