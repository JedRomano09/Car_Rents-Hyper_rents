import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ToastService } from '../services/toast';
import { AuthService } from '../services/auth';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonList, IonItem, IonInput, IonButton } from '@ionic/angular';

@Component({
  selector: 'app-forgetpass',
  templateUrl: './forgetpass.page.html',
  styleUrls: ['./forgetpass.page.scss'],
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
export class ForgetpassPage {
  email: string = '';
  newPassword: string = '';

  constructor(
    private auth: AuthService,
    private toast: ToastService,
  ) {}

  onResetPassword() {
    if ((!this.email || !this.email.trim()) && (!this.newPassword || !this.newPassword.trim())) {
      void this.toast.show('the email and password is empty');
      return;
    }

    if (!this.email || !this.email.trim()) {
      void this.toast.show('the email is empty');
      return;
    }

    if (!this.newPassword || !this.newPassword.trim()) {
      void this.toast.show('the passwordl is empty');
      return;
    }

    this.auth.changePassword(this.email.trim(), this.newPassword).subscribe({
      next: (response) => {
        void this.toast.show(response.message || 'Successfully Change Password, Wait for the Admin Approval.');
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
