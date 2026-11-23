import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiService } from '../services/api';
import { ToastService } from '../services/toast';
import { RentPage } from './rent.page';
import { AuthService } from '../services/auth';

describe('RentPage', () => {
  let component: RentPage;
  let fixture: ComponentFixture<RentPage>;
  const selectedCar = {
    id: 15,
    name: 'TOYOTA SUPRA MK4',
    year: '1998',
    engine: 'Petrol',
    img: 'assets/icon/SUPRA MK4.png',
    plate_number: 'WAA 1598',
    seating_capacity: 4,
    price: 6000,
    status: 'Available' as const,
  };
  const api = {
    createBooking: vi.fn().mockReturnValue(of({ id: 1, message: 'Booking created.' })),
  };
  const auth = {
    getCurrentUser: vi.fn().mockReturnValue(null),
    getSession: vi.fn().mockReturnValue(of({ id: 23, email: 'user@example.com', role: 'customer' as const })),
  };
  const toast = { show: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    window.history.replaceState({ selectedCar }, '');
    auth.getCurrentUser.mockReset().mockReturnValue(null);
    auth.getSession.mockReset().mockReturnValue(of({ id: 23, email: 'user@example.com', role: 'customer' as const }));
    api.createBooking.mockReset();
    api.createBooking.mockReturnValue(of({ id: 1, message: 'Booking created.' }));
    toast.show.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(RentPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fixture.destroy();
    window.history.replaceState({}, '');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays the selected vehicle image and details', () => {
    const image = fixture.nativeElement.querySelector('.vehicle-image img') as HTMLImageElement;

    expect(component.selectedCar?.id).toBe(selectedCar.id);
    expect(image.alt).toBe(selectedCar.name);
    expect(fixture.nativeElement.textContent).toContain('WAA 1598');
    expect(fixture.nativeElement.textContent).toContain('1998 Model');
  });

  it('calculates the rental total from the selected car price and number of days', () => {
    component.rentalDays = 3;
    fixture.detectChanges();

    expect(component.estimatedTotal).toBe(18000);
    expect(fixture.nativeElement.textContent).toContain('₱18,000');
  });

  it('submits a booking for the selected car and logged-in user', () => {
    component.rentalDays = 3;
    component.customerLocation = 'Makati City';
    component.validIdImage = new File(['id image'], 'valid-id.png', { type: 'image/png' });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.confirmRental();

    const booking = api.createBooking.mock.calls[0][0];
    expect(booking.car_id).toBe(selectedCar.id);
    expect(booking.customer_id).toBe(23);
    expect(booking.customer_location).toBe('Makati City');
    expect(api.createBooking.mock.calls[0][1]).toBe(component.validIdImage);
    expect(toast.show).toHaveBeenCalledWith('Successfully rented!');
    expect(navigateSpy).toHaveBeenCalledWith('/profile', { replaceUrl: true });
    expect(
      (Date.parse(`${booking.end_date}T00:00:00Z`) - Date.parse(`${booking.start_date}T00:00:00Z`)) / 86400000,
    ).toBe(3);
  });

  it('uses the cached logged-in user when the session request has not returned', () => {
    auth.getCurrentUser.mockReturnValue({ id: 23, email: 'user@example.com', role: 'customer' });
    auth.getSession.mockReturnValue(throwError(() => new Error('session unavailable')));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const freshFixture = TestBed.createComponent(RentPage);
    const freshComponent = freshFixture.componentInstance;
    freshFixture.detectChanges();

    expect(freshComponent.customerId).toBe(23);
    errorSpy.mockRestore();
    freshFixture.destroy();
  });

  it('uses any authenticated user id regardless of the role label', () => {
    auth.getSession.mockReturnValue(of({ id: 44, email: 'renter@example.com', role: 'renter' }));

    const freshFixture = TestBed.createComponent(RentPage);
    const freshComponent = freshFixture.componentInstance;
    freshFixture.detectChanges();

    expect(freshComponent.customerId).toBe(44);
    freshFixture.destroy();
  });

  it('does not submit until the renter location and valid ID image are provided', () => {
    component.confirmRental();

    expect(api.createBooking).not.toHaveBeenCalled();
    expect(component.canConfirmRental).toBe(false);
  });

  it('keeps the confirm button clickable and explains what is missing', () => {
    const button = fixture.nativeElement.querySelector('.confirm-button') as HTMLButtonElement;

    expect(button.disabled).toBe(false);

    button.click();

    expect(toast.show).toHaveBeenCalledWith('Enter your current location.');
    expect(api.createBooking).not.toHaveBeenCalled();
  });

  it('previews a valid uploaded ID and clears the preview for an invalid file', () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:valid-id'),
      revokeObjectURL: vi.fn(),
    });
    const input = fixture.nativeElement.querySelector('#valid-id-image') as HTMLInputElement;
    const validImage = new File(['id image'], 'valid-id.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { configurable: true, value: [validImage] });

    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.photo-preview')?.src).toBe('blob:valid-id');
    expect(fixture.nativeElement.querySelector('.photo-name')?.textContent).toContain('valid-id.png');

    const invalidImage = new File(['document'], 'document.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { configurable: true, value: [invalidImage] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.validIdImagePreviewUrl).toBeNull();
    expect(fixture.nativeElement.querySelector('.photo-preview')).toBeNull();
    expect(component.validIdImage).toBeNull();
    expect(component.validIdImageError).toContain('JPEG, PNG, or WebP');
  });

  it('explains when the server rental endpoint rejects the ID upload', () => {
    component.customerLocation = 'Makati City';
    component.validIdImage = new File(['id image'], 'valid-id.png', { type: 'image/png' });
    api.createBooking.mockReturnValue(throwError(() => ({ error: { message: 'Invalid request.' } })));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    component.confirmRental();

    expect(toast.show).toHaveBeenCalledWith('The FastAPI booking endpoint could not read the upload.');
    expect(component.isSubmitting).toBe(false);
    errorSpy.mockRestore();
  });
});
