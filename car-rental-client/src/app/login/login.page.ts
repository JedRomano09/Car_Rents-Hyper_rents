import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { ToastService } from '../services/toast';
import { AuthService } from '../services/auth';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
  IonInput,
  IonButton,
} from '@ionic/angular';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
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
export class LoginPage {
  email: string = '';
  password: string = '';
  isSubmitting: boolean = false;

  constructor(
    private router: Router,
    private auth: AuthService,
    private toast: ToastService,
  ) {}

  onLogin() {
    if (this.isSubmitting) {
      return;
    }

    const cleanEmail = this.email.trim();
    if (!cleanEmail || !this.password) {
      void this.toast.show('Pakilagay ang email at password.');
      return;
    }

    this.isSubmitting = true;
    this.auth
      .login(cleanEmail, this.password)
      .pipe(
        timeout(8000),
        finalize(() => {
          this.isSubmitting = false;
        }),
      )
      .subscribe({
        next: (response) => {
          if (response.status !== 'success' || !response.user) {
            void this.toast.show(response.message || 'Wrong email orpassword.');
            return;
          }

          const role = (response.user.role || 'customer').trim().toLowerCase();
          const targetRoute = role === 'admin' ? ['/admin'] : ['/home'];

          void this.toast.show(response.message || 'Login successful!');
          void this.router.navigate(targetRoute, { replaceUrl: true });
        },
        error: (error: unknown) => {
          console.error('API Error:', error);

          let message = 'Server connection failed. Please check your backend.';

          if (error instanceof HttpErrorResponse) {
            const detail = error.error?.detail;
            if (typeof detail === 'string' && detail.trim()) {
              message = detail;
            } else if (
              typeof detail === 'object' &&
              detail !== null &&
              typeof detail.message === 'string'
            ) {
              message = detail.message;
            } else if (typeof error.error?.message === 'string' && error.error.message.trim()) {
              message = error.error.message;
            } else if (error.status === 401 || error.status === 400) {
              message = 'Mali ang email o password.';
            }
          } else if (
            error &&
            typeof error === 'object' &&
            (error as { name?: string }).name === 'TimeoutError'
          ) {
            message = 'The connection to the backend timed out.';
          }

          void this.toast.show(message);
        },
      });
  }
}