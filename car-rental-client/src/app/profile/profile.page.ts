import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AlertController, IonContent, IonHeader, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowUndoOutline,
  carOutline,
  closeOutline,
  logOutOutline,
  menuOutline,
  personCircleOutline,
  timeOutline,
} from 'ionicons/icons';

import { ApiService } from '../services/api';
import type { Booking } from '../services/api';
import { AuthService } from '../services/auth';

interface ProfileRental extends Booking {
  carName: string;
  carImage: string;
  rentalDays: number;
  displayStatus: string;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, IonContent, IonHeader, IonIcon],
})
export class ProfilePage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  private readonly changeDetector = inject(ChangeDetectorRef);

  displayName = 'Guest';
  rentals: ProfileRental[] = [];
  isLoading = false;
  errorMessage = '';
  isMenuOpen = false;

  private currentUserId: number | null = null;

  constructor() {
    addIcons({
      carOutline,
      closeOutline,
      logOutOutline,
      menuOutline,
      personCircleOutline,
      timeOutline,
      arrowUndoOutline,
    });
  }

  get activeRentals(): number {
    return this.rentals.filter((rental) => rental.status === 'Pending' || rental.status === 'Approved').length;
  }

  ionViewWillEnter(): void {
    this.isLoading = true;
    this.errorMessage = '';
    const loginUser = this.auth.currentUser();
    if (loginUser?.role.trim().toLowerCase() === 'customer') {
      this.currentUserId = loginUser.id;
      this.displayName = loginUser.username?.trim() || loginUser.email;
      this.loadRentals();
      return;
    }

    if (loginUser?.role.trim().toLowerCase() === 'admin') {
      this.isLoading = false;
      void this.router.navigateByUrl('/admin', { replaceUrl: true });
      return;
    }

    this.auth.getSession().subscribe({
      next: (user) => {
        if (!user || user.role.trim().toLowerCase() !== 'customer') {
          this.currentUserId = null;
          this.rentals = [];
          this.isLoading = false;
          this.errorMessage = 'Please log in to view your rentals.';
          this.changeDetector.markForCheck();
          void this.router.navigateByUrl(user?.role === 'admin' ? '/admin' : '/login', { replaceUrl: true });
          return;
        }

        this.currentUserId = user.id;
        this.displayName = user.username?.trim() || user.email;
        this.loadRentals();
      },
      error: (error: unknown) => {
        console.error('Could not verify the customer session.', error);
        this.currentUserId = null;
        this.rentals = [];
        this.isLoading = false;
        this.errorMessage = 'Could not verify your session. Please log in again.';
        this.changeDetector.markForCheck();
        void this.router.navigateByUrl('/login', { replaceUrl: true });
      },
    });
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  isReturnable(rental: ProfileRental): boolean {
    return rental.status === 'Pending' || rental.status === 'Approved';
  }

  async confirmReturn(rental: ProfileRental): Promise<void> {
    if (!this.isReturnable(rental)) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Confirm return',
      message: `Are you sure you want to return ${rental.carName}?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Return',
          role: 'confirm',
          handler: () => this.returnRental(rental),
        },
      ],
    });
    await alert.present();
  }

  loadRentals(): void {
    if (this.currentUserId === null) {
      this.rentals = [];
      this.errorMessage = 'Please log in to view your rentals.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.api.getBookings().subscribe({
      next: (bookings) => {
        this.rentals = bookings
          .filter((booking) => booking.customer_id === this.currentUserId && booking.status !== 'Completed')
          .map((booking) => ({
            ...booking,
            carName: booking.car_name || `Car #${booking.car_id}`,
            carImage: this.api.resolveImageUrl(booking.car_image) || 'assets/icon/favicon.png',
            rentalDays: this.getRentalDays(booking),
            displayStatus: booking.status === 'Pending' || booking.status === 'Approved' ? 'Active' : booking.status,
          }))
          .sort((first, second) => (second.created_at ?? '').localeCompare(first.created_at ?? ''));
        this.isLoading = false;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        console.error('Could not load profile rentals.', error);
        this.errorMessage = 'Could not load your rentals. Please try again.';
        this.isLoading = false;
        this.changeDetector.markForCheck();
      },
    });
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login', { replaceUrl: true }),
      error: (error: unknown) => {
        console.error('Could not log out.', error);
        void this.showLogoutError();
      },
    });
  }

  private returnRental(rental: ProfileRental): void {
    this.api
      .updateBooking(rental.id, {
        car_id: rental.car_id,
        customer_id: rental.customer_id,
        start_date: rental.start_date,
        end_date: rental.end_date,
        status: 'Completed',
      })
      .subscribe({
        next: () => {
          this.rentals = this.rentals.filter((currentRental) => currentRental.id !== rental.id);
          this.changeDetector.markForCheck();
        },
        error: (error: unknown) => {
          console.error('Could not return the rental.', error);
          void this.showReturnError();
        },
      });
  }

  private async showReturnError(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Return failed',
      message: 'Could not return this car. Please try again.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async showLogoutError(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Logout failed',
      message: 'Could not log out. Please try again.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  private getRentalDays(booking: Booking): number {
    const start = Date.parse(`${booking.start_date}T00:00:00`);
    const end = Date.parse(`${booking.end_date}T00:00:00`);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return 1;
    }

    return Math.max(1, Math.ceil((end - start) / 86400000));
  }
}
