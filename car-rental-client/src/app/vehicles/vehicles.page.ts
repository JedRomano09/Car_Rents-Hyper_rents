import { Component, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import {
  IonContent,
  IonHeader,
  IonButton,
  IonIcon,
  IonImg,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  menuOutline,
  personCircleOutline,
  closeOutline,
  chevronBackOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { ApiService, Car } from '../services/api';
import { ToastService } from '../services/toast';

interface VehicleCard {
  id: number;
  name: string;
  make: string;
  model: string;
  year: string | null;
  engine: string | null;
  img: string;
  plate_number: string | null;
  seating_capacity: number | null;
  price: number | null;
  status: Car['status'];
}

@Component({
  selector: 'app-vehicles',
  templateUrl: './vehicles.page.html',
  styleUrls: ['./vehicles.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IonContent,
    IonHeader,
    IonButton,
    IonIcon,
    IonImg,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class VehiclesPage implements OnInit, OnDestroy {
  @ViewChild(IonContent) private content!: IonContent;

  isMenuOpen = false;
  checkingCarId: number | null = null;
  private hasEntered = false;
  currentSlide = 0;
  slideInterval: any;
  activeDropdown = '';

  selectedMake = '';
  selectedEngine = '';
  selectedSeatingCapacity: number | null = null;
  selectedYear = '';
  selectedPrice = '';

  selectedMakeLabel = 'All Makes';
  selectedSeatingCapacityLabel = 'Seating Capacity';
  selectedYearLabel = 'All Years';
  selectedPriceLabel = 'All Prices';
  selectedEngineLabel = 'All Engines';

  seatingCapacityOptions: number[] = [2, 4, 5, 7];

  allCars = signal<VehicleCard[]>([
    {
      id: 3,
      name: 'TOYOTA SUPRA MK5',
      make: 'Toyota',
      model: 'Supra',
      year: '2024',
      engine: 'Petrol',
      plate_number: 'NGA 5090',
      seating_capacity: 2,
      price: 30000,
      status: 'Available',
      img: 'assets/icon/TOYOTA SUPRA MK5.png',
    },
    {
      id: 4,
      name: 'BMW i8',
      make: 'BMW',
      model: 'i8',
      year: '2020',
      engine: 'Hybrid',
      plate_number: 'NDO 8180',
      seating_capacity: 4,
      price: 35000,
      status: 'Available',
      img: 'assets/icon/BMW I8.png',
    },
    {
      id: 5,
      name: 'BMW 135I',
      make: 'BMW',
      model: '135i',
      year: '2013',
      engine: 'Petrol',
      plate_number: 'NBE 1350',
      seating_capacity: 4,
      price: 18000,
      status: 'Available',
      img: 'assets/icon/BMW 135i.png',
    },
    {
      id: 6,
      name: 'SUBARU STI',
      make: 'Subaru',
      model: 'WRX STI',
      year: '2021',
      engine: 'Petrol',
      plate_number: 'NFJ 2540',
      seating_capacity: 5,
      price: 25000,
      status: 'Available',
      img: 'assets/icon/SUBARU STI.png',
    },
    {
      id: 7,
      name: 'LAND CRUISER',
      make: 'Toyota',
      model: 'Land Cruiser',
      year: '2024',
      engine: 'Diesel',
      plate_number: 'NHB 3001',
      seating_capacity: 7,
      price: 45000,
      status: 'Available',
      img: 'assets/icon/LAND CRUISER.png',
    },
    {
      id: 8,
      name: 'LEXUS LX600',
      make: 'LEXUS',
      model: 'LX600',
      year: '2024',
      engine: 'Petrol',
      plate_number: 'NHC 6001',
      seating_capacity: 7,
      price: 50000,
      status: 'Available',
      img: 'assets/icon/LEXUS LX600.png',
    },
    {
      id: 9,
      name: 'LAMBORGHINI URUS',
      make: 'LAMBORGHINI',
      model: 'URUS',
      year: '2024',
      engine: 'Petrol',
      plate_number: 'NHD 7001',
      seating_capacity: 5,
      price: 90000,
      status: 'Available',
      img: 'assets/icon/LAMBORGHINI-URUS.png',
    },
    {
      id: 10,
      name: 'MERCEDEZ BENZ G63',
      make: 'MERCEDEZ BENZ',
      model: 'G63',
      year: '2024',
      engine: 'Petrol',
      plate_number: 'NHE 8063',
      seating_capacity: 5,
      price: 70000,
      status: 'Available',
      img: 'assets/icon/MERCEDEZ-BENZ-Z-G63.png',
    },
    {
      id: 11,
      name: 'MITSUBISHI LANCER GT',
      make: 'MITSUBISHI',
      model: 'LANCER GT',
      year: '2016',
      engine: 'Petrol',
      plate_number: 'NAA 9016',
      seating_capacity: 5,
      price: 18000,
      status: 'Available',
      img: 'assets/icon/MITSUBISHI LANCER GT.png',
    },
    {
      id: 12,
      name: 'CHEVROLLETE CORVET C8',
      make: 'chevrolet',
      model: 'corvette',
      year: '2024',
      engine: 'Petrol',
      plate_number: 'NHF 1008',
      seating_capacity: 2,
      price: 85000,
      status: 'Available',
      img: 'assets/icon/CHEVROLLETE CORVET-C8.png',
    },

    {
      id: 13,
      name: 'LAMBORGHINI HURACAN',
      make: 'LAMBORGHINI',
      model: 'HURACAN',
      year: '2024',
      engine: 'Petrol',
      plate_number: 'NHG 1101',
      seating_capacity: 2,
      price: 95000,
      status: 'Available',
      img: 'assets/icon/lambo.png',
    },
    {
      id: 14,
      name: 'LAMBORGHINI DIABLO',
      make: 'LAMBORGHINI',
      model: 'DIABLO',
      year: '2001',
      engine: 'Petrol',
      plate_number: 'XAA 1201',
      seating_capacity: 2,
      price: 110000,
      status: 'Available',
      img: 'assets/icon/lambi.jpg',
    },
    {
      id: 15,
      name: 'TOYOTA GT86',
      make: 'toyota',
      model: 'GT86',
      year: '2020',
      engine: 'Petrol',
      plate_number: 'NDO 1386',
      seating_capacity: 4,
      price: 20000,
      status: 'Available',
      img: 'assets/icon/TOYOTA-GT86.png',
    },
    {
      id: 16,
      name: 'MAZDA MX-5',
      make: 'MAZDA',
      model: 'MX-5',
      year: '2024',
      engine: 'Petrol',
      plate_number: 'NHH 1405',
      seating_capacity: 2,
      price: 22000,
      status: 'Available',
      img: 'assets/icon/MAZDA MX-5.png',
    },
    {
      id: 17,
      name: 'TOYOTA SUPRA MK4',
      make: 'toyota',
      model: 'supra',
      year: '1998',
      engine: 'Petrol',
      plate_number: 'WAA 1598',
      seating_capacity: 4,
      price: 40000,
      status: 'Available',
      img: 'assets/icon/SUPRA MK4.png',
    },
    {
      id: 18,
      name: 'SUZUKI-G MINI',
      make: 'SUZUKI',
      model: 'G-MINI',
      year: '2024',
      engine: 'Petrol',
      plate_number: 'NHI 1601',
      seating_capacity: 4,
      price: 15000,
      status: 'Available',
      img: 'assets/icon/SUZUKI-G-MINI.png',
    },
    {
      id: 19,
      name: 'MCLAREN 720S',
      make: 'MCLAREN',
      model: '720S SPRIDER',
      year: '2023',
      engine: 'Petrol',
      plate_number: 'NFK 1720',
      seating_capacity: 2,
      price: 100000,
      status: 'Available',
      img: 'assets/icon/MCLAREN-720S-SPIDER.png',
    },
    {
      id: 20,
      name: 'FORD BRONCO',
      make: 'FORD',
      model: 'BRONCO',
      year: '2024',
      engine: 'Petrol',
      plate_number: 'NHJ 1801',
      seating_capacity: 5,
      price: 35000,
      status: 'Available',
      img: 'assets/icon/FORD BRONCO.png',
    },
    {
      id: 21,
      name: 'TESLA MODEL 3',
      make: 'TESLA',
      model: 'MODEL3',
      year: '2024',
      engine: 'Electric',
      plate_number: 'NHK 1903',
      seating_capacity: 5,
      price: 35000,
      status: 'Available',
      img: 'assets/icon/T.png',
    },
    {
      id: 22,
      name: 'PORSCHE TAYCAN',
      make: 'PORSCHE',
      model: 'TAYCAN',
      year: '2024',
      engine: 'Electric',
      plate_number: 'NHL 2001',
      seating_capacity: 4,
      price: 60000,
      status: 'Available',
      img: 'assets/icon/P.png',
    },
  ]);

  filteredCars = signal<VehicleCard[]>(this.allCars());

  constructor(
    private router: Router,
    private api: ApiService,
    private toast: ToastService,
  ) {
    addIcons({
      menuOutline,
      personCircleOutline,
      closeOutline,
      chevronBackOutline,
      chevronForwardOutline,
    });
  }

  ngOnInit() {
    this.startSlideShow();
    this.loadCars();
  }

  ionViewWillEnter() {
    if (this.hasEntered) {
      this.loadCars();
    }
    this.hasEntered = true;
  }

  ngOnDestroy() {
    if (this.slideInterval) {
      clearInterval(this.slideInterval);
    }
  }

  private loadCars() {
    this.api.getCars().subscribe({
      next: (cars) => {
        if (cars.length === 0) {
          return;
        }

        const vehicles = cars.map((car) => this.toVehicleCard(car));
        this.allCars.set(vehicles);
        this.filteredCars.set(vehicles);
      },
      error: (error) => {
        console.error('Cars API Error:', error);
        void this.toast.show('Unable to load cars from the server.');
      },
    });
  }

  private toVehicleCard(car: Car): VehicleCard {
    const sample = this.allCars().find((vehicle) => vehicle.name.toLowerCase() === car.car_model.toLowerCase());
    if (sample) {
      return {
        ...sample,
        id: car.id,
        year: String(car.year),
        engine: car.engine,
        img: this.api.resolveImageUrl(car.image_url) || sample.img,
        plate_number: car.plate_number,
        seating_capacity: car.seating_capacity,
        price: Number(car.price),
        status: car.status,
      };
    }

    const modelParts = car.car_model.trim().split(/\s+/);
    return {
      id: car.id,
      name: car.car_model.toUpperCase(),
      make: modelParts[0]?.toLowerCase() ?? '',
      model: modelParts.slice(1).join(' ').toLowerCase(),
      year: String(car.year),
      engine: car.engine,
      img: this.api.resolveImageUrl(car.image_url) || 'assets/icon/favicon.png',
      plate_number: car.plate_number,
      seating_capacity: car.seating_capacity,
      price: Number(car.price),
      status: car.status,
    };
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  navigateTo(target: string | VehicleCard) {
    if (typeof target === 'string') {
      this.router.navigate([`/${target}`]);
      return;
    }

    if (this.checkingCarId !== null) {
      return;
    }

    if (target.status === 'Rented') {
      void this.toast.show('This car is currently rented and unavailable.');
      return;
    }
    if (target.status === 'Maintenance') {
      void this.toast.show('This car is under maintenance.');
      return;
    }

    this.checkingCarId = target.id;
    this.api.getCar(target.id).subscribe({
      next: (car) => {
        this.checkingCarId = null;
        const freshCar = this.toVehicleCard(car);
        this.allCars.update((cars) => cars.map((current) => (current.id === freshCar.id ? freshCar : current)));
        this.filteredCars.update((cars) => cars.map((current) => (current.id === freshCar.id ? freshCar : current)));

        if (freshCar.status === 'Rented') {
          void this.toast.show('This car is currently rented and unavailable.');
          return;
        }
        if (freshCar.status === 'Maintenance') {
          void this.toast.show('This car is under maintenance.');
          return;
        }

        this.router.navigate(['/rent'], {
          state: { selectedCar: freshCar },
        });
      },
      error: (error) => {
        this.checkingCarId = null;
        console.error('Could not check vehicle availability:', error);
        void this.toast.show('Could not check vehicle availability. Please try again.');
      },
    });
  }

  logout() {
    this.router.navigate(['/login']);
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

  toggleDropdown(dropdownId: string) {
    this.activeDropdown = this.activeDropdown === dropdownId ? '' : dropdownId;
  }

  selectFilter(type: string, value: string, label: string) {
    if (type === 'make') {
      this.selectedMake = value;
      this.selectedMakeLabel = label;
    }
    if (type === 'engine') {
      this.selectedEngine = value;
      this.selectedEngineLabel = label;
    }
    if (type === 'seatingCapacity') {
      this.selectedSeatingCapacity = value ? Number(value) : null;
      this.selectedSeatingCapacityLabel = label;
    }
    if (type === 'year') {
      this.selectedYear = value;
      this.selectedYearLabel = label;
    }
    if (type === 'price') {
      this.selectedPrice = value;
      this.selectedPriceLabel = label;
    }

    this.activeDropdown = '';
  }

  applyFilters() {
    const normalize = (value: string | null) => value?.trim().toLowerCase() ?? '';

    this.filteredCars.set(
      this.allCars().filter((car) => {
        const matchesMake = this.selectedMake ? normalize(car.make) === normalize(this.selectedMake) : true;
        const matchesEngine = this.selectedEngine ? normalize(car.engine) === normalize(this.selectedEngine) : true;
        const matchesSeatingCapacity =
          this.selectedSeatingCapacity === null || car.seating_capacity === this.selectedSeatingCapacity;
        const matchesYear = this.selectedYear ? normalize(car.year) === normalize(this.selectedYear) : true;

        let matchesPrice = true;
        if (this.selectedPrice === 'under30') {
          matchesPrice = car.price !== null && car.price < 30000;
        } else if (this.selectedPrice === '30-50') {
          matchesPrice = car.price !== null && car.price >= 30000 && car.price <= 50000;
        } else if (this.selectedPrice === '50-80') {
          matchesPrice = car.price !== null && car.price > 50000 && car.price <= 80000;
        } else if (this.selectedPrice === 'over80') {
          matchesPrice = car.price !== null && car.price > 80000;
        }

        return matchesMake && matchesEngine && matchesSeatingCapacity && matchesYear && matchesPrice;
      }),
    );
  }

  resetFilters() {
    this.selectedMake = '';
    this.selectedEngine = '';
    this.selectedSeatingCapacity = null;
    this.selectedYear = '';
    this.selectedPrice = '';

    this.selectedMakeLabel = 'All Makes';
    this.selectedSeatingCapacityLabel = 'Seating Capacity';
    this.selectedYearLabel = 'All Years';
    this.selectedPriceLabel = 'All Prices';
    this.selectedEngineLabel = 'All Engines';

    this.filteredCars.set([...this.allCars()]);
    this.activeDropdown = '';
  }

  goToDetails(carId: number) {
    this.router.navigate(['/car-details', carId]);
  }
}
