import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { of } from 'rxjs';

import { ApiService } from '../services/api';
import { AuthService } from '../services/auth';

import { ProfilePage } from './profile.page';

interface TestAlertOptions {
  header: string;
  message: string;
  buttons: { text: string; role?: string; handler?: () => unknown }[];
}

describe('ProfilePage', () => {
  const api = {
    getBookings: vi.fn(),
    updateBooking: vi.fn(),
    resolveImageUrl: vi.fn((imageUrl: string | null) => imageUrl),
  };
  const auth = {
    currentUser: vi.fn().mockReturnValue(null),
    getSession: vi
      .fn()
      .mockReturnValue(of({ id: 12, email: 'jed@example.com', username: 'Jed', role: 'customer' as const })),
    logout: vi.fn().mockReturnValue(of({ status: 'success', message: 'Logged out.' })),
  };
  let latestAlertOptions: TestAlertOptions | undefined;
  const alertController = {
    create: vi.fn((options: TestAlertOptions) => {
      latestAlertOptions = options;
      return Promise.resolve({ present: vi.fn() });
    }),
  };

  beforeEach(() => {
    auth.currentUser.mockReset().mockReturnValue(null);
    auth.getSession
      .mockReset()
      .mockReturnValue(of({ id: 12, email: 'jed@example.com', username: 'Jed', role: 'customer' as const }));
    auth.logout.mockReset().mockReturnValue(of({ status: 'success', message: 'Logged out.' }));
    api.getBookings.mockReset().mockReturnValue(of([]));
    api.updateBooking.mockReset().mockReturnValue(of({ message: 'Booking updated.' }));
    alertController.create.mockClear();
    latestAlertOptions = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: AlertController, useValue: alertController },
      ],
    });
  });

  it('shows the signed-in user and empty rentals state', () => {
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Welcome, Jed');
    expect(fixture.nativeElement.textContent).toContain('No rentals yet');
    expect(fixture.nativeElement.textContent).toContain('Total Rentals');
    expect(fixture.nativeElement.textContent).toContain('Active');
    expect(fixture.nativeElement.textContent).not.toContain('CONTACT US');
    fixture.destroy();
  });

  it('uses the username returned at login without requiring another session lookup', () => {
    auth.currentUser.mockReturnValue({
      id: 12,
      email: 'jed@example.com',
      username: 'Jed',
      role: 'customer',
    });
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();

    fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    expect(auth.getSession).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Welcome, Jed');
    expect(api.getBookings).toHaveBeenCalled();
    fixture.destroy();
  });

  it('connects the Profile menu item to the profile route', () => {
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button.header-icon-button').click();
    fixture.detectChanges();

    const profileLink = fixture.nativeElement.querySelector('.mobile-menu a[routerLink="/profile"]');
    expect(profileLink).not.toBeNull();
    expect(profileLink.getAttribute('href')).toBe('/profile');
    fixture.destroy();
  });

  it('shows only this user’s rentals and resolves car names', () => {
    api.getBookings.mockReturnValue(
      of([
        {
          id: 1,
          car_id: 8,
          customer_id: 12,
          start_date: '2026-11-15',
          end_date: '2026-11-17',
          total_price: 30000,
          status: 'Approved' as const,
          created_at: '2026-11-15T10:24:00',
          car_name: 'Toyota Supra',
          car_image: 'assets/icon/TOYOTA SUPRA MK5.png',
        },
        {
          id: 2,
          car_id: 9,
          customer_id: 13,
          start_date: '2026-11-18',
          end_date: '2026-11-20',
          total_price: 24000,
          status: 'Pending' as const,
        },
        {
          id: 3,
          car_id: 10,
          customer_id: 12,
          start_date: '2026-11-10',
          end_date: '2026-11-11',
          total_price: 12000,
          status: 'Completed' as const,
          car_name: 'Previously returned car',
        },
      ]),
    );
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Toyota Supra');
    expect(fixture.nativeElement.textContent).toContain('Ordered:');
    expect(fixture.nativeElement.textContent).toContain('10:24');
    expect(fixture.nativeElement.textContent).toContain('2 day(s)');
    expect(fixture.nativeElement.textContent).toContain('Rented:');
    expect(fixture.nativeElement.textContent).toContain('Due:');
    expect(fixture.nativeElement.textContent).toContain('Active');
    expect((fixture.nativeElement.querySelector('.rental-image img') as HTMLImageElement).src).toContain(
      'TOYOTA%20SUPRA%20MK5.png',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Car #9');
    expect(fixture.nativeElement.textContent).not.toContain('Previously returned car');
    expect(fixture.nativeElement.textContent).toContain('₱30,000');
    expect(fixture.componentInstance.rentals).toHaveLength(1);
    expect(fixture.componentInstance.activeRentals).toBe(1);
    fixture.destroy();
  });

  it('confirms the selected car return and removes it from the rental list', async () => {
    api.getBookings.mockReturnValue(
      of([
        {
          id: 5,
          car_id: 8,
          customer_id: 12,
          start_date: '2026-11-15',
          end_date: '2026-11-17',
          total_price: 30000,
          status: 'Approved' as const,
          car_name: 'Toyota Supra',
        },
      ]),
    );
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.return-button').click();
    await fixture.whenStable();

    expect(latestAlertOptions?.message).toBe('Are you sure you want to return Toyota Supra?');
    latestAlertOptions?.buttons[1].handler?.();

    expect(api.updateBooking).toHaveBeenCalledWith(5, {
      car_id: 8,
      customer_id: 12,
      start_date: '2026-11-15',
      end_date: '2026-11-17',
      status: 'Completed',
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.rentals).toHaveLength(0);
    expect(fixture.componentInstance.activeRentals).toBe(0);
    expect(fixture.nativeElement.querySelector('.rental-card')).toBeNull();
    fixture.destroy();
  });

  it('reloads rentals each time the cached Profile page is entered', () => {
    api.getBookings.mockReturnValueOnce(of([])).mockReturnValueOnce(
      of([
        {
          id: 8,
          car_id: 7,
          customer_id: 12,
          start_date: '2026-11-21',
          end_date: '2026-11-22',
          total_price: 45000,
          status: 'Pending' as const,
          car_name: 'LAND CRUISER',
        },
      ]),
    );
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();

    fixture.componentInstance.ionViewWillEnter();
    fixture.componentInstance.ionViewWillEnter();
    fixture.detectChanges();

    expect(api.getBookings).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.rentals).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('LAND CRUISER');
    fixture.destroy();
  });

  it('clears the FastAPI session and navigates to login on logout', () => {
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    fixture.componentInstance.ionViewWillEnter();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.logout();

    expect(auth.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login', { replaceUrl: true });
    fixture.destroy();
  });
});
