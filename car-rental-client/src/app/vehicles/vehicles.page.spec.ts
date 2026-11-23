import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../services/api';
import { ToastService } from '../services/toast';
import { VehiclesPage } from './vehicles.page';

describe('VehiclesPage', () => {
  let component: VehiclesPage;
  let fixture: ComponentFixture<VehiclesPage>;
  const api = {
    getCars: vi.fn().mockReturnValue(of([])),
    getCar: vi.fn(),
    resolveImageUrl: vi.fn((imageUrl: string | null) => imageUrl),
  };
  const toast = { show: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    api.getCars.mockReset();
    api.getCars.mockReturnValue(of([]));
    api.getCar.mockReset();
    api.getCar.mockReturnValue(
      of({
        id: 3,
        car_model: 'TOYOTA SUPRA MK5',
        year: 2024,
        engine: 'Petrol',
        plate_number: 'NGA 5090',
        seating_capacity: 2,
        price: 30000,
        status: 'Available',
        image_url: null,
      }),
    );
    toast.show.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(VehiclesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('passes the selected car to the Rent page', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const selectedCar = component.allCars()[0];

    component.navigateTo(selectedCar);

    expect(navigate).toHaveBeenCalledWith(['/rent'], {
      state: { selectedCar },
    });
  });

  it('notifies and prevents navigation when the latest car status is rented', () => {
    api.getCar.mockReturnValue(
      of({
        id: 3,
        car_model: 'TOYOTA SUPRA MK5',
        year: 2024,
        engine: 'Petrol',
        plate_number: 'NGA 5090',
        seating_capacity: 2,
        price: 30000,
        status: 'Rented',
        image_url: null,
      }),
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    component.navigateTo(component.allCars()[0]);

    expect(toast.show).toHaveBeenCalledWith('This car is currently rented and unavailable.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('immediately prompts when the selected car is already marked rented', () => {
    const rentedCar = { ...component.allCars()[0], status: 'Rented' as const };

    component.navigateTo(rentedCar);

    expect(api.getCar).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('This car is currently rented and unavailable.');
  });

  it('shows the rented prompt when Rent Now is clicked for a rented car', () => {
    component.allCars.update((cars) =>
      cars.map((car, index) => (index === 0 ? { ...car, status: 'Rented' as const } : car)),
    );
    component.filteredCars.set(component.allCars());
    fixture.detectChanges();

    const rentButton = fixture.nativeElement.querySelector('.rent-button-card') as HTMLElement;
    rentButton.click();

    expect(api.getCar).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('This car is currently rented and unavailable.');
  });

  it('shows the maintenance prompt when Rent Now is clicked for a maintenance car', () => {
    component.allCars.update((cars) =>
      cars.map((car, index) => (index === 0 ? { ...car, status: 'Maintenance' as const } : car)),
    );
    component.filteredCars.set(component.allCars());
    fixture.detectChanges();

    const rentButton = fixture.nativeElement.querySelector('.rent-button-card') as HTMLElement;
    rentButton.click();

    expect(api.getCar).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('This car is under maintenance.');
  });

  it('notifies and prevents navigation when the latest car status is maintenance', () => {
    api.getCar.mockReturnValue(
      of({
        id: 3,
        car_model: 'TOYOTA SUPRA MK5',
        year: 2024,
        engine: 'Petrol',
        plate_number: 'NGA 5090',
        seating_capacity: 2,
        price: 30000,
        status: 'Maintenance',
        image_url: null,
      }),
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    component.navigateTo(component.allCars()[0]);

    expect(toast.show).toHaveBeenCalledWith('This car is under maintenance.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the existing cars visible with a price when the database has no records', () => {
    expect(component.allCars().length).toBe(20);
    expect(component.filteredCars().length).toBe(20);
    expect(component.allCars().map((car) => car.id)).toEqual(Array.from({ length: 20 }, (_, index) => index + 3));
    expect(component.allCars().every((car) => car.price !== null && car.price > 0)).toBe(true);
    const specs = fixture.nativeElement.querySelector('.specs').textContent;
    expect(specs).toContain('PLATE NUMBER');
    expect(specs).toContain('SEATING CAPACITY');
    expect(specs).not.toContain('0-100 KM/h');
    expect(specs).toContain('₱30,000');
    expect(fixture.nativeElement.textContent).toContain('Under ₱30k');
    expect(fixture.nativeElement.querySelector('ion-button.view-details')).toBeNull();
    const status = fixture.nativeElement.querySelector('.car-status');
    expect(status.textContent.trim()).toBe('Available');
    expect(status.classList.contains('status-available')).toBe(true);
    expect(component.allCars()[0].price).toBe(30000);
    expect(component.selectedSeatingCapacityLabel).toBe('Seating Capacity');
    expect(fixture.nativeElement.querySelectorAll('#seating-capacity-dropdown .filter-option')).toHaveLength(5);
  });

  it('updates the signal-backed car list with records from the API', () => {
    api.getCars.mockReturnValue(
      of([
        {
          id: 21,
          car_model: 'TOYOTA SUPRA MK5',
          year: 2023,
          engine: 'Petrol',
          plate_number: 'ABC-123',
          seating_capacity: 2,
          price: 20000,
          status: 'Available',
          image_url: null,
        },
      ]),
    );
    fixture.destroy();
    fixture = TestBed.createComponent(VehiclesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.allCars()).toHaveLength(1);
    expect(component.filteredCars()[0].id).toBe(21);
    expect(component.filteredCars()[0].name).toBe('TOYOTA SUPRA MK5');
    expect(component.filteredCars()[0].price).toBe(20000);
    expect(fixture.nativeElement.querySelector('.specs').textContent).toContain('ABC-123');
    expect(fixture.nativeElement.querySelector('.specs').textContent).toContain('₱20,000');
    const status = fixture.nativeElement.querySelector('.car-status');
    expect(status.textContent.trim()).toBe('Available');
    expect(status.classList.contains('status-available')).toBe(true);
  });

  it('displays available, rented, and maintenance vehicles returned by the API', () => {
    api.getCars.mockReturnValueOnce(
      of(
        (['Available', 'Rented', 'Maintenance'] as const).map((status, index) => ({
          id: index + 31,
          car_model: `TEST CAR ${status}`,
          year: 2025,
          engine: 'Hybrid',
          plate_number: `TEST-${index}`,
          seating_capacity: 4,
          price: 25000,
          status,
          image_url: null,
        })),
      ),
    );
    fixture.destroy();
    fixture = TestBed.createComponent(VehiclesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.allCars().map((car) => car.status)).toEqual(['Available', 'Rented', 'Maintenance']);
    expect(fixture.nativeElement.querySelectorAll('.car-card')).toHaveLength(3);
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.car-status'), (status: Element) => status.textContent.trim()),
    ).toEqual(['Available', 'Rented', 'Maintenance']);
  });

  it('reloads car status when returning to the cached Vehicles page', () => {
    const returnedCar = {
      id: 7,
      car_model: 'LAND CRUISER',
      year: 2024,
      engine: 'Diesel',
      plate_number: 'NHB 3001',
      seating_capacity: 7,
      price: 45000,
      status: 'Available' as const,
      image_url: null,
    };
    api.getCars.mockReturnValueOnce(of([returnedCar]));
    component.allCars.update((cars) =>
      cars.map((car) => (car.id === returnedCar.id ? { ...car, status: 'Rented' as const } : car)),
    );
    component.filteredCars.update((cars) =>
      cars.map((car) => (car.id === returnedCar.id ? { ...car, status: 'Rented' as const } : car)),
    );

    component.ionViewWillEnter();
    component.ionViewWillEnter();

    expect(api.getCars).toHaveBeenCalledTimes(2);
    expect(component.allCars().find((car) => car.id === returnedCar.id)?.status).toBe('Available');
    expect(component.filteredCars().find((car) => car.id === returnedCar.id)?.status).toBe('Available');
  });

  it('shows matching cars after Apply and restores all cars after Reset', () => {
    component.selectFilter('make', 'bmw', 'BMW');
    component.applyFilters();

    expect(component.filteredCars()).toHaveLength(2);
    expect(component.filteredCars().every((car) => car.make.toLowerCase() === 'bmw')).toBe(true);

    component.resetFilters();

    expect(component.filteredCars()).toHaveLength(20);
    expect(component.selectedMakeLabel).toBe('All Makes');
  });

  it('filters by seating capacity up to seven and resets the selection', () => {
    component.selectFilter('seatingCapacity', '7', '7 Seats');
    component.applyFilters();

    expect(component.filteredCars().length).toBeGreaterThan(0);
    expect(component.filteredCars().every((car) => car.seating_capacity === 7)).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('7 Seats');

    component.resetFilters();

    expect(component.filteredCars()).toHaveLength(20);
    expect(component.selectedSeatingCapacityLabel).toBe('Seating Capacity');
  });

  it('only offers the requested seating capacity options', () => {
    const container = fixture.nativeElement as HTMLElement;
    const options = container.querySelectorAll<HTMLDivElement>('#seating-capacity-dropdown .filter-option');
    const labels = Array.from(options, (option) => option.textContent?.trim() ?? '');

    expect(labels).toEqual(['All Seating Capacities', '2 Seats', '4 Seats', '5 Seats', '7 Seats']);
  });

  it('filters vehicles by the 2013 year option', () => {
    expect(fixture.nativeElement.querySelector('#year-dropdown').textContent).toContain('2013');

    component.selectFilter('year', '2013', '2013');
    component.applyFilters();

    expect(component.filteredCars().length).toBeGreaterThan(0);
    expect(component.filteredCars().every((car) => car.year === '2013')).toBe(true);
  });

  it('has vehicles in each displayed price range', () => {
    const ranges = [
      { value: 'under30', label: 'Under ₱30k' },
      { value: '30-50', label: '₱30k - ₱50k' },
      { value: '50-80', label: '₱50k - ₱80k' },
      { value: 'over80', label: 'Over ₱80k' },
    ];

    for (const range of ranges) {
      component.selectFilter('price', range.value, range.label);
      component.applyFilters();
      expect(component.filteredCars().length).toBeGreaterThan(0);
    }
  });
});
