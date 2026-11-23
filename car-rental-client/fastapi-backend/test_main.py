import asyncio
import json
import unittest
from decimal import Decimal
from unittest.mock import MagicMock, patch

import mysql.connector
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main


class FastApiContractTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_car_serializer_omits_missing_uploaded_images(self):
        car = main.normalize_car(
            {
                "id": 9,
                "car_model": "Test vehicle",
                "year": 2024,
                "engine": "Petrol",
                "plate_number": "TEST-9",
                "seating_capacity": 4,
                "price": Decimal("1000.00"),
                "status": "Available",
                "image_url": "/uploads/cars/missing-test-image.png",
            }
        )

        self.assertIsNone(car["image_url"])

    @patch("main.get_db_connection")
    def test_health_confirms_database_connection(self, get_connection):
        connection = MagicMock()
        cursor = MagicMock()
        connection.cursor.return_value = cursor
        get_connection.return_value = connection

        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "database": "connected"})
        cursor.execute.assert_called_once_with("SELECT 1")
        connection.close.assert_called_once()

    @patch("main.get_db_connection")
    def test_health_returns_actionable_error_when_mysql_is_unavailable(self, get_connection):
        get_connection.side_effect = HTTPException(
            status_code=503,
            detail={"message": "Cannot connect to MySQL. Start XAMPP MySQL and check car_rental_db."},
        )

        response = self.client.get("/health")

        self.assertEqual(response.status_code, 503)
        self.assertIn("Start XAMPP MySQL", response.json()["detail"]["message"])

    @patch("main.get_db_connection")
    def test_vehicles_include_rented_and_maintenance_cars(self, get_connection):
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {
                "id": 1,
                "car_model": "Available car",
                "year": 2024,
                "engine": "Petrol",
                "plate_number": "A",
                "seating_capacity": 4,
                "price": Decimal("100.00"),
                "status": "Available",
                "image_url": None,
            },
            {
                "id": 2,
                "car_model": "Rented car",
                "year": 2023,
                "engine": "Diesel",
                "plate_number": "B",
                "seating_capacity": 5,
                "price": Decimal("200.00"),
                "status": "Rented",
                "image_url": None,
            },
        ]
        connection.cursor.return_value = cursor
        get_connection.return_value = connection

        response = self.client.get("/vehicles")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([car["status"] for car in response.json()], ["Available", "Rented"])
        sql = cursor.execute.call_args.args[0]
        self.assertNotIn("WHERE", sql)
        self.assertIn("ORDER BY id", sql)

    @patch("main.verify_password", return_value=True)
    @patch("main.get_db_connection")
    def test_login_sets_session_cookie_and_session_endpoint_returns_user(self, get_connection, _verify_password):
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.side_effect = [
            {
                "id": 12,
                "email": "renter@example.com",
                "username": "renter",
                "password": "stored-hash",
                "role": "customer",
            },
            {"id": 12, "email": "renter@example.com", "username": "renter", "role": "customer"},
        ]
        connection.cursor.return_value = cursor
        get_connection.return_value = connection

        login = self.client.post(
            "/auth/login",
            json={"email": "renter@example.com", "password": "correct-password"},
        )

        self.assertEqual(login.status_code, 200)
        self.assertIn("httponly", login.headers["set-cookie"].lower())
        self.assertEqual(login.json()["user"]["id"], 12)

        session = self.client.get("/auth/session")

        self.assertEqual(
            session.json(),
            {"id": 12, "email": "renter@example.com", "username": "renter", "role": "customer"},
        )

    @staticmethod
    def change_password_user_row(password="old-hash"):
        return {
            "email": "user@example.com",
            "username": "user",
            "password": password,
            "role": "customer",
            "location": "Cebu City",
            "valid_id_mime": "image/png",
            "valid_id_image": b"valid id bytes",
        }

    @patch("main.hash_password", return_value="hashed-password")
    @patch("main.get_db_connection")
    def test_change_password_creates_approval_request_instead_of_updating_password(self, get_connection, _hash_password):
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.side_effect = [self.change_password_user_row(), None]
        connection.cursor.return_value = cursor
        get_connection.return_value = connection

        response = self.client.post(
            "/auth/change-password",
            json={"email": "USER@EXAMPLE.COM", "new_password": "new-password"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "success",
                "message": "Successfully Change Password, Wait for the Admin Approval.",
            },
        )
        calls = cursor.execute.call_args_list
        statements = [call.args[0] for call in calls]
        insert_calls = [call for call in calls if "INSERT INTO password_change_requests" in call.args[0]]
        self.assertEqual(len(insert_calls), 1)
        self.assertEqual(
            insert_calls[0].args[1],
            ("user@example.com", "user", "hashed-password", "customer", "Cebu City", "image/png", b"valid id bytes"),
        )
        self.assertTrue(all("UPDATE `user`" not in statement for statement in statements))
        connection.commit.assert_called_once()

    @patch("main.hash_password", return_value="hashed-password")
    @patch("main.get_db_connection")
    def test_change_password_is_blocked_while_admin_has_not_approved(self, get_connection, _hash_password):
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.side_effect = [self.change_password_user_row(), (1,)]
        connection.cursor.return_value = cursor
        get_connection.return_value = connection

        response = self.client.post(
            "/auth/change-password",
            json={"email": "user@example.com", "new_password": "another-password"},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"]["message"],
            "You already have a pending password change request. Wait for the Admin Approval.",
        )
        calls = cursor.execute.call_args_list
        statements = [call.args[0] for call in calls]
        self.assertIn("password <> %s", statements[1])
        self.assertEqual(calls[1].args[1], ("user@example.com", "old-hash"))
        self.assertTrue(all("INSERT INTO password_change_requests" not in statement for statement in statements))
        connection.commit.assert_not_called()
        connection.rollback.assert_called_once()

    @patch("main.hash_password", return_value="hashed-password")
    @patch("main.get_db_connection")
    def test_change_password_is_allowed_after_admin_copies_request_password(self, get_connection, _hash_password):
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.side_effect = [self.change_password_user_row(password="hashed-password"), None]
        connection.cursor.return_value = cursor
        get_connection.return_value = connection

        response = self.client.post(
            "/auth/change-password",
            json={"email": "user@example.com", "new_password": "a-new-password"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        statements = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(any("INSERT INTO password_change_requests" in statement for statement in statements))
        connection.commit.assert_called_once()

    @patch("main.get_db_connection")
    def test_booking_upload_saves_rental_and_marks_vehicle_rented(self, get_connection):
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"id": 8, "price": Decimal("1000.00"), "status": "Available"}
        cursor.lastrowid = 41
        connection.cursor.return_value = cursor
        get_connection.return_value = connection
        main.app.dependency_overrides[main.require_customer] = lambda: {
            "id": 12,
            "email": "renter@example.com",
            "username": "renter",
            "role": "customer",
        }

        response = self.client.post(
            "/bookings",
            data={
                "car_id": "8",
                "customer_id": "12",
                "start_date": "2026-11-22",
                "end_date": "2026-11-24",
                "customer_location": "Quezon City",
            },
            files={"valid_id_image": ("valid-id.png", b"image bytes", "image/png")},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {"id": 41, "message": "Rental request submitted."})
        connection.start_transaction.assert_called_once()
        connection.commit.assert_called_once()
        inserts = [call for call in cursor.execute.call_args_list if "INSERT INTO bookings" in call.args[0]]
        self.assertEqual(len(inserts), 1)
        self.assertEqual(inserts[0].args[1][4], Decimal("2000.00"))
        self.assertEqual(cursor.execute.call_args_list[-1].args[1], (8,))

    @patch("main.get_db_connection", side_effect=HTTPException(status_code=503, detail={"message": "offline"}))
    def test_mysql_error_reports_the_underlying_failure(self, _get_connection):
        error = mysql.connector.Error(msg="Unknown column 'location' in 'field list'", errno=1054)

        response = asyncio.run(main.handle_mysql_error(None, error))

        self.assertEqual(response.status_code, 503)
        body = json.loads(response.body)
        self.assertEqual(body["detail"]["code"], 1054)
        self.assertIn("Unknown column", body["detail"]["message"])

    def test_missing_schema_columns_are_detected(self):
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = [("user", "id"), ("cars", "price")]
        connection.cursor.return_value = cursor

        missing = main.missing_schema_columns(connection)

        self.assertIn("user.location", missing)
        self.assertIn("bookings.created_at", missing)
        self.assertIn("password_change_requests.password", missing)
        self.assertNotIn("user.id", missing)
        self.assertNotIn("cars.price", missing)

    @patch("main.get_db_connection")
    def test_booking_rejects_more_than_the_maximum_number_of_days(self, get_connection):
        main.app.dependency_overrides[main.require_customer] = lambda: {
            "id": 12,
            "email": "renter@example.com",
            "username": "renter",
            "role": "customer",
        }

        response = self.client.post(
            "/bookings",
            data={
                "car_id": "8",
                "customer_id": "12",
                "start_date": "2026-11-22",
                "end_date": "2027-11-23",
                "customer_location": "Quezon City",
            },
            files={"valid_id_image": ("valid-id.png", b"image bytes", "image/png")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("365 days", response.json()["detail"]["message"])
        get_connection.assert_not_called()

    @patch("main.get_db_connection")
    def test_booking_rejects_a_total_that_exceeds_the_database_column(self, get_connection):
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"id": 8, "price": Decimal("99999999.00"), "status": "Available"}
        connection.cursor.return_value = cursor
        get_connection.return_value = connection
        main.app.dependency_overrides[main.require_customer] = lambda: {
            "id": 12,
            "email": "renter@example.com",
            "username": "renter",
            "role": "customer",
        }

        response = self.client.post(
            "/bookings",
            data={
                "car_id": "8",
                "customer_id": "12",
                "start_date": "2026-11-22",
                "end_date": "2026-11-24",
                "customer_location": "Quezon City",
            },
            files={"valid_id_image": ("valid-id.png", b"image bytes", "image/png")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("too large", response.json()["detail"]["message"])
        connection.rollback.assert_called_once()
        inserts = [call for call in cursor.execute.call_args_list if "INSERT INTO bookings" in call.args[0]]
        self.assertEqual(inserts, [])

    def test_transient_mysql_errors_are_recognised(self):
        self.assertTrue(main.is_transient_mysql_error(mysql.connector.Error(msg="lost", errno=2055)))
        self.assertTrue(main.is_transient_mysql_error(HTTPException(status_code=503)))
        self.assertFalse(main.is_transient_mysql_error(HTTPException(status_code=409)))

    @patch("main.time.sleep")
    @patch("main.write_booking")
    def test_booking_retries_after_a_dropped_mysql_connection(self, write_booking, sleep):
        write_booking.side_effect = [mysql.connector.Error(msg="lost", errno=2055), 41]
        main.app.dependency_overrides[main.require_customer] = lambda: {
            "id": 12,
            "email": "renter@example.com",
            "username": "renter",
            "role": "customer",
        }

        response = self.client.post(
            "/bookings",
            data={
                "car_id": "8",
                "customer_id": "12",
                "start_date": "2026-11-22",
                "end_date": "2026-11-24",
                "customer_location": "Quezon City",
            },
            files={"valid_id_image": ("valid-id.png", b"image bytes", "image/png")},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["id"], 41)
        self.assertEqual(write_booking.call_count, 2)
        sleep.assert_called_once_with(0.5)

    @patch("main.write_booking")
    def test_booking_does_not_retry_validation_errors(self, write_booking):
        write_booking.side_effect = HTTPException(status_code=409, detail={"message": "Unavailable."})
        main.app.dependency_overrides[main.require_customer] = lambda: {
            "id": 12,
            "email": "renter@example.com",
            "username": "renter",
            "role": "customer",
        }

        response = self.client.post(
            "/bookings",
            data={
                "car_id": "8",
                "customer_id": "12",
                "start_date": "2026-11-22",
                "end_date": "2026-11-24",
                "customer_location": "Quezon City",
            },
            files={"valid_id_image": ("valid-id.png", b"image bytes", "image/png")},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(write_booking.call_count, 1)


if __name__ == "__main__":
    unittest.main()
