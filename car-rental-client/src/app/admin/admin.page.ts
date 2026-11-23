import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AlertController, IonContent, IonHeader } from '@ionic/angular';

import { ApiService } from '../services/api';
import type { Car, CarCreate, CarStatus } from '../services/api';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, IonContent, IonHeader],
})
export class AdminPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly alertController = inject(AlertController);

  cars = signal<Car[]>([]);
  priceDrafts = signal<Record<number, number | null>>({});
  addCarOpen = signal(false);
  isSavingNewCar = signal(false);
  isLoading = signal(false);
  updatingCarId = signal<number | null>(null);
  errorMessage = signal('');
  photoPreviewUrl = signal<string | null>(null);
  photoError = signal('');
  selectedCarPhoto: File | null = null;
  newCarDraft: CarCreate = this.emptyCarDraft();

  ngOnDestroy(): void {
    this.clearSelectedPhoto();
  }

  ngOnInit(): void {
    this.isLoading.set(true);
    this.auth.getSession().subscribe({
      next: (user) => {
        if (!user || user.role.trim().toLowerCase() !== 'admin') {
          this.isLoading.set(false);
          void this.router.navigateByUrl('/login', { replaceUrl: true });
          return;
        }

        this.loadCars();
      },
      error: (error: unknown) => {
        console.error('Could not verify admin session.', error);
        this.isLoading.set(false);
        void this.toast.show('Could not verify your session. Please log in again.');
        void this.router.navigateByUrl('/login', { replaceUrl: true });
      },
    });
  }

  updateStatus(car: Car, status: CarStatus): void {
    if (car.status === 'Rented' || (status !== 'Available' && status !== 'Maintenance')) {
      return;
    }

    if (status === car.status) {
      return;
    }

    this.updatingCarId.set(car.id);
    const { id, ...carUpdate } = car;
    this.api.updateAdminCar(id, { ...carUpdate, status }).subscribe({
      next: (response) => {
        this.cars.update((cars) => cars.map((current) => (current.id === id ? { ...current, status } : current)));
        this.updatingCarId.set(null);
        void this.toast.show(response.message || 'Vehicle status updated.');
      },
      error: (error: unknown) => {
        console.error('Could not update vehicle status.', error);
        this.cars.update((cars) => cars.map((current) => (current.id === id ? { ...current } : current)));
        this.updatingCarId.set(null);
        void this.toast.show('Could not update vehicle status. Please try again.');
      },
    });
  }

  setPriceDraft(carId: number, price: number | null): void {
    this.priceDrafts.update((drafts) => ({ ...drafts, [carId]: price }));
  }

  hasPriceChanged(car: Car): boolean {
    const price = this.priceDrafts()[car.id];
    return price !== undefined && price !== car.price;
  }

  savePrice(car: Car): void {
    const price = this.priceDrafts()[car.id];
    if (price === undefined || price === null || !Number.isFinite(price) || price <= 0) {
      void this.toast.show('Enter a price greater than zero.');
      return;
    }

    if (price === car.price) {
      return;
    }

    this.updatingCarId.set(car.id);
    const { id, ...carUpdate } = car;
    this.api.updateAdminCar(id, { ...carUpdate, price }).subscribe({
      next: (response) => {
        this.cars.update((cars) => cars.map((current) => (current.id === id ? { ...current, price } : current)));
        this.priceDrafts.update((drafts) => ({ ...drafts, [id]: price }));
        this.updatingCarId.set(null);
        void this.toast.show(response.message || 'Vehicle price updated.');
      },
      error: (error: unknown) => {
        console.error('Could not update vehicle price.', error);
        this.priceDrafts.update((drafts) => ({ ...drafts, [id]: car.price }));
        this.updatingCarId.set(null);
        void this.toast.show('Could not update vehicle price. Please try again.');
      },
    });
  }

  async deleteCar(car: Car): Promise<void> {
    if (car.status !== 'Maintenance') {
      void this.toast.show('Only vehicles in Maintenance can be deleted.');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Confirm Remove',
      message: `Are you sure you want to remove this "${car.car_model}"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'confirm',
          handler: () => this.removeCar(car),
        },
      ],
    });
    await alert.present();
  }

  private removeCar(car: Car): void {
    this.updatingCarId.set(car.id);
    this.api.deleteAdminCar(car.id).subscribe({
      next: (response) => {
        this.cars.update((cars) => cars.filter((current) => current.id !== car.id));
        this.updatingCarId.set(null);
        void this.toast.show(response.message || 'Vehicle deleted.');
      },
      error: (error: unknown) => {
        console.error('Could not delete vehicle.', error);
        this.updatingCarId.set(null);
        void this.toast.show(this.getApiErrorMessage(error) || 'Could not delete vehicle. Please try again.');
      },
    });
  }

  toggleAddCarForm(): void {
    if (this.addCarOpen()) {
      this.clearSelectedPhoto();
    }
    this.addCarOpen.update((open) => !open);
  }

  onCarPhotoSelected(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const photo = input.files?.[0];
    this.clearSelectedPhoto();
    if (!photo) {
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(photo.type) || photo.size > 5 * 1024 * 1024) {
      this.photoError.set('Choose a JPEG, PNG, or WebP photo up to 5 MB.');
      input.value = '';
      return;
    }

    this.selectedCarPhoto = photo;
    this.photoPreviewUrl.set(URL.createObjectURL(photo));
  }

  carPhotoUrl(imageUrl: string | null): string {
    return this.api.resolveImageUrl(imageUrl) ?? 'assets/icon/favicon.png';
  }

  submitNewCar(): void {
    const payload: CarCreate = {
      ...this.newCarDraft,
      car_model: this.newCarDraft.car_model.trim(),
      engine: this.newCarDraft.engine.trim(),
      plate_number: this.newCarDraft.plate_number.trim(),
      image_url: null,
    };

    if (!payload.car_model) {
      void this.toast.show('Car model is required.');
      return;
    }
    if (payload.car_model.length > 100) {
      void this.toast.show('Car model is too long.');
      return;
    }
    if (!payload.year || !Number.isInteger(payload.year) || payload.year < 1901 || payload.year > 2155) {
      void this.toast.show('Enter a valid year.');
      return;
    }
    if (!payload.engine) {
      void this.toast.show('Engine is required.');
      return;
    }
    if (payload.engine.length > 100) {
      void this.toast.show('Engine is too long.');
      return;
    }
    if (!payload.plate_number) {
      void this.toast.show('Plate number is required.');
      return;
    }
    if (payload.plate_number.length > 50) {
      void this.toast.show('Plate number is too long.');
      return;
    }
    if (!payload.seating_capacity || !Number.isInteger(payload.seating_capacity) || payload.seating_capacity < 1) {
      void this.toast.show('Enter the number of seats.');
      return;
    }
    if (!payload.price || !Number.isFinite(payload.price) || payload.price <= 0) {
      void this.toast.show('Enter the price');
      return;
    }
    if (!this.selectedCarPhoto) {
      this.photoError.set('Choose a car photo.');
      void this.toast.show('A car photo is required.');
      return;
    }

    if (this.isSavingNewCar()) {
      return;
    }

    this.isSavingNewCar.set(true);
    this.api.createAdminCar(payload, this.selectedCarPhoto ?? undefined).subscribe({
      next: (response) => {
        this.cars.update((cars) => [
          ...cars,
          {
            ...payload,
            status: payload.status ?? 'Available',
            image_url: response.image_url ?? payload.image_url ?? null,
            id: response.id,
          },
        ]);
        this.isSavingNewCar.set(false);
        this.addCarOpen.set(false);
        this.clearSelectedPhoto();
        this.newCarDraft = this.emptyCarDraft();
        void this.toast.show(response.message || 'Successfully added Vahicle');
      },
      error: (error: unknown) => {
        console.error('Could not add vehicle.', error);
        this.isSavingNewCar.set(false);
        void this.toast.show(
          this.getApiErrorMessage(error) || 'Could not add vehicle. Check that the plate number is unique.',
        );
      },
    });
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login', { replaceUrl: true }),
      error: (error: unknown) => {
        console.error('Could not log out.', error);
        void this.toast.show('Could not log out. Please try again.');
      },
    });
  }

  private loadCars(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.api.getAdminCars().subscribe({
      next: (cars) => {
        this.cars.set(cars);
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('Could not load vehicles for admin.', error);
        this.errorMessage.set('Could not load vehicles. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  private emptyCarDraft(): CarCreate {
    return {
      car_model: '',
      year: new Date().getFullYear(),
      engine: '',
      plate_number: '',
      seating_capacity: 4,
      price: 0,
      status: 'Available',
      image_url: null,
    };
  }

  private clearSelectedPhoto(): void {
    const previewUrl = this.photoPreviewUrl();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    this.photoPreviewUrl.set(null);
    this.selectedCarPhoto = null;
    this.photoError.set('');
  }

  private getApiErrorMessage(error: unknown): string | undefined {
    if (!(error instanceof HttpErrorResponse)) {
      return undefined;
    }

    const body: unknown = error.error;
    if (typeof body !== 'object' || body === null) {
      return undefined;
    }

    if ('detail' in body) {
      const detail = body.detail;
      if (typeof detail === 'object' && detail !== null && 'message' in detail) {
        return typeof detail.message === 'string' ? detail.message : undefined;
      }
    }

    return 'message' in body && typeof body.message === 'string' ? body.message : undefined;
  }
}
