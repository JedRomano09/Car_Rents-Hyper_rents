import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ForgetpassPage } from './forgetpass.page';
import { of, throwError } from 'rxjs';
import { provideRouter, Router } from '@angular/router';
import { ToastService } from '../services/toast';
import { AuthService } from '../services/auth';

describe('ForgetpassPage', () => {
  let component: ForgetpassPage;
  let fixture: ComponentFixture<ForgetpassPage>;
  let router: Router;
  const changePassword = vi.fn();
  const toast = { show: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    changePassword.mockReset();
    toast.show.mockReset();
    toast.show.mockResolvedValue(undefined);
    changePassword.mockReturnValue(
      of({
        status: 'success',
        message: 'Successfully Change Password, Wait for the Admin Approval.',
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { changePassword } },
        { provide: ToastService, useValue: toast },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ForgetpassPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows a toast when both the email and password are empty', () => {
    component.email = '';
    component.newPassword = '';

    component.onResetPassword();

    expect(toast.show).toHaveBeenCalledWith('the email and password is empty');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('shows a toast when the email is empty', () => {
    component.email = '';
    component.newPassword = 'new-password';

    component.onResetPassword();

    expect(toast.show).toHaveBeenCalledWith('the email is empty');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('shows a toast when the new password is empty', () => {
    component.email = 'user@example.com';
    component.newPassword = '';

    component.onResetPassword();

    expect(toast.show).toHaveBeenCalledWith('the passwordl is empty');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('shows the admin approval toast when the request is submitted', () => {
    component.email = 'user@example.com';
    component.newPassword = 'new-password';

    component.onResetPassword();

    expect(toast.show).toHaveBeenCalledWith('Successfully Change Password, Wait for the Admin Approval.');
  });

  it('submits a password change request to the database API', () => {
    component.email = 'user@example.com';
    component.newPassword = 'new-password';

    component.onResetPassword();

    expect(changePassword).toHaveBeenCalledWith('user@example.com', 'new-password');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('shows the backend message when the account is not found', () => {
    changePassword.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, error: { detail: { message: 'User not found.' } } })),
    );
    component.email = 'unknown@example.com';
    component.newPassword = 'new-password';

    component.onResetPassword();

    expect(toast.show).toHaveBeenCalledWith('User not found.');
  });

  it('shows the pending approval message when another request is already queued', () => {
    changePassword.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              detail: {
                message: 'You already have a pending password change request. Wait for the Admin Approval.',
              },
            },
          }),
      ),
    );
    component.email = 'user@example.com';
    component.newPassword = 'another-password';

    component.onResetPassword();

    expect(toast.show).toHaveBeenCalledWith(
      'You already have a pending password change request. Wait for the Admin Approval.',
    );
  });
});
