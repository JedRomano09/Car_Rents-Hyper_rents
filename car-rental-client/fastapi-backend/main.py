from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
import time
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Any, Literal

import bcrypt
import mysql.connector
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger("car-rental-api")
logger.setLevel(logging.INFO)
log_file_handler = logging.FileHandler(Path(__file__).resolve().parent / "api.log", encoding="utf-8")
log_file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
logger.addHandler(log_file_handler)
app = FastAPI(title="Hyper Rents API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8100",
        "http://127.0.0.1:8100",
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_ROOT = Path(__file__).resolve().parent / "uploads"
CAR_UPLOADS = UPLOAD_ROOT / "cars"
CAR_UPLOADS.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

MAX_IMAGE_SIZE = 5 * 1024 * 1024
IMAGE_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
SESSION_COOKIE = "hyper_rents_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7
SESSION_SECRET = os.getenv("SESSION_SECRET", "local-development-secret-change-before-deploy")
CAR_STATUSES = {"Available", "Rented", "Maintenance"}
BOOKING_STATUSES = {"Pending", "Approved", "Completed", "Cancelled"}
MAX_RENTAL_DAYS = 365
MAX_BOOKING_TOTAL = Decimal("99999999.99")
TRANSIENT_MYSQL_ERRORS = {2003, 2006, 2013, 2055}
DB_RETRY_ATTEMPTS = 3

REQUIRED_SCHEMA = {
    "user": (
        "id",
        "email",
        "username",
        "password",
        "role",
        "location",
        "valid_id_mime",
        "valid_id_image",
    ),
    "cars": (
        "id",
        "car_model",
        "year",
        "engine",
        "plate_number",
        "seating_capacity",
        "price",
        "status",
        "image_url",
    ),
    "bookings": (
        "id",
        "car_id",
        "customer_id",
        "start_date",
        "end_date",
        "total_price",
        "status",
        "created_at",
    ),
    "password_change_requests": (
        "id",
        "email",
        "username",
        "password",
        "role",
        "location",
        "valid_id_mime",
        "valid_id_image",
    ),
}

PASSWORD_CHANGE_SUBMITTED_MESSAGE = "Successfully Change Password, Wait for the Admin Approval."
PASSWORD_CHANGE_PENDING_MESSAGE = "You already have a pending password change request. Wait for the Admin Approval."


class ChangePasswordRequest(BaseModel):
    email: str
    new_password: str


class CarUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    car_model: str
    year: int
    engine: str
    plate_number: str
    seating_capacity: int
    price: float
    status: str
    image_url: str | None = None


class BookingUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str


def is_transient_mysql_error(error: BaseException | None) -> bool:
    if isinstance(error, mysql.connector.Error):
        return getattr(error, "errno", None) in TRANSIENT_MYSQL_ERRORS
    return isinstance(error, HTTPException) and error.status_code == 503


def get_db_connection():
    last_error: mysql.connector.Error | None = None
    for attempt in range(DB_RETRY_ATTEMPTS):
        try:
            return mysql.connector.connect(
                host=os.getenv("DB_HOST", "127.0.0.1"),
                port=int(os.getenv("DB_PORT", "3306")),
                user=os.getenv("DB_USER", "root"),
                password=os.getenv("DB_PASSWORD", ""),
                database=os.getenv("DB_NAME", "car_rental_db"),
                connection_timeout=5,
                autocommit=False,
                use_pure=True,
            )
        except mysql.connector.Error as error:
            last_error = error
            if attempt < DB_RETRY_ATTEMPTS - 1:
                logger.warning("Could not connect to MySQL (attempt %s): %s", attempt + 1, error)
                time.sleep(0.25 * (attempt + 1))
    logger.error("Could not connect to MySQL: %s", last_error)
    raise HTTPException(
        status_code=503,
        detail={"message": "Cannot connect to MySQL. Start XAMPP MySQL and check car_rental_db."},
    ) from last_error


def missing_schema_columns(connection: Any) -> list[str]:
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            SELECT TABLE_NAME, COLUMN_NAME
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            """
        )
        present = {(row[0], row[1]) for row in cursor.fetchall()}
    finally:
        cursor.close()
    return [
        f"{table}.{column}"
        for table, columns in REQUIRED_SCHEMA.items()
        for column in columns
        if (table, column) not in present
    ]


@app.exception_handler(mysql.connector.Error)
async def handle_mysql_error(_request: Request, error: mysql.connector.Error):
    logger.error("MySQL request failed: %s", error, exc_info=error)
    code = getattr(error, "errno", None)
    reason = getattr(error, "msg", str(error))

    missing: list[str] = []
    try:
        connection = get_db_connection()
        try:
            missing = missing_schema_columns(connection)
        finally:
            connection.close()
    except Exception:
        logger.debug("Could not inspect the database schema after a query failure", exc_info=True)

    message = "Database request failed. Check XAMPP MySQL and the database schema."
    if os.getenv("APP_ENV", "development").lower() != "production":
        details = [f"MySQL error {code}: {reason}" if code is not None else reason]
        if missing:
            details.append("Missing columns: " + ", ".join(missing))
        message = f"{message} {' '.join(details)}"

    content: dict[str, Any] = {"message": message}
    if code is not None:
        content["code"] = code
    if missing:
        content["missing_columns"] = missing
    return JSONResponse(status_code=503, content={"detail": content})


def encode_session(user_id: int) -> str:
    payload = f"{user_id}:{int(time.time()) + SESSION_MAX_AGE}"
    signature = hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    token = f"{payload}:{signature}".encode()
    return base64.urlsafe_b64encode(token).decode().rstrip("=")


def decode_session(token: str | None) -> int | None:
    if not token:
        return None

    try:
        padded_token = token + "=" * (-len(token) % 4)
        payload = base64.urlsafe_b64decode(padded_token).decode()
        user_id_text, expires_text, signature = payload.split(":", 2)
        signed_payload = f"{user_id_text}:{expires_text}"
        expected = hmac.new(SESSION_SECRET.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected) or int(expires_text) <= int(time.time()):
            return None
        user_id = int(user_id_text)
        return user_id if user_id > 0 else None
    except (ValueError, UnicodeDecodeError):
        return None


def load_session_user(user_id: int) -> dict[str, Any] | None:
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, email, username, role FROM `user` WHERE id = %s LIMIT 1",
            (user_id,),
        )
        return cursor.fetchone()
    finally:
        cursor.close()
        connection.close()


def require_user(request: Request) -> dict[str, Any]:
    user_id = decode_session(request.cookies.get(SESSION_COOKIE))
    user = load_session_user(user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(status_code=401, detail={"message": "Please log in to continue."})
    return user


def require_admin(user: Annotated[dict[str, Any], Depends(require_user)]) -> dict[str, Any]:
    if str(user["role"]).strip().lower() != "admin":
        raise HTTPException(status_code=403, detail={"message": "Administrator access is required."})
    return user


def require_customer(user: Annotated[dict[str, Any], Depends(require_user)]) -> dict[str, Any]:
    if str(user["role"]).strip().lower() != "customer":
        raise HTTPException(status_code=403, detail={"message": "Customer access is required."})
    return user


def verify_password(password: str, stored_hash: str) -> bool:
    if not password or not stored_hash:
        return False
    try:
        normalized_hash = stored_hash.encode("utf-8")
        if normalized_hash.startswith(b"$2y$"):
            normalized_hash = b"$2b$" + normalized_hash[4:]
        return bcrypt.checkpw(password.encode("utf-8"), normalized_hash)
    except (ValueError, TypeError):
        return False


def hash_password(password: str) -> str:
    try:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except ValueError as error:
        raise HTTPException(status_code=400, detail={"message": "Password must not exceed 72 UTF-8 bytes."}) from error


def normalize_car(row: dict[str, Any]) -> dict[str, Any]:
    image_url = row.get("image_url")
    if image_url and image_url.startswith("/uploads/") and not uploaded_file_exists(image_url):
        image_url = None
    return {
        **row,
        "year": int(row["year"]) if row.get("year") is not None else None,
        "price": float(row["price"]) if row.get("price") is not None else None,
        "image_url": image_url,
    }


def normalize_booking(row: dict[str, Any]) -> dict[str, Any]:
    if isinstance(row.get("total_price"), Decimal):
        row["total_price"] = float(row["total_price"])
    car_image = row.get("car_image")
    if car_image and car_image.startswith("/uploads/") and not uploaded_file_exists(car_image):
        row["car_image"] = None
    return row


def uploaded_file_exists(image_url: str) -> bool:
    relative_path = Path(image_url.removeprefix("/uploads/"))
    if relative_path.is_absolute() or ".." in relative_path.parts:
        return False
    return (UPLOAD_ROOT / relative_path).is_file()


def validate_car(car_model: str, year: int, engine: str, plate_number: str, seats: int, price: float, status: str):
    if not car_model.strip() or len(car_model.strip()) > 100:
        raise HTTPException(status_code=400, detail={"message": "Enter a valid vehicle model."})
    if not 1901 <= year <= 2155:
        raise HTTPException(status_code=400, detail={"message": "Enter a valid vehicle year."})
    if not engine.strip() or len(engine.strip()) > 100:
        raise HTTPException(status_code=400, detail={"message": "Enter a valid engine type."})
    if not plate_number.strip() or len(plate_number.strip()) > 50:
        raise HTTPException(status_code=400, detail={"message": "Enter a valid plate number."})
    if seats < 1 or price <= 0 or status not in CAR_STATUSES:
        raise HTTPException(status_code=400, detail={"message": "Enter valid vehicle details and price."})


async def save_car_photo(photo: UploadFile | None) -> tuple[str | None, Path | None]:
    if photo is None or not photo.filename:
        return None, None
    extension = IMAGE_EXTENSIONS.get(photo.content_type or "")
    if extension is None:
        raise HTTPException(status_code=400, detail={"message": "Upload a JPEG, PNG, or WebP vehicle photo."})
    contents = await photo.read(MAX_IMAGE_SIZE + 1)
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail={"message": "Vehicle photo must be 5 MB or smaller."})
    filename = f"{secrets.token_hex(16)}{extension}"
    target = CAR_UPLOADS / filename
    target.write_bytes(contents)
    return f"/uploads/cars/{filename}", target


def remove_upload(path: Path | None) -> None:
    if path is not None:
        path.unlink(missing_ok=True)


@app.get("/health")
def health_check():
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        return {"status": "ok", "database": "connected"}
    finally:
        connection.close()


@app.post("/auth/signup", status_code=201)
def signup(payload: dict[str, str]):
    username = payload.get("username", "").strip()
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")
    if not username or len(username) > 64 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or not password:
        raise HTTPException(status_code=400, detail={"message": "Enter a username, valid email, and password."})

    password_hash = hash_password(password)
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "INSERT INTO `user` (username, email, password, role) VALUES (%s, %s, %s, 'customer')",
            (username, email, password_hash),
        )
        connection.commit()
        return {"status": "success", "message": "Signup successful!"}
    except mysql.connector.IntegrityError as error:
        connection.rollback()
        raise HTTPException(status_code=409, detail={"message": "Email or username is already registered."}) from error
    finally:
        cursor.close()
        connection.close()


@app.post("/auth/login")
def login(payload: dict[str, str], response: Response):
    identifier = payload.get("email", "").strip().lower()
    password = payload.get("password", "")
    if not identifier or not password:
        raise HTTPException(status_code=400, detail={"message": "Email/username and password are required."})

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, email, username, password, role
            FROM `user`
            WHERE LOWER(email) = %s OR LOWER(COALESCE(username, '')) = %s
            LIMIT 1
            """,
            (identifier, identifier),
        )
        user = cursor.fetchone()
        if user is None or not verify_password(password, user["password"]):
            raise HTTPException(status_code=401, detail={"message": "Invalid email/username or password."})

        response.set_cookie(
            SESSION_COOKIE,
            encode_session(int(user["id"])),
            max_age=SESSION_MAX_AGE,
            httponly=True,
            secure=False,
            samesite="lax",
            path="/",
        )
        return {
            "status": "success",
            "message": "Login successful!",
            "user": {
                "id": int(user["id"]),
                "email": user["email"],
                "username": user.get("username"),
                "role": str(user.get("role") or "customer").strip().lower(),
            },
        }
    finally:
        cursor.close()
        connection.close()


