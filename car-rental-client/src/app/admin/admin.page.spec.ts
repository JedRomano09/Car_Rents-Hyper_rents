import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { of } from 'rxjs';

import { ApiService } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';

import { AdminPage } from './admin.page';

interface TestAlertOptions {
  header: string;
  message: string;
  buttons: { text: string; role?: string; handler?: () => unknown }[];
}

describe('AdminPage', () => {
  let component: AdminPage;
  let fixture: ComponentFixture<AdminPage>;
  const car = {
    id: 3,
    car_model: 'TOYOTA SUPRA MK5',
    year: 2024,
    engine: 'Petrol',
    plate_number: 'NGA 5090',
    seating_capacity: 2,
    price: 30000,
    status: 'Available' as const,
    image_url: null,
  };
  const api = {
    getCars: vi.fn().mockReturnValue(of([car])),
    getAdminCars: vi.fn().mockReturnValue(of([car])),
    updateCar: vi.fn().mockReturnValue(of({ message: 'Vehicle status updated.' })),
    updateAdminCar: vi.fn().mockReturnValue(of({ message: 'Vehicle status updated.' })),
    createCar: vi.fn().mockReturnValue(of({ id: 24, message: 'Vehicle added.', image_url: null })),
    createAdminCar: vi.fn().mockReturnValue(of({ id: 24, message: 'Vehicle added.', image_url: null })),
    deleteAdminCar: vi.fn().mockReturnValue(of({ message: 'Vehicle deleted.' })),
    resolveImageUrl: vi.fn((imageUrl: string | null) => imageUrl),
  };
  const auth = {
    getSession: vi.fn().mockReturnValue(of({ id: 1, email: 'admin@example.com', role: 'admin' as const })),
    logout: vi.fn().mockReturnValue(of({ status: 'success', message: 'Logged out.' })),
  };
  const toast = { show: vi.fn().mockResolvedValue(undefined) };
  let latestAlertOptions: TestAlertOptions | undefined;
  const alertController = {
    create: vi.fn((options: TestAlertOptions) => {
      latestAlertOptions = options;
      return Promise.resolve({ present: vi.fn() });
    }),
  };

  beforeEach(() => {
    auth.getSession.mockReset().mockReturnValue(of({ id: 1, email: 'admin@example.com', role: 'admin' as const }));
    auth.logout.mockReset().mockReturnValue(of({ status: 'success', message: 'Logged out.' }));
    api.getCars.mockReset();
    api.getCars.mockReturnValue(of([car]));
    api.getAdminCars.mockReset();
    api.getAdminCars.mockReturnValue(of([car]));
    api.updateCar.mockReset();
    api.updateCar.mockReturnValue(of({ message: 'Vehicle status updated.' }));
    api.updateAdminCar.mockReset();
    api.updateAdminCar.mockReturnValue(of({ message: 'Vehicle status updated.' }));
    api.createCar.mockReset();
    api.createCar.mockReturnValue(of({ id: 24, message: 'Vehicle added.' }));
    api.createAdminCar.mockReset();
    api.createAdminCar.mockReturnValue(of({ id: 24, message: 'Vehicle added.' }));
    api.deleteAdminCar.mockReset();
    api.deleteAdminCar.mockReturnValue(of({ message: 'Vehicle deleted.' }));
    toast.show.mockClear();
    alertController.create.mockClear();
    latestAlertOptions = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
        { provide: AlertController, useValue: alertController },
      ],
    });
    fixture = TestBed.createComponent(AdminPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders vehicles returned by the cars API', () => {
    expect(fixture.nativeElement.textContent).toContain(car.car_model);
    expect(fixture.nativeElement.textContent).toContain('AVAILABLE');
  });

  it('loads and renders every vehicle returned by the database', () => {
    const databaseCars = [car, { ...car, id: 4, car_model: 'BMW i8', plate_number: 'NDO 8180' }];
    api.getAdminCars.mockReset().mockReturnValue(of(databaseCars));
    fixture.destroy();
    fixture = TestBed.createComponent(AdminPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(api.getAdminCars).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelectorAll('.car-card')).toHaveLength(databaseCars.length);
    expect(fixture.nativeElement.textContent).toContain('BMW i8');
  });

  it('shows REMOVE only for vehicles in maintenance', () => {
    component.cars.set([
      car,
      { ...car, id: 4, car_model: 'RENTED CAR', status: 'Rented' },
      { ...car, id: 5, car_model: 'MAINTENANCE CAR', status: 'Maintenance' },
    ]);
    fixture.detectChanges();

    const removeButtons = fixture.nativeElement.querySelectorAll('.remove-button');
    expect(removeButtons).toHaveLength(1);
    expect(removeButtons[0].textContent.trim()).toBe('REMOVE');
    expect(removeButtons[0].getAttribute('aria-label')).toBe('Remove MAINTENANCE CAR');
  });

  it('confirms removal by car name before deleting the maintenance vehicle from the database', async () => {
    const maintenanceCar = { ...car, status: 'Maintenance' as const };
    component.cars.set([maintenanceCar]);

    await component.deleteCar(maintenanceCar);

    expect(alertController.create).toHaveBeenCalledWith({
      header: 'Confirm Remove',
      message: `Are you sure you want to remove this "${maintenanceCar.car_model}"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        expect.objectContaining({ text: 'Remove', role: 'confirm', handler: expect.any(Function) }),
      ],
    });
    expect(api.deleteAdminCar).not.toHaveBeenCalled();

    await latestAlertOptions?.buttons[1].handler?.();

    expect(api.deleteAdminCar).toHaveBeenCalledWith(maintenanceCar.id);
    expect(component.cars()).toEqual([]);
    expect(toast.show).toHaveBeenCalledWith('Vehicle deleted.');
  });

  it('does not delete a vehicle when the removal alert is cancelled', async () => {
    const maintenanceCar = { ...car, status: 'Maintenance' as const };

    await component.deleteCar(maintenanceCar);

    expect(latestAlertOptions?.buttons[0]).toEqual({ text: 'Cancel', role: 'cancel' });
    expect(api.deleteAdminCar).not.toHaveBeenCalled();
  });

  function attachPhoto(component: AdminPage): void {
    const photo = new File(['image data'], 'civic.png', { type: 'image/png' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [photo] });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:car-photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    component.onCarPhotoSelected({ currentTarget: input } as unknown as Event);
  }

  it('lets the custom toasts run instead of native form validation', () => {
    component.addCarOpen.set(true);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form.add-car-form');
    expect(form.hasAttribute('novalidate')).toBe(true);
  });

  it('shows a toast when any required field is empty', () => {
    attachPhoto(component);
    const validDraft: typeof component.newCarDraft = {
      car_model: 'HONDA CIVIC',
      year: 2025,
      engine: 'Hybrid',
      plate_number: 'ABC 1234',
      seating_capacity: 5,
      price: 25000,
      status: 'Available',
      image_url: null,
    };
    const cases: { field: keyof typeof validDraft; value: unknown; message: string }[] = [
      { field: 'car_model', value: '', message: 'Car model is required.' },
      { field: 'year', value: null, message: 'Enter a valid year.' },
      { field: 'engine', value: '', message: 'Engine is required.' },
      { field: 'plate_number', value: '', message: 'Plate number is required.' },
      { field: 'seating_capacity', value: null, message: 'Enter the number of seats.' },
      { field: 'price', value: null, message: 'Enter the price' },
    ];

    for (const testCase of cases) {
      api.createAdminCar.mockClear();
      toast.show.mockClear();
      component.newCarDraft = { ...validDraft, [testCase.field]: testCase.value } as typeof validDraft;

      component.submitNewCar();

      expect(api.createAdminCar).not.toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalledWith(testCase.message);
    }
  });

  it('requires a car photo before saving', () => {
    component.newCarDraft = {
      car_model: 'HONDA CIVIC',
      year: 2025,
      engine: 'Hybrid',
      plate_number: 'ABC 1234',
      seating_capacity: 5,
      price: 25000,
      status: 'Available',
      image_url: null,
    };

    component.submitNewCar();

    expect(api.createAdminCar).not.toHaveBeenCalled();
    expect(component.photoError()).toBe('Choose a car photo.');
    expect(toast.show).toHaveBeenCalledWith('A car photo is required.');
  });

  it('creates a vehicle and adds the saved database record to the dashboard', () => {
    attachPhoto(component);
    const newCar: typeof component.newCarDraft = {
      car_model: 'HONDA CIVIC',
      year: 2025,
      engine: 'Hybrid',
      plate_number: 'ABC 1234',
      seating_capacity: 5,
      price: 25000,
      status: 'Available',
      image_url: null,
    };
    component.newCarDraft = newCar;

    component.submitNewCar();

    expect(api.createAdminCar).toHaveBeenCalledWith(newCar, expect.any(File));
    expect(component.cars().map((vehicle) => vehicle.id)).toEqual([car.id, 24]);
    expect(component.cars()[1].car_model).toBe('HONDA CIVIC');
    expect(toast.show).toHaveBeenCalledWith('Vehicle added.');
  });

  it('shows the success toast returned by the server and keeps the new vehicle at the bottom', () => {
    attachPhoto(component);
    api.createAdminCar.mockReturnValueOnce(of({ id: 25, message: 'Successfully added Vahicle', image_url: null }));
    component.newCarDraft = {
      car_model: 'HONDA CIVIC',
      year: 2025,
      engine: 'Hybrid',
      plate_number: 'ABC 1234',
      seating_capacity: 5,
      price: 25000,
      status: 'Available',
      image_url: null,
    };

    component.submitNewCar();

    expect(toast.show).toHaveBeenCalledWith('Successfully added Vahicle');
    expect(component.cars().map((vehicle) => vehicle.id)).toEqual([car.id, 25]);
    expect(component.addCarOpen()).toBe(false);
  });

  it('uploads the selected vehicle photo and uses the saved image path', () => {
    const newCar: typeof component.newCarDraft = {
      car_model: 'HONDA CIVIC',
      year: 2025,
      engine: 'Hybrid',
      plate_number: 'ABC 1234',
      seating_capacity: 5,
      price: 25000,
      status: 'Available',
      image_url: null,
    };
    const photo = new File(['image data'], 'civic.png', { type: 'image/png' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [photo] });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:car-photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    api.createAdminCar.mockReturnValueOnce(
      of({ id: 24, message: 'Vehicle added.', image_url: '/uploads/cars/civic.png' }),
    );
    component.newCarDraft = newCar;
    component.onCarPhotoSelected({ currentTarget: input } as unknown as Event);

    component.submitNewCar();

    expect(api.createAdminCar).toHaveBeenCalledWith(newCar, photo);
    expect(component.cars()[1].image_url).toBe('/uploads/cars/civic.png');
  });

  it('rejects unsupported vehicle photo formats', () => {
    const photo = new File(['image data'], 'civic.gif', { type: 'image/gif' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [photo] });

    component.onCarPhotoSelected({ currentTarget: input } as unknown as Event);

    expect(component.selectedCarPhoto).toBeNull();
    expect(component.photoError()).toContain('JPEG, PNG, or WebP');
  });

  it('updates an available vehicle to maintenance', () => {
    component.updateStatus(car, 'Maintenance');

    expect(api.updateAdminCar).toHaveBeenCalledWith(car.id, {
      car_model: car.car_model,
      year: car.year,
      engine: car.engine,
      plate_number: car.plate_number,
      seating_capacity: car.seating_capacity,
      price: car.price,
      status: 'Maintenance',
      image_url: car.image_url,
    });
    expect(component.cars()[0].status).toBe('Maintenance');
    expect(toast.show).toHaveBeenCalledWith('Vehicle status updated.');
  });

  it('updates a vehicle price and saves the returned value', () => {
    api.updateAdminCar.mockReturnValueOnce(of({ message: 'Vehicle price updated.' }));
    component.setPriceDraft(car.id, 35000);
    component.savePrice(car);

    expect(api.updateAdminCar).toHaveBeenCalledWith(car.id, {
      car_model: car.car_model,
      year: car.year,
      engine: car.engine,
      plate_number: car.plate_number,
      seating_capacity: car.seating_capacity,
      price: 35000,
      status: car.status,
      image_url: car.image_url,
    });
    expect(component.cars()[0].price).toBe(35000);
    expect(toast.show).toHaveBeenCalledWith('Vehicle price updated.');
  });

  it('rejects a non-positive vehicle price', () => {
    component.setPriceDraft(car.id, 0);
    component.savePrice(car);

    expect(api.updateAdminCar).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Enter a price greater than zero.');
  });

  it('does not let the admin manually change a rented vehicle', () => {
    const rentedCar = { ...car, status: 'Rented' as const };

    component.updateStatus(rentedCar, 'Available');

    expect(api.updateAdminCar).not.toHaveBeenCalled();
  });

  it('redirects accounts without the admin role', () => {
    auth.getSession.mockReturnValueOnce(of({ id: 2, email: 'user@example.com', role: 'customer' }));
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.destroy();
    fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/login', { replaceUrl: true });
    expect(api.getAdminCars).toHaveBeenCalledTimes(1);
  });
});
