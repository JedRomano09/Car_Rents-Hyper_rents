import os
import secrets
import warnings
from decimal import Decimal
from pathlib import Path
from typing import Literal
from uuid import uuid4
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from pydantic import BaseModel
from datetime import date
import mysql.connector
import bcrypt

app = FastAPI(title="Car Rental System API", version="1.0")


@app.exception_handler(mysql.connector.Error)
async def handle_mysql_error(_request: Request, error: mysql.connector.Error):
    message = "Database request failed. Check XAMPP MySQL and the car_rental_db schema."
    if os.getenv("APP_ENV", "development").lower() != "production":
        message = f"{message} MySQL error {getattr(error, 'errno', None)}: {getattr(error, 'msg', error)}"
    return JSONResponse(status_code=503, content={"detail": {"message": message}})


session_secret = os.getenv("SESSION_SECRET_KEY")
if not session_secret:
    session_key_directory = Path(
        os.getenv("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))
    ) / "HyperRents"
    session_key_file = session_key_directory / "session.key"
    try:
        session_key_directory.mkdir(parents=True, exist_ok=True)
        try:
            with session_key_file.open("x", encoding="utf-8") as key_file:
                key_file.write(secrets.token_urlsafe(32))
        except FileExistsError:
            pass
        session_secret = session_key_file.read_text(encoding="utf-8").strip()
        if not session_secret:
            session_secret = secrets.token_urlsafe(32)
            session_key_file.write_text(session_secret, encoding="utf-8")
    except OSError as e:
        session_secret = secrets.token_urlsafe(32)
        warnings.warn(
            f"Could not persist the local session key ({e}); sessions will expire on backend restart.",
            RuntimeWarning,
            stacklevel=1,
        )

app.add_middleware(
    SessionMiddleware,
    secret_key=session_secret,
    same_site="lax",
    https_only=False,
)

# CORS Middleware (allow Ionic/Angular app to connect to FastAPI)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8100",
        "http://127.0.0.1:8100",
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
CAR_UPLOADS_DIR = UPLOADS_DIR / "cars"
CAR_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


# Password hashing helpers using bcrypt directly
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False


def get_db_connection():
    try:
        return mysql.connector.connect(
            host="127.0.0.1",
            port=3306,
            user="root",
            password="",  
            database="car_rental_db",
            connection_timeout=5,
            autocommit=False,
            use_pure=True,
        )
    except mysql.connector.Error as error:
        raise HTTPException(
            status_code=503,
            detail={"message": "Cannot connect to MySQL. Start XAMPP MySQL and check car_rental_db."},
        ) from error


# --- PYDANTIC MODELS ---

class UserCreate(BaseModel):
    username: str
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    email: str
    new_password: str


class CarCreate(BaseModel):
    owner_id: int
    car_model: str
    plate_number: str
    seating_capacity: int
    daily_rate: float
    image_url: str


class AdminCarUpdate(BaseModel):
    car_model: str | None = None
    year: int | None = None
    engine: str | None = None
    plate_number: str | None = None
    seating_capacity: int | None = None
    price: float | None = None
    status: Literal["Available", "Rented", "Maintenance"] | None = None
    image_url: str | None = None


class BookingCreate(BaseModel):
    car_id: int
    customer_id: int
    start_date: date
    end_date: date
    total_price: float


class BookingStatusUpdate(BaseModel):
    status: Literal["Pending", "Approved", "Completed", "Cancelled"]


# --- HEALTH CHECK ---

@app.get("/health")
def health_check():
    return {"status": "ok"}


def require_admin(request: Request):
    user = request.session.get("user")
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=401, detail="Admin login required.")
    return user


