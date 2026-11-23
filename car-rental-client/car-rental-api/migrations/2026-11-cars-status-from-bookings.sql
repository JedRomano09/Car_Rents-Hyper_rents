UPDATE cars AS c
SET c.status = 'Rented'
WHERE c.status = 'Available'
  AND EXISTS (
    SELECT 1
    FROM bookings AS b
    WHERE b.car_id = c.id
      AND b.status IN ('Pending', 'Approved')
  );
