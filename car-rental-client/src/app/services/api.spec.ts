import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiService } from './api';

describe('ApiService', () => {
  let service: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('supports car create, read, update, and delete requests', () => {
    const car = {
      id: 8,
      car_model: 'Toyota Supra',
      year: 2023,
      engine: 'Petrol',
      plate_number: 'ABC-123',
      seating_capacity: 2,
      price: 15000,
      status: 'Available' as const,
      image_url: null,
    };

    service.getCars().subscribe();
    const listRequest = http.expectOne('http://localhost:8000/vehicles');
    expect(listRequest.request.method).toBe('GET');
    expect(listRequest.request.withCredentials).toBe(true);
    listRequest.flush([car]);

    service.getCar(car.id).subscribe();
    const readRequest = http.expectOne(`http://localhost:8000/cars/${car.id}`);
    expect(readRequest.request.method).toBe('GET');
    expect(readRequest.request.withCredentials).toBe(true);
    readRequest.flush(car);

    const { id, ...carUpdate } = car;
    const photo = new File(['image data'], 'car-photo.jpg', { type: 'image/jpeg' });
    service.createCar(carUpdate, photo).subscribe();
    const createRequest = http.expectOne('http://localhost:8000/cars');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.withCredentials).toBe(true);
    expect(createRequest.request.body).toBeInstanceOf(FormData);
    const createForm = createRequest.request.body as FormData;
    expect(createForm.get('car_model')).toBe('Toyota Supra');
    expect(createForm.get('price')).toBe('15000');
    expect(createForm.get('photo')).toBe(photo);
    createRequest.flush({ id: 9, message: 'Car created.', image_url: '/uploads/cars/car-photo.jpg' });

    service.updateCar(id, carUpdate).subscribe();
    const updateRequest = http.expectOne(`http://localhost:8000/cars/${id}`);
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.withCredentials).toBe(true);
    updateRequest.flush({ message: 'Car updated.' });

    service.deleteCar(id).subscribe();
    const deleteRequest = http.expectOne(`http://localhost:8000/cars/${id}`);
    expect(deleteRequest.request.method).toBe('DELETE');
    expect(deleteRequest.request.withCredentials).toBe(true);
    deleteRequest.flush({ message: 'Car deleted.' });
  });

  it('uses admin endpoints for managing all vehicle records', () => {
    const car = {
      car_model: 'Toyota Supra',
      year: 2023,
      engine: 'Petrol',
      plate_number: 'ABC-123',
      seating_capacity: 2,
      price: 15000,
      status: 'Available' as const,
      image_url: null,
    };
    const photo = new File(['image data'], 'car-photo.jpg', { type: 'image/jpeg' });

    service.getAdminCars().subscribe();
    const listRequest = http.expectOne('http://localhost:8000/admin/cars');
    expect(listRequest.request.method).toBe('GET');
    expect(listRequest.request.withCredentials).toBe(true);
    listRequest.flush([]);

    service.createAdminCar(car, photo).subscribe();
    const createRequest = http.expectOne('http://localhost:8000/admin/cars');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.withCredentials).toBe(true);
    expect(createRequest.request.body).toBeInstanceOf(FormData);
    expect((createRequest.request.body as FormData).get('photo')).toBe(photo);
    createRequest.flush({ id: 9, message: 'Vehicle added.', image_url: '/uploads/cars/car-photo.jpg' });

    service.updateAdminCar(9, { ...car }).subscribe();
    const updateRequest = http.expectOne('http://localhost:8000/admin/cars/9');
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.withCredentials).toBe(true);
    updateRequest.flush({ message: 'Vehicle updated.' });

    service.deleteAdminCar(9).subscribe();
    const deleteRequest = http.expectOne('http://localhost:8000/admin/cars/9');
    expect(deleteRequest.request.method).toBe('DELETE');
    expect(deleteRequest.request.withCredentials).toBe(true);
    deleteRequest.flush({ message: 'Vehicle deleted.' });
  });

  it('resolves uploaded vehicle photos through the FastAPI server', () => {
    expect(service.resolveImageUrl('/uploads/cars/car-photo.jpg')).toBe(
      'http://localhost:8000/uploads/cars/car-photo.jpg',
    );
    expect(service.resolveImageUrl('assets/cars/fallback.jpg')).toBe('assets/cars/fallback.jpg');
    expect(service.resolveImageUrl(null)).toBeNull();
  });

  it('supports booking create, read, update, and delete requests', () => {
    const booking = {
      id: 4,
      car_id: 8,
      customer_id: 3,
      start_date: '2026-11-15',
      end_date: '2026-11-17',
      total_price: 30000,
      status: 'Pending' as const,
      customer_location: 'Makati City',
    };

    service.getBookings().subscribe();
    const listRequest = http.expectOne('http://localhost:8000/bookings');
    expect(listRequest.request.method).toBe('GET');
    expect(listRequest.request.withCredentials).toBe(true);
    listRequest.flush([booking]);

    service.getBooking(booking.id).subscribe();
    const readRequest = http.expectOne(`http://localhost:8000/bookings/${booking.id}`);
    expect(readRequest.request.method).toBe('GET');
    expect(readRequest.request.withCredentials).toBe(true);
    readRequest.flush(booking);

    const { id, total_price: _totalPrice, ...bookingUpdate } = booking;
    const validIdImage = new File(['id image'], 'valid-id.png', { type: 'image/png' });
    service.createBooking(bookingUpdate, validIdImage).subscribe();
    const createRequest = http.expectOne('http://localhost:8000/bookings');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.withCredentials).toBe(true);
    expect(createRequest.request.body).toBeInstanceOf(FormData);
    expect((createRequest.request.body as FormData).get('customer_location')).toBe('Makati City');
    expect((createRequest.request.body as FormData).get('valid_id_image')).toBe(validIdImage);
    createRequest.flush({ message: 'Booking created.' });

    service.updateBooking(id, bookingUpdate).subscribe();
    const updateRequest = http.expectOne(`http://localhost:8000/bookings/${id}`);
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.withCredentials).toBe(true);
    updateRequest.flush({ message: 'Booking updated.' });

    service.deleteBooking(id).subscribe();
    const deleteRequest = http.expectOne(`http://localhost:8000/bookings/${id}`);
    expect(deleteRequest.request.method).toBe('DELETE');
    expect(deleteRequest.request.withCredentials).toBe(true);
    deleteRequest.flush({ message: 'Booking deleted.' });
  });
});
