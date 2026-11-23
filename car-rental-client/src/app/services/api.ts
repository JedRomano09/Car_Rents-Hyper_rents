import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export const API_BASE_URL = 'http://localhost:8000';
export type CarStatus = 'Available' | 'Rented' | 'Maintenance';
export type BookingStatus = 'Pending' | 'Approved' | 'Completed' | 'Cancelled';

export interface Car {
  id: number;
  car_model: string;
  year: number;
  engine: string;
  plate_number: string;
  seating_capacity: number;
  price: number;
  status: CarStatus;
  image_url: string | null;
}

export interface CarCreate {
  car_model: string;
  year: number;
  engine: string;
  plate_number: string;
  seating_capacity: number;
  price: number;
  status?: CarStatus;
  image_url?: string | null;
}

export interface CarCreateResponse {
  id: number;
  message: string;
  image_url?: string | null;
}

export type CarUpdate = Omit<Car, 'id'>;

export interface Booking {
  id: number;
  car_id: number;
  customer_id: number;
  start_date: string;
  end_date: string;
  total_price: number;
  status: BookingStatus;
  created_at?: string;
  car_name?: string | null;
  car_image?: string | null;
  customer_location?: string;
  valid_id_image?: string | null;
}

export interface BookingCreate {
  car_id: number;
  customer_id: number;
  start_date: string;
  end_date: string;
  customer_location: string;
}

export interface BookingUpdate {
  car_id: number;
  customer_id: number;
  start_date: string;
  end_date: string;
  status: BookingStatus;
}

export interface ApiMessage {
  message: string;
  id?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = API_BASE_URL;

  getCars(): Observable<Car[]> {
    return this.http.get<Car[]>(`${this.apiUrl}/vehicles`, { withCredentials: true });
  }

  getAdminCars(): Observable<Car[]> {
    return this.http.get<Car[]>(`${this.apiUrl}/admin/cars`, { withCredentials: true });
  }

  getCar(id: number): Observable<Car> {
    return this.http.get<Car>(`${this.apiUrl}/cars/${id}`, { withCredentials: true });
  }

  createCar(car: CarCreate, photo?: File): Observable<CarCreateResponse> {
    return this.http.post<CarCreateResponse>(`${this.apiUrl}/cars`, this.carFormData(car, photo), {
      withCredentials: true,
    });
  }

  createAdminCar(car: CarCreate, photo?: File): Observable<CarCreateResponse> {
    return this.http.post<CarCreateResponse>(`${this.apiUrl}/admin/cars`, this.carFormData(car, photo), {
      withCredentials: true,
    });
  }

  private carFormData(car: CarCreate, photo?: File): FormData {
    const formData = new FormData();
    formData.append('car_model', car.car_model);
    formData.append('year', String(car.year));
    formData.append('engine', car.engine);
    formData.append('plate_number', car.plate_number);
    formData.append('seating_capacity', String(car.seating_capacity));
    formData.append('price', String(car.price));
    formData.append('status', car.status ?? 'Available');
    if (car.image_url) {
      formData.append('image_url', car.image_url);
    }
    if (photo) {
      formData.append('photo', photo);
    }
    return formData;
  }

  resolveImageUrl(imageUrl: string | null | undefined): string | null {
    if (!imageUrl) {
      return null;
    }
    if (imageUrl.startsWith('/uploads/')) {
      return `${this.apiUrl}${imageUrl}`;
    }
    return imageUrl;
  }

  updateCar(id: number, car: CarUpdate): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.apiUrl}/cars/${id}`, car, { withCredentials: true });
  }

  updateAdminCar(id: number, car: CarUpdate): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.apiUrl}/admin/cars/${id}`, car, { withCredentials: true });
  }

  deleteCar(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.apiUrl}/cars/${id}`, { withCredentials: true });
  }

  deleteAdminCar(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.apiUrl}/admin/cars/${id}`, { withCredentials: true });
  }

  getBookings(): Observable<Booking[]> {
    return this.http.get<Booking[]>(`${this.apiUrl}/bookings`, { withCredentials: true });
  }

  getBooking(id: number): Observable<Booking> {
    return this.http.get<Booking>(`${this.apiUrl}/bookings/${id}`, { withCredentials: true });
  }

  createBooking(booking: BookingCreate, validIdImage: File): Observable<ApiMessage> {
    const formData = new FormData();
    formData.append('car_id', String(booking.car_id));
    formData.append('customer_id', String(booking.customer_id));
    formData.append('start_date', booking.start_date);
    formData.append('end_date', booking.end_date);
    formData.append('customer_location', booking.customer_location);
    formData.append('valid_id_image', validIdImage);
    return this.http.post<ApiMessage>(`${this.apiUrl}/bookings`, formData, { withCredentials: true });
  }

  updateBooking(id: number, booking: BookingUpdate): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.apiUrl}/bookings/${id}`, booking, { withCredentials: true });
  }

  deleteBooking(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.apiUrl}/bookings/${id}`, { withCredentials: true });
  }
}