@app.get("/auth/session")
def get_session(request: Request, response: Response):
    user_id = decode_session(request.cookies.get(SESSION_COOKIE))
    if user_id is None:
        response.delete_cookie(SESSION_COOKIE, path="/")
        return None
    user = load_session_user(user_id)
    if user is None:
        response.delete_cookie(SESSION_COOKIE, path="/")
        return None
    user["role"] = str(user["role"] or "customer").strip().lower()
    return user


@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "success", "message": "Logged out."}


@app.post("/auth/change-password")
def change_password(payload: ChangePasswordRequest):
    email = payload.email.strip().lower()
    if not email or not payload.new_password:
        raise HTTPException(status_code=400, detail={"message": "Email and new password are required."})

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT email, username, password, role, location, valid_id_mime, valid_id_image
            FROM `user`
            WHERE LOWER(email) = %s
            LIMIT 1
            """,
            (email,),
        )
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail={"message": "User not found."})

        # A request is still pending while its password hash has not been copied
        # into the user table by the admin. Until then the user cannot submit
        # another password change request.
        cursor.execute(
            """
            SELECT id FROM password_change_requests
            WHERE LOWER(email) = %s AND password <> %s
            LIMIT 1
            """,
            (email, user_row["password"]),
        )
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail={"message": PASSWORD_CHANGE_PENDING_MESSAGE})

        cursor.execute(
            """
            INSERT INTO password_change_requests
                (email, username, password, role, location, valid_id_mime, valid_id_image)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_row["email"],
                user_row["username"],
                hash_password(payload.new_password),
                user_row["role"],
                user_row["location"],
                user_row["valid_id_mime"],
                user_row["valid_id_image"],
            ),
        )
        connection.commit()
        return {"status": "success", "message": PASSWORD_CHANGE_SUBMITTED_MESSAGE}
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