def require_authenticated_user(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Login required.")
    return user


def valid_image_contents(content_type: str, contents: bytes) -> bool:
    if content_type == "image/jpeg":
        return contents.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return contents.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return len(contents) >= 12 and contents[:4] == b"RIFF" and contents[8:12] == b"WEBP"
    return False


# ---  AUTHENTICATION ENDPOINTS (SIGNUP & LOGIN) ---

@app.post("/auth/signup", status_code=201)
@app.post("/signup", status_code=201, include_in_schema=False)
def signup(user: UserCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        clean_username = user.username.strip()
        clean_email = user.email.strip().lower()

        if not clean_username or len(clean_username) > 64 or not clean_email or not user.password:
            raise HTTPException(status_code=400, detail="Username, email, and password are required.")

        cursor.execute(
            """
            SELECT id FROM user
            WHERE LOWER(email) = %s OR LOWER(username) = LOWER(%s)
            LIMIT 1
            """,
            (clean_email, clean_username),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email or username is already registered.")

        hashed_password = hash_password(user.password)

        query = "INSERT INTO user (username, email, password, role) VALUES (%s, %s, %s, 'customer')"
        cursor.execute(query, (clean_username, clean_email, hashed_password))
        conn.commit()

        return {"status": "success", "message": "Signup successful!"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.post("/auth/login")
def login(user: UserLogin, request: Request):
    print("[LOGIN] 1. Connecting to MySQL...")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        identifier = user.email.strip().lower()

        if not identifier or not user.password:
            raise HTTPException(status_code=400, detail="Email/username and password are required.")

        print("[LOGIN] 2. Fetching user...")
        cursor.execute(
            """
            SELECT * FROM user
            WHERE LOWER(email) = %s OR LOWER(COALESCE(username, '')) = %s
            LIMIT 1
            """,
            (identifier, identifier),
        )
        db_user = cursor.fetchone()

        if not db_user:
            print("[LOGIN] User not found")
            raise HTTPException(status_code=401, detail="Invalid email/username or password.")

        print("[LOGIN] 3. Verifying password...")
        if not verify_password(user.password, db_user["password"]):
            print("[LOGIN] Password mismatch")
            raise HTTPException(status_code=401, detail="Invalid email/username or password.")

        role = (db_user.get("role") or "customer").strip().lower()
        print("[LOGIN] 4. Login success for user_id:", db_user["id"])

        session_user = {
            "id": db_user["id"],
            "email": db_user["email"],
            "username": db_user.get("username"),
            "role": role,
        }
        request.session["user"] = session_user

        return {
            "status": "success",
            "message": "Login successful!",
            "user": session_user,
        }
    except HTTPException:
        conn.rollback()
        raise
    except mysql.connector.Error:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print("[LOGIN] ERROR:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.get("/auth/session")
def get_session(request: Request):
    return request.session.get("user")


@app.post("/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "success", "message": "Logged out."}


@app.post("/auth/change-password")
def change_password(req: ChangePasswordRequest):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        clean_email = req.email.strip().lower()
        if not clean_email or not req.new_password:
            raise HTTPException(status_code=400, detail="Email and new password are required.")

        cursor.execute(
            "SELECT id FROM user WHERE LOWER(email) = %s LIMIT 1",
            (clean_email,),
        )
        db_user = cursor.fetchone()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found.")

        hashed_pw = hash_password(req.new_password)
        cursor.execute(
            "UPDATE user SET password = %s WHERE id = %s",
            (hashed_pw, db_user["id"]),
        )
        conn.commit()

        return {"status": "success", "message": "Password updated successfully!"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# --- CAR ENDPOINTS (CRUD) ---

@app.get("/admin/cars")
def get_admin_cars(request: Request):
    require_admin(request)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM cars ORDER BY id DESC")
        return cursor.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.post("/admin/cars", status_code=201)
async def add_admin_car(
    request: Request,
    car_model: str = Form(...),
    year: int = Form(...),
    engine: str = Form(...),
    plate_number: str = Form(...),
    seating_capacity: int = Form(...),
    price: float = Form(...),
    status: str = Form("Available"),
    image_url: str | None = Form(default=None),
    photo: UploadFile | None = File(default=None),
):
    require_admin(request)

    clean_model = car_model.strip()
    clean_engine = engine.strip()
    clean_plate = plate_number.strip()
    if (
        not clean_model
        or len(clean_model) > 100
        or not clean_engine
        or len(clean_engine) > 100
        or not clean_plate
        or len(clean_plate) > 50
        or not 1901 <= year <= 2155
        or seating_capacity < 1
        or price <= 0
        or status != "Available"
    ):
        raise HTTPException(status_code=400, detail="Enter valid vehicle details.")

    saved_photo = None
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if photo and photo.filename:
            extensions = {
                "image/jpeg": ".jpg",
                "image/png": ".png",
                "image/webp": ".webp",
            }
            extension = extensions.get(photo.content_type or "")
            if not extension:
                raise HTTPException(status_code=400, detail="Choose a JPEG, PNG, or WebP photo.")

            contents = await photo.read(5 * 1024 * 1024 + 1)
            if len(contents) > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Photo must be 5 MB or smaller.")

            filename = f"{uuid4().hex}{extension}"
            saved_photo = CAR_UPLOADS_DIR / filename
            saved_photo.write_bytes(contents)
            image_url = f"/uploads/cars/{filename}"

        cursor.execute(
            """
            INSERT INTO cars
                (car_model, year, engine, plate_number, seating_capacity, price, image_url, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'Available')
            """,
            (
                clean_model,
                year,
                clean_engine,
                clean_plate,
                seating_capacity,
                price,
                image_url,
            ),
        )
        car_id = cursor.lastrowid
        conn.commit()
        return {
            "id": car_id,
            "message": "Vehicle added.",
            "image_url": image_url,
        }
    except HTTPException:
        conn.rollback()
        if saved_photo and saved_photo.exists():
            saved_photo.unlink()
        raise
    except Exception as e:
        conn.rollback()
        if saved_photo and saved_photo.exists():
            saved_photo.unlink()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.put("/admin/cars/{car_id}")
def update_admin_car(car_id: int, update: AdminCarUpdate, request: Request):
    require_admin(request)
    changes = update.dict(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No vehicle changes were provided.")
    if changes.get("price") is not None and changes["price"] <= 0:
        raise HTTPException(status_code=400, detail="Price must be greater than zero.")
    if changes.get("year") is not None and not 1901 <= changes["year"] <= 2155:
        raise HTTPException(status_code=400, detail="Enter a valid vehicle year.")
    if changes.get("seating_capacity") is not None and changes["seating_capacity"] < 1:
        raise HTTPException(status_code=400, detail="Seating capacity must be at least one.")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM cars WHERE id = %s LIMIT 1", (car_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Vehicle not found.")

        assignments = ", ".join(f"`{column}` = %s" for column in changes)
        values = tuple(changes.values()) + (car_id,)
        cursor.execute(f"UPDATE cars SET {assignments} WHERE id = %s", values)
        conn.commit()
        return {"message": "Vehicle updated."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.delete("/admin/cars/{car_id}")
def delete_admin_car(car_id: int, request: Request):
    require_admin(request)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM cars WHERE id = %s AND status = 'Maintenance'",
            (car_id,),
        )
        if cursor.rowcount != 1:
            raise HTTPException(
                status_code=400,
                detail="Only vehicles in Maintenance can be deleted.",
            )
        conn.commit()
        return {"message": "Vehicle deleted."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.post("/cars/", status_code=201)
def add_car(car: CarCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            INSERT INTO cars (owner_id, car_model, plate_number, seating_capacity, daily_rate, image_url, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'Available')
        """
        values = (
            car.owner_id,
            car.car_model,
            car.plate_number,
            car.seating_capacity,
            car.daily_rate,
            car.image_url,
        )
        cursor.execute(query, values)
        conn.commit()
        return {"message": "Car listed successfully!"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.get("/cars/")
def get_cars():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM cars WHERE status = 'Available'")
        return cursor.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.get("/vehicles")
def get_all_vehicles():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM cars ORDER BY id DESC")
        return cursor.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.get("/cars/{car_id}")
def get_car(car_id: int):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM cars WHERE id = %s LIMIT 1", (car_id,))
        car = cursor.fetchone()
        if not car:
            raise HTTPException(status_code=404, detail="Vehicle not found.")
        return car
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.put("/cars/{car_id}")
def update_car(car_id: int, daily_rate: float, status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = "UPDATE cars SET daily_rate = %s, status = %s WHERE id = %s"
        cursor.execute(query, (daily_rate, status, car_id))
        conn.commit()
        return {"message": "Car updated successfully!"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.delete("/cars/{car_id}")
def delete_car(car_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM cars WHERE id = %s", (car_id,))
        conn.commit()
        return {"message": "Car listing deleted successfully!"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


# --- 2. BOOKING ENDPOINTS ---

@app.post("/bookings/", status_code=201)
def create_booking(booking: BookingCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            INSERT INTO bookings (car_id, customer_id, start_date, end_date, total_price, status)
            VALUES (%s, %s, %s, %s, %s, 'Pending')
        """
        values = (
            booking.car_id,
            booking.customer_id,
            booking.start_date,
            booking.end_date,
            booking.total_price,
        )
        cursor.execute(query, values)

        update_car_query = "UPDATE cars SET status = 'Rented' WHERE id = %s"
        cursor.execute(update_car_query, (booking.car_id,))

        conn.commit()
        return {"message": "Car booked successfully! Status is pending approval."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.get("/bookings/")
def get_bookings():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM bookings")
        return cursor.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.post("/bookings", status_code=201)
async def create_booking_from_form(
    request: Request,
    car_id: int = Form(...),
    customer_id: int = Form(...),
    start_date: date = Form(...),
    end_date: date = Form(...),
    customer_location: str = Form(...),
    valid_id_image: UploadFile = File(...),
):
    session_user = require_authenticated_user(request)
    if session_user.get("role") != "customer" or session_user.get("id") != customer_id:
        raise HTTPException(status_code=403, detail="You can only book a car for your own account.")

    location = customer_location.strip()
    if not location or len(location) > 255:
        raise HTTPException(status_code=400, detail="Enter a location with no more than 255 characters.")
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="The end date must be on or after the start date.")

    content_type = valid_id_image.content_type or ""
    contents = await valid_id_image.read(5 * 1024 * 1024 + 1)
    await valid_id_image.close()
    if not contents or len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="The valid ID image must be 5 MB or smaller.")
    if not valid_image_contents(content_type, contents):
        raise HTTPException(status_code=400, detail="Upload a valid JPEG, PNG, or WebP image.")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT price, status FROM cars WHERE id = %s FOR UPDATE",
            (car_id,),
        )
        car = cursor.fetchone()
        if not car:
            raise HTTPException(status_code=404, detail="Vehicle not found.")
        if car["status"] != "Available":
            raise HTTPException(status_code=409, detail="The selected car is not available.")

        days = max(1, (end_date - start_date).days)
        total_price = Decimal(str(car["price"])) * days

        cursor.execute("SELECT id FROM `user` WHERE id = %s FOR UPDATE", (customer_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Customer account not found.")

        cursor.execute(
            """
            UPDATE `user`
            SET location = %s, valid_id_mime = %s, valid_id_image = %s
            WHERE id = %s
            """,
            (location, content_type, contents, customer_id),
        )

        cursor.execute(
            "UPDATE cars SET status = 'Rented' WHERE id = %s AND status = 'Available'",
            (car_id,),
        )
        if cursor.rowcount != 1:
            raise HTTPException(status_code=409, detail="The car is no longer available.")

        cursor.execute(
            """
            INSERT INTO bookings
                (car_id, customer_id, start_date, end_date, total_price, status)
            VALUES (%s, %s, %s, %s, %s, 'Pending')
            """,
            (car_id, customer_id, start_date, end_date, total_price),
        )
        booking_id = cursor.lastrowid
        conn.commit()
        return {"id": booking_id, "message": "Booking created."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.get("/bookings")
def get_bookings_for_session(request: Request):
    session_user = require_authenticated_user(request)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT b.id, b.car_id, b.customer_id, b.start_date, b.end_date,
                   b.total_price, b.status, b.created_at,
                   c.car_model AS car_name, c.image_url AS car_image
            FROM bookings b
            LEFT JOIN cars c ON c.id = b.car_id
        """
        if session_user.get("role") == "admin":
            cursor.execute(query + " ORDER BY b.created_at DESC, b.id DESC")
        else:
            cursor.execute(
                query + " WHERE b.customer_id = %s ORDER BY b.created_at DESC, b.id DESC",
                (session_user["id"],),
            )
        return cursor.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.get("/bookings/{booking_id}")
def get_booking_for_session(booking_id: int, request: Request):
    session_user = require_authenticated_user(request)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT b.id, b.car_id, b.customer_id, b.start_date, b.end_date,
                   b.total_price, b.status, b.created_at,
                   c.car_model AS car_name, c.image_url AS car_image
            FROM bookings b
            LEFT JOIN cars c ON c.id = b.car_id
            WHERE b.id = %s
            LIMIT 1
            """,
            (booking_id,),
        )
        booking = cursor.fetchone()
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found.")
        if session_user.get("role") != "admin" and booking["customer_id"] != session_user.get("id"):
            raise HTTPException(status_code=403, detail="You can only view your own bookings.")
        return booking
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.put("/bookings/{booking_id}")
def update_booking_status(
    booking_id: int,
    update: BookingStatusUpdate,
    request: Request,
):
    session_user = require_authenticated_user(request)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, car_id, customer_id, status
            FROM bookings
            WHERE id = %s
            FOR UPDATE
            """,
            (booking_id,),
        )
        booking = cursor.fetchone()
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found.")
        if session_user.get("role") != "admin" and booking["customer_id"] != session_user.get("id"):
            raise HTTPException(status_code=403, detail="You can only return your own bookings.")
        if session_user.get("role") != "admin" and update.status != "Completed":
            raise HTTPException(status_code=403, detail="Customers can only return their own bookings.")
        if booking["status"] not in ("Pending", "Approved"):
            raise HTTPException(status_code=409, detail="This booking can no longer be returned.")

        cursor.execute(
            "UPDATE bookings SET status = %s WHERE id = %s",
            (update.status, booking_id),
        )
        if update.status in ("Completed", "Cancelled"):
            cursor.execute(
                "UPDATE cars SET status = 'Available' WHERE id = %s AND status = 'Rented'",
                (booking["car_id"],),
            )
        conn.commit()
        return {"message": "Booking updated."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()