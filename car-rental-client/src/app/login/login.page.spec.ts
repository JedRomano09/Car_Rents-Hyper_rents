import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginPage } from './login.page';
import { of } from 'rxjs';
import { ToastService } from '../services/toast';
import { AuthService } from '../services/auth';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let router: Router;
  const login = vi.fn();
  const toast = { show: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    login.mockReset();
    toast.show.mockReset();
    toast.show.mockResolvedValue(undefined);
    login.mockReturnValue(
      of({
        status: 'success',
        message: 'Login successful!',
        user: { id: 12, email: 'user@example.com', role: 'customer' },
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { login } },
        { provide: ToastService, useValue: toast },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('authenticates through FastAPI and routes the returned user', () => {
    component.email = 'user@example.com';
    component.password = 'secret-password';

    component.onLogin();

    expect(login).toHaveBeenCalledWith('user@example.com', 'secret-password');
    expect(router.navigate).toHaveBeenCalledWith(['/home'], {
      replaceUrl: true,
    });
  });

  it('shows the admin approval message returned by the database API', () => {
    login.mockReturnValue(
      of({
        status: 'success',
        message: 'Admin approved your password change. Login successful!',
        user: { id: 12, email: 'user@example.com', role: 'customer' },
      }),
    );
    component.email = 'user@example.com';
    component.password = 'new-password';

    component.onLogin();

    expect(toast.show).toHaveBeenCalledWith(
      'Admin approved your password change. Login successful!',
    );
  });

  it('routes admin accounts to the admin page after login', () => {
    login.mockReturnValue(
      of({
        status: 'success',
        message: 'Login successful!',
        user: { id: 16, email: 'admin@example.com', role: 'admin' },
      }),
    );
    component.email = 'admin@example.com';
    component.password = 'admin-password';

    component.onLogin();

    expect(router.navigate).toHaveBeenCalledWith(['/admin'], { replaceUrl: true });
  });
});