@app.get("/vehicles")
def get_vehicles():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM cars ORDER BY id")
        return [normalize_car(row) for row in cursor.fetchall()]
    finally:
        cursor.close()
        connection.close()


@app.get("/cars/{car_id}")
def get_car(car_id: int):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM cars WHERE id = %s LIMIT 1", (car_id,))
        car = cursor.fetchone()
        if car is None:
            raise HTTPException(status_code=404, detail={"message": "Vehicle not found."})
        return normalize_car(car)
    finally:
        cursor.close()
        connection.close()


@app.get("/admin/cars")
def get_admin_cars(_user: Annotated[dict[str, Any], Depends(require_user)]):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM cars ORDER BY id DESC")
        return [normalize_car(row) for row in cursor.fetchall()]
    finally:
        cursor.close()
        connection.close()


async def create_car_record(
    car_model: str,
    year: int,
    engine: str,
    plate_number: str,
    seating_capacity: int,
    price: float,
    status: str,
    image_url: str | None,
    photo: UploadFile | None,
):
    validate_car(car_model, year, engine, plate_number, seating_capacity, price, status)
    uploaded_url, uploaded_path = await save_car_photo(photo)
    image = uploaded_url or image_url
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO cars (car_model, year, engine, plate_number, seating_capacity, price, status, image_url)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (car_model.strip(), year, engine.strip(), plate_number.strip(), seating_capacity, price, status, image),
        )
        car_id = int(cursor.lastrowid)
        connection.commit()
        return {"id": car_id, "message": "Successfully added Vahicle", "image_url": image}
    except Exception:
        connection.rollback()
        remove_upload(uploaded_path)
        raise
    finally:
        cursor.close()
        connection.close()


