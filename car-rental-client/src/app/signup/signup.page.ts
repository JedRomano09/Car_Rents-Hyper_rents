import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonInput, IonItem, IonList, IonTitle, IonToolbar } from '@ionic/angular';
import { finalize } from 'rxjs';

import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonList,
    IonItem,
    IonInput,
    IonButton,
    CommonModule,
    FormsModule,
    RouterModule,
  ],
})
export class SignupPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  username: string = '';
  email: string = '';
  password: string = '';
  isSubmitting = false;

  onSignup(): void {
    if (this.isSubmitting) {
      return;
    }

    const username = this.username.trim();
    const email = this.email.trim().toLowerCase();
    if (!username || username.length > 64 || !email || !this.password) {
      void this.toast.show('the email and password is empty');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      void this.toast.show('Please enter a valid email address.');
      return;
    }

    this.isSubmitting = true;
    this.auth
      .signup(username, email, this.password)
      .pipe(finalize(() => (this.isSubmitting = false)))
      .subscribe({
        next: (response) => {
          if (response.status === 'success') {
            void this.toast.show('Signup successful! You can now log in.');
            void this.router.navigate(['/login'], { replaceUrl: true });
          } else {
            void this.toast.show(response.message || 'Could not create your account.');
          }
        },
        error: (error: unknown) => {
          console.error('API Error:', error);
          const detail = error instanceof HttpErrorResponse ? error.error?.detail : null;
          const message =
            typeof detail === 'object' && detail !== null && typeof detail.message === 'string'
              ? detail.message
              : error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
                ? error.error.message
                : 'Server connection failed. Please check your backend.';
          void this.toast.show(message);
        },
      });
  }
}
