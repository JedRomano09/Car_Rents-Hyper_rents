import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon } from '@ionic/angular';
import { AuthService } from '../services/auth';
import { ToastService } from '../services/toast';
import { addIcons } from 'ionicons';
import { 
  menuOutline, 
  personCircleOutline, 
  closeOutline, 
  chevronBackOutline, 
  chevronForwardOutline 
} from 'ionicons/icons';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule,
    RouterLink,
    IonContent,
    IonButton,
    IonIcon
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class HomePage implements OnInit, OnDestroy {
  @ViewChild(IonContent) private content!: IonContent;

  isMenuOpen = false;
  currentSlide = 0;
  slideInterval: any;

  selectedMake = '';
  selectedEngine = '';

  showcases = [
    {
      name: 'NISSAN GTR R35',
      img: 'assets/icon/GTR_33.png',
      year: '2024',
      flag: 'assets/icon/japan.png.webp',
      country: 'JP',
      engine: '3.8L Twin-Turbo V6',
      accel: '2.7s',
      hp: '600 HP',
      topSpeed: '330 KM/h',
      torque: '652 Nm'
    },
    {
      name: 'LAMBORGHINI HURACAN',
      img: 'assets/icon/lambo.png',
      year: '2023',
      flag: 'assets/icon/italy.png',
      country: 'IT',
      engine: '5.2L Naturally Aspirated V10',
      accel: '2.9s',
      hp: '640 HP',
      topSpeed: '325 KM/h',
      torque: '600 Nm'
    },
    {
      name: 'LAMBORGHINI URUS',
      img: 'assets/icon/LAMBORGHINI-URUS.png',
      year: '2023',
      flag: 'assets/icon/italy.png',
      country: 'IT',
      engine: '4.0L Petrol',
      accel: '2.3s',
      hp: '657 HP',
      topSpeed: '305 KM/h',
      torque: '850 NM'
    },
    {
      name: 'LEXUS LX600',
      img: 'assets/icon/LEXUS LX600.png',
      year: '2023',
      flag: 'assets/icon/japan.png.webp',
      country: 'JP',
      engine: '3.5L Petrol',
      accel: '6.9s',
      hp: '409 HP',
      topSpeed: '210 KM/h',
      torque: '652 Nm'
    }
  ];

  allCars = [
    {
      id: 1,
      name: 'Toyota GR Supra',
      make: 'toyota',
      engine: 'petrol',
      img: 'assets/icon/BMW 135i.png',
      year: '2023',
      flag: 'assets/icon/japan.png.webp',
      country: 'Japan',
      accel: '4.1s',
      hp: '382 HP',
      topSpeed: '250 KM/h',
      torque: '500 Nm',
      price: 15000
    }
  ];

  filteredCars = [...this.allCars];

  constructor(
    private router: Router,
    private auth: AuthService,
    private toast: ToastService,
  ) {
    addIcons({
      menuOutline,
      personCircleOutline,
      closeOutline,
      chevronBackOutline,
      chevronForwardOutline
    });
  }

  ngOnInit() {
    this.startSlideShow();
  }

  ngOnDestroy() {
    if (this.slideInterval) {
      clearInterval(this.slideInterval);
    }
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  navigateTo(route: string) {
    this.router.navigate([`/${route}`]);
  }

  logout() {
    this.auth.logout().subscribe({
      next: () => void this.router.navigateByUrl('/login', { replaceUrl: true }),
      error: (error: unknown) => {
        console.error('Could not log out.', error);
        void this.toast.show('Could not log out. Please try again.');
      },
    });
  }

  scrollToSection(sectionId: string) {
    if (sectionId === 'contact') {
      void this.content.scrollToBottom(400);
      return;
    }

    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  startSlideShow() {
    this.slideInterval = setInterval(() => {
      this.nextSlide();
    }, 5000);
  }

  nextSlide() {
    const slides = document.querySelectorAll('.slides img');
    if (slides.length === 0) return;

    slides[this.currentSlide].classList.remove('active');
    this.currentSlide = (this.currentSlide + 1) % slides.length;
    slides[this.currentSlide].classList.add('active');
  }

  prevSlide() {
    const slides = document.querySelectorAll('.slides img');
    if (slides.length === 0) return;

    slides[this.currentSlide].classList.remove('active');
    this.currentSlide = (this.currentSlide - 1 + slides.length) % slides.length;
    slides[this.currentSlide].classList.add('active');
  }

  applyFilters() {
    this.filteredCars = this.allCars.filter(car => {
      const matchesMake = this.selectedMake ? car.make === this.selectedMake : true;
      const matchesEngine = this.selectedEngine ? car.engine === this.selectedEngine : true;
      return matchesMake && matchesEngine;
    });
  }

  resetFilters() {
    this.selectedMake = '';
    this.selectedEngine = '';
    this.filteredCars = [...this.allCars];
  }

  goToDetails(carId: number) {
    this.router.navigate(['/car-details', carId]);
  }
}