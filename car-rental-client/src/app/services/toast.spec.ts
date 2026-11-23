import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { ToastService } from './toast';

describe('ToastService', () => {
  it('shows a message without buttons and dismisses it automatically', async () => {
    const present = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue({ present });
    TestBed.configureTestingModule({
      providers: [{ provide: ToastController, useValue: { create } }],
    });
    const service = TestBed.inject(ToastService);

    await service.show('Login successful!');

    expect(create).toHaveBeenCalledWith({
      message: 'Login successful!',
      duration: 3500,
      position: 'top',
      cssClass: 'app-message-toast',
    });
    expect(present).toHaveBeenCalled();
  });
});
