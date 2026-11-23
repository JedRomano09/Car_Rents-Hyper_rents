import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { HomePage } from './home.page';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  const auth = { logout: vi.fn().mockReturnValue(of({ status: 'success', message: 'Logged out.' })) };
  const toast = { show: vi.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    auth.logout.mockReset().mockReturnValue(of({ status: 'success', message: 'Logged out.' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('connects the Profile menu link to the profile route', () => {
    fixture.nativeElement.querySelector('.hamburger-icon').click();
    fixture.detectChanges();

    const profileLink = fixture.nativeElement.querySelector(
      '.mobile-menu a[routerLink="/profile"]',
    );
    expect(profileLink).not.toBeNull();
    expect(profileLink.getAttribute('href')).toBe('/profile');
  });

  it('clears the FastAPI session and returns to the login page on logout', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.logout();

    expect(auth.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });
});