@app.post("/admin/cars", status_code=201)
async def create_admin_car(
    _user: Annotated[dict[str, Any], Depends(require_user)],
    car_model: Annotated[str, Form()],
    year: Annotated[int, Form()],
    engine: Annotated[str, Form()],
    plate_number: Annotated[str, Form()],
    seating_capacity: Annotated[int, Form()],
    price: Annotated[float, Form()],
    status: Annotated[str, Form()] = "Available",
    image_url: Annotated[str | None, Form()] = None,
    photo: Annotated[UploadFile | None, File()] = None,
):
    return await create_car_record(
        car_model, year, engine, plate_number, seating_capacity, price, status, image_url, photo
    )


@app.post("/cars", status_code=201)
async def create_car(
    _user: Annotated[dict[str, Any], Depends(require_user)],
    car_model: Annotated[str, Form()],
    year: Annotated[int, Form()],
    engine: Annotated[str, Form()],
    plate_number: Annotated[str, Form()],
    seating_capacity: Annotated[int, Form()],
    price: Annotated[float, Form()],
    status: Annotated[str, Form()] = "Available",
    image_url: Annotated[str | None, Form()] = None,
    photo: Annotated[UploadFile | None, File()] = None,
):
    return await create_car_record(
        car_model, year, engine, plate_number, seating_capacity, price, status, image_url, photo
    )


