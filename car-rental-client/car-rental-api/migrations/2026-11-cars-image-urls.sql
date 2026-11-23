UPDATE cars
SET image_url = CASE id
    WHEN 3 THEN 'assets/icon/TOYOTA SUPRA MK5.png'
    WHEN 4 THEN 'assets/icon/BMW I8.png'
    WHEN 5 THEN 'assets/icon/BMW 135i.png'
    WHEN 6 THEN 'assets/icon/SUBARU STI.png'
    WHEN 7 THEN 'assets/icon/LAND CRUISER.png'
    WHEN 8 THEN 'assets/icon/LEXUS LX600.png'
    WHEN 9 THEN 'assets/icon/LAMBORGHINI-URUS.png'
    WHEN 10 THEN 'assets/icon/MERCEDEZ-BENZ-Z-G63.png'
    WHEN 11 THEN 'assets/icon/MITSUBISHI LANCER GT.png'
    WHEN 12 THEN 'assets/icon/CHEVROLLETE CORVET-C8.png'
    WHEN 13 THEN 'assets/icon/lambo.png'
    WHEN 14 THEN 'assets/icon/lambi.jpg'
    WHEN 15 THEN 'assets/icon/TOYOTA-GT86.png'
    WHEN 16 THEN 'assets/icon/MAZDA MX-5.png'
    WHEN 17 THEN 'assets/icon/SUPRA MK4.png'
    WHEN 18 THEN 'assets/icon/SUZUKI-G-MINI.png'
    WHEN 19 THEN 'assets/icon/MCLAREN-720S-SPIDER.png'
    WHEN 20 THEN 'assets/icon/FORD BRONCO.png'
    WHEN 21 THEN 'assets/icon/T.png'
    WHEN 22 THEN 'assets/icon/P.png'
END
WHERE id BETWEEN 3 AND 22
  AND image_url IS NULL;
