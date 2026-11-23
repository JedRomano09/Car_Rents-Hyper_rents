import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  constructor(private readonly toastController: ToastController) {}

  async show(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3500,
      position: 'top',
      cssClass: 'app-message-toast',
    });
    await toast.present();
  }
}