def update_car_record(car_id: int, car: CarUpdate):
    validate_car(car.car_model, car.year, car.engine, car.plate_number, car.seating_capacity, car.price, car.status)
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE cars SET car_model = %s, year = %s, engine = %s, plate_number = %s,
                seating_capacity = %s, price = %s, status = %s, image_url = %s
            WHERE id = %s
            """,
            (
                car.car_model.strip(),
                car.year,
                car.engine.strip(),
                car.plate_number.strip(),
                car.seating_capacity,
                car.price,
                car.status,
                car.image_url,
                car_id,
            ),
        )
        if cursor.rowcount == 0:
            cursor.execute("SELECT id FROM cars WHERE id = %s", (car_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail={"message": "Vehicle not found."})
        connection.commit()
        return {"message": "Vehicle updated."}
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


@app.put("/admin/cars/{car_id}")
def update_admin_car(
    car_id: int, car: CarUpdate, _user: Annotated[dict[str, Any], Depends(require_user)]
):
    return update_car_record(car_id, car)


@app.put("/cars/{car_id}")
def update_car(car_id: int, car: CarUpdate, _user: Annotated[dict[str, Any], Depends(require_user)]):
    return update_car_record(car_id, car)


def delete_car_record(car_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT status FROM cars WHERE id = %s FOR UPDATE", (car_id,))
        car = cursor.fetchone()
        if car is None:
            raise HTTPException(status_code=404, detail={"message": "Vehicle not found."})
        if car[0] != "Maintenance":
            raise HTTPException(status_code=409, detail={"message": "Only vehicles in Maintenance can be removed."})
        cursor.execute("DELETE FROM cars WHERE id = %s", (car_id,))
        connection.commit()
        return {"message": "Vehicle removed."}
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


@app.delete("/admin/cars/{car_id}")
def delete_admin_car(car_id: int, _user: Annotated[dict[str, Any], Depends(require_user)]):
    return delete_car_record(car_id)


@app.delete("/cars/{car_id}")
def delete_car(car_id: int, _user: Annotated[dict[str, Any], Depends(require_user)]):
    return delete_car_record(car_id)


def booking_query(cursor, where_sql: str = "", params: tuple[Any, ...] = ()):
    cursor.execute(
        f"""
        SELECT b.id, b.car_id, b.customer_id, b.start_date, b.end_date, b.total_price,
               b.status, b.created_at, c.car_model AS car_name, c.image_url AS car_image,
               u.location AS customer_location
        FROM bookings AS b
        LEFT JOIN cars AS c ON c.id = b.car_id
        LEFT JOIN `user` AS u ON u.id = b.customer_id
        {where_sql}
        ORDER BY b.created_at DESC, b.id DESC
        """,
        params,
    )
    return cursor.fetchall()


@app.get("/bookings")
def get_bookings(user: Annotated[dict[str, Any], Depends(require_user)]):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        if str(user["role"]).strip().lower() == "admin":
            rows = booking_query(cursor)
        else:
            rows = booking_query(cursor, "WHERE b.customer_id = %s", (user["id"],))
        return [normalize_booking(row) for row in rows]
    finally:
        cursor.close()
        connection.close()


@app.get("/bookings/{booking_id}")
def get_booking(booking_id: int, user: Annotated[dict[str, Any], Depends(require_user)]):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        rows = booking_query(cursor, "WHERE b.id = %s", (booking_id,))
        if not rows:
            raise HTTPException(status_code=404, detail={"message": "Rental request not found."})
        booking = rows[0]
        if str(user["role"]).strip().lower() != "admin" and booking["customer_id"] != user["id"]:
            raise HTTPException(status_code=403, detail={"message": "You cannot view this rental request."})
        return normalize_booking(booking)
    finally:
        cursor.close()
        connection.close()


def write_booking(
    car_id: int,
    customer_id: int,
    start_date: date,
    end_date: date,
    days: int,
    location: str,
    mime_type: str,
    image_contents: bytes,
    user_id: int,
) -> int:
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        connection.start_transaction()
        cursor.execute("SELECT id, price, status FROM cars WHERE id = %s FOR UPDATE", (car_id,))
        car = cursor.fetchone()
        if car is None:
            raise HTTPException(status_code=404, detail={"message": "Vehicle not found."})
        if car["status"] != "Available":
            raise HTTPException(status_code=409, detail={"message": "This vehicle is not currently available."})
        total_price = Decimal(str(car["price"])) * days
        if total_price > MAX_BOOKING_TOTAL:
            raise HTTPException(
                status_code=400,
                detail={"message": "The rental total is too large. Choose a shorter rental period."},
            )
        cursor.execute(
            """
            UPDATE `user`
            SET location = %s, valid_id_mime = %s, valid_id_image = %s
            WHERE id = %s
            """,
            (location, mime_type, image_contents, user_id),
        )
        cursor.execute(
            """
            INSERT INTO bookings (car_id, customer_id, start_date, end_date, total_price, status)
            VALUES (%s, %s, %s, %s, %s, 'Pending')
            """,
            (car_id, customer_id, start_date, end_date, total_price),
        )
        booking_id = int(cursor.lastrowid)
        cursor.execute("UPDATE cars SET status = 'Rented' WHERE id = %s", (car_id,))
        connection.commit()
        return booking_id
    except Exception:
        try:
            connection.rollback()
        except Exception:
            logger.debug("Could not roll back the booking transaction", exc_info=True)
        raise
    finally:
        cursor.close()
        connection.close()


@app.post("/bookings", status_code=201)
async def create_booking(
    user: Annotated[dict[str, Any], Depends(require_customer)],
    car_id: Annotated[int, Form()],
    customer_id: Annotated[int, Form()],
    start_date: Annotated[date, Form()],
    end_date: Annotated[date, Form()],
    customer_location: Annotated[str, Form()],
    valid_id_image: Annotated[UploadFile, File()],
):
    if customer_id != int(user["id"]):
        raise HTTPException(status_code=403, detail={"message": "The rental request user does not match your session."})
    if start_date >= end_date:
        raise HTTPException(status_code=400, detail={"message": "Rental end date must be after the start date."})
    days = (end_date - start_date).days
    if days > MAX_RENTAL_DAYS:
        raise HTTPException(
            status_code=400,
            detail={"message": f"Rental duration cannot exceed {MAX_RENTAL_DAYS} days."},
        )
    location = customer_location.strip()
    if not location or len(location) > 255:
        raise HTTPException(status_code=400, detail={"message": "Enter a valid current location."})

    mime_type = valid_id_image.content_type or ""
    if mime_type not in IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail={"message": "Upload a JPEG, PNG, or WebP valid ID image."})
    image_contents = await valid_id_image.read(MAX_IMAGE_SIZE + 1)
    if not image_contents or len(image_contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail={"message": "Valid ID image must be smaller than 5 MB."})

    for attempt in range(DB_RETRY_ATTEMPTS):
        try:
            booking_id = write_booking(
                car_id,
                customer_id,
                start_date,
                end_date,
                days,
                location,
                mime_type,
                image_contents,
                int(user["id"]),
            )
            return {"id": booking_id, "message": "Rental request submitted."}
        except (mysql.connector.Error, HTTPException) as error:
            if not is_transient_mysql_error(error) or attempt == DB_RETRY_ATTEMPTS - 1:
                raise
            logger.warning(
                "Transient database error while creating a booking (attempt %s): %s",
                attempt + 1,
                error,
            )
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError("Booking retry loop exited unexpectedly.")


@app.put("/bookings/{booking_id}")
def update_booking(
    booking_id: int,
    payload: BookingUpdate,
    user: Annotated[dict[str, Any], Depends(require_user)],
):
    status = payload.status
    if status not in BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail={"message": "Invalid rental status."})
    is_admin = str(user["role"]).strip().lower() == "admin"
    if not is_admin and status != "Completed":
        raise HTTPException(status_code=403, detail={"message": "Customers may only complete a rental return."})

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        connection.start_transaction()
        cursor.execute("SELECT id, car_id, customer_id, status FROM bookings WHERE id = %s FOR UPDATE", (booking_id,))
        booking = cursor.fetchone()
        if booking is None:
            raise HTTPException(status_code=404, detail={"message": "Rental request not found."})
        if not is_admin and int(booking["customer_id"]) != int(user["id"]):
            raise HTTPException(status_code=403, detail={"message": "You cannot update this rental request."})
        cursor.execute("UPDATE bookings SET status = %s WHERE id = %s", (status, booking_id))
        if status in {"Completed", "Cancelled"}:
            cursor.execute(
                """
                SELECT COUNT(*) AS active_count FROM bookings
                WHERE car_id = %s AND id <> %s AND status IN ('Pending', 'Approved')
                """,
                (booking["car_id"], booking_id),
            )
            if cursor.fetchone()["active_count"] == 0:
                cursor.execute("UPDATE cars SET status = 'Available' WHERE id = %s", (booking["car_id"],))
        elif status in {"Pending", "Approved"}:
            cursor.execute("UPDATE cars SET status = 'Rented' WHERE id = %s", (booking["car_id"],))
        connection.commit()
        return {"message": "Rental request updated."}
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


@app.delete("/bookings/{booking_id}")
def delete_booking(booking_id: int, user: Annotated[dict[str, Any], Depends(require_user)]):
    is_admin = str(user["role"]).strip().lower() == "admin"
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        connection.start_transaction()
        cursor.execute("SELECT car_id, customer_id, status FROM bookings WHERE id = %s FOR UPDATE", (booking_id,))
        booking = cursor.fetchone()
        if booking is None:
            raise HTTPException(status_code=404, detail={"message": "Rental request not found."})
        if not is_admin and (
            int(booking["customer_id"]) != int(user["id"]) or booking["status"] != "Pending"
        ):
            raise HTTPException(status_code=403, detail={"message": "You cannot remove this rental request."})
        cursor.execute("DELETE FROM bookings WHERE id = %s", (booking_id,))
        cursor.execute(
            """
            SELECT COUNT(*) AS active_count FROM bookings
            WHERE car_id = %s AND status IN ('Pending', 'Approved')
            """,
            (booking["car_id"],),
        )
        if cursor.fetchone()["active_count"] == 0:
            cursor.execute("UPDATE cars SET status = 'Available' WHERE id = %s", (booking["car_id"],))
        connection.commit()
        return {"message": "Rental request removed."}
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("API_PORT", "8000")))
