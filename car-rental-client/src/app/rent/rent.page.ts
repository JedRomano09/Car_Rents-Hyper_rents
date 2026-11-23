import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { ApiService } from '../services/api';
import { ToastService } from '../services/toast';
import { AuthService } from '../services/auth';

interface RentVehicle {
  id: number;
  name: string;
  year: string | null;
  engine: string | null;
  img: string;
  plate_number: string | null;
  seating_capacity: number | null;
  price: number | null;
  status: 'Available' | 'Rented' | 'Maintenance';
}

function isRentVehicle(value: unknown): value is RentVehicle {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const car = value as Record<string, unknown>;
  return (
    typeof car['id'] === 'number' &&
    typeof car['name'] === 'string' &&
    (typeof car['year'] === 'string' || car['year'] === null) &&
    (typeof car['engine'] === 'string' || car['engine'] === null) &&
    typeof car['img'] === 'string' &&
    (typeof car['plate_number'] === 'string' || car['plate_number'] === null) &&
    (typeof car['seating_capacity'] === 'number' || car['seating_capacity'] === null) &&
    (typeof car['price'] === 'number' || car['price'] === null) &&
    (car['status'] === 'Available' || car['status'] === 'Rented' || car['status'] === 'Maintenance')
  );
}

@Component({
  selector: 'app-rent',
  templateUrl: './rent.page.html',
  styleUrls: ['./rent.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule, FormsModule, RouterModule],
})
export class RentPage implements AfterViewInit, OnDestroy, OnInit {
  @ViewChild(IonContent) private content?: IonContent;

  readonly maxRentalDays = 365;

  selectedCar: RentVehicle | null;
  rentalDays = 1;
  customerId: number | null = null;
  customerLocation = '';
  validIdImage: File | null = null;
  validIdImagePreviewUrl: string | null = null;
  validIdImageError = '';
  isSubmitting = false;

  constructor(
    private router: Router,
    private api: ApiService,
    private auth: AuthService,
    private toast: ToastService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    const navigationCar = this.router.getCurrentNavigation()?.extras.state?.['selectedCar'];
    const historyCar = window.history.state?.['selectedCar'];
    this.selectedCar = [navigationCar, historyCar].find(isRentVehicle) ?? null;
  }

  ngOnInit(): void {
    const cachedUser = this.auth.getCurrentUser();
    if (cachedUser) {
      this.customerId = cachedUser.id;
    }

    this.auth.getSession().subscribe({
      next: (user) => {
        if (user) {
          this.customerId = user.id;
          this.changeDetector.markForCheck();
        }
      },
      error: (error) => {
        console.error('Could not verify the rental session.', error);
      },
    });
  }

  ngAfterViewInit(): void {
    void this.content?.scrollToTop(0);
  }

  ngOnDestroy(): void {
    this.clearValidIdImagePreview();
  }

  get hasValidRentalDays(): boolean {
    return Number.isInteger(this.rentalDays) && this.rentalDays > 0 && this.rentalDays <= this.maxRentalDays;
  }

  get estimatedTotal(): number {
    return (this.selectedCar?.price ?? 0) * (this.hasValidRentalDays ? this.rentalDays : 0);
  }

  get rentalBlocker(): string | null {
    if (this.selectedCar === null) {
      return 'No vehicle selected. Please choose a vehicle first.';
    }
    if (this.selectedCar.status !== 'Available') {
      return 'This vehicle is not currently available.';
    }
    if (this.selectedCar.price === null || this.selectedCar.price <= 0) {
      return 'Rental pricing is not configured for this vehicle yet.';
    }
    if (this.customerId === null) {
      return 'Please log in to submit a rental request.';
    }
    if (!this.hasValidRentalDays) {
      return `Enter between 1 and ${this.maxRentalDays} rental days.`;
    }
    if (this.customerLocation.trim().length === 0) {
      return 'Enter your current location.';
    }
    if (this.customerLocation.trim().length > 255) {
      return 'Location is too long.';
    }
    if (this.validIdImage === null) {
      return 'Upload a valid ID image.';
    }
    return null;
  }

  get canConfirmRental(): boolean {
    return this.rentalBlocker === null;
  }

  onValidIdImageChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const image = input.files?.[0] ?? null;
    this.clearValidIdImagePreview();
    this.validIdImage = null;
    this.validIdImageError = '';

    if (!image) {
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
      this.validIdImageError = 'Upload a JPEG, PNG, or WebP image.';
      input.value = '';
      return;
    }

    if (image.size > 5 * 1024 * 1024) {
      this.validIdImageError = 'The valid ID image must be 5 MB or smaller.';
      input.value = '';
      return;
    }

    this.validIdImage = image;
    this.validIdImagePreviewUrl = URL.createObjectURL(image);
  }

  confirmRental(): void {
    const blocker = this.rentalBlocker;
    if (blocker !== null) {
      void this.toast.show(blocker);
      return;
    }
    if (!this.selectedCar || !this.customerId || !this.validIdImage) {
      return;
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + this.rentalDays);
    this.isSubmitting = true;

    this.api
      .createBooking(
        {
          car_id: this.selectedCar.id,
          customer_id: this.customerId,
          start_date: this.formatDate(startDate),
          end_date: this.formatDate(endDate),
          customer_location: this.customerLocation.trim(),
        },
        this.validIdImage,
      )
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          void this.toast.show('Successfully rented!');
          this.changeDetector.markForCheck();
          void this.router.navigateByUrl('/profile', { replaceUrl: true });
        },
        error: (error) => {
          this.isSubmitting = false;
          console.error('Rental request error:', error);
          const serverMessage = error?.error?.detail?.message ?? error?.error?.message;
          const message =
            serverMessage === 'Invalid request.'
              ? 'The FastAPI booking endpoint could not read the upload.'
              : serverMessage || 'Unable to submit the rental request.';
          void this.toast.show(message);
          this.changeDetector.markForCheck();
        },
      });
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private clearValidIdImagePreview(): void {
    if (this.validIdImagePreviewUrl) {
      URL.revokeObjectURL(this.validIdImagePreviewUrl);
      this.validIdImagePreviewUrl = null;
    }
  }
}
