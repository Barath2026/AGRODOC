import os
import sys
import unittest
from PIL import Image
import io

# Setup path
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.ml.predictor import predict_image


class AgroDocBackendTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from backend.app.init_db import init_database
        init_database()
        cls.client = TestClient(app)

    def test_01_root_and_health(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("AgroDoc", data["name"])
        self.assertEqual(data["status"], "online")
        self.assertIn("Tomato", data["supported_crops"])

        resp_health = self.client.get("/health")
        self.assertEqual(resp_health.status_code, 200)
        health_data = resp_health.json()
        self.assertEqual(health_data["status"], "healthy")
        self.assertTrue(health_data["model_loaded"])

    def test_02_config_endpoint(self):
        resp = self.client.get("/config")
        self.assertEqual(resp.status_code, 200)
        cfg = resp.json()
        self.assertEqual(cfg["max_upload_mb"], 10)
        self.assertIn("image/jpeg", cfg["allowed_types"])
        self.assertEqual(cfg["supported_crop"], "Tomato")

    def test_03_auth_flow(self):
        # Register a unique user
        unique_email = f"tester_{os.getpid()}@agrodoc.farm"
        reg_resp = self.client.post("/auth/register", json={
            "full_name": "Test Agronomist",
            "email": unique_email,
            "password": "SecurePassword123",
            "confirm_password": "SecurePassword123",
            "phone": "+1234567890"
        })
        self.assertEqual(reg_resp.status_code, 201)
        token_data = reg_resp.json()
        self.assertIn("access_token", token_data)
        token = token_data["access_token"]

        # Login
        login_resp = self.client.post("/auth/login", json={
            "email": unique_email,
            "password": "SecurePassword123"
        })
        self.assertEqual(login_resp.status_code, 200)
        self.assertIn("access_token", login_resp.json())

        # Me endpoint
        headers = {"Authorization": f"Bearer {token}"}
        me_resp = self.client.get("/auth/me", headers=headers)
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.json()["email"], unique_email)

    def test_04_ml_differential_predictions(self):
        categories = ["healthy", "early_blight", "late_blight"]
        for cat in categories:
            folder = os.path.join(root_dir, "dataset", "test", cat)
            if os.path.exists(folder):
                files = os.listdir(folder)
                if files:
                    img_path = os.path.join(folder, files[0])
                    img = Image.open(img_path)
                    pred = predict_image(img)
                    self.assertIn("prediction", pred)
                    self.assertIn("confidence", pred)
                    self.assertGreaterEqual(pred["confidence"], 50.0)
                    self.assertIn(pred["confidence_level"], ["high", "moderate", "uncertain"])

    def test_05_predict_api_endpoint(self):
        # Pick real image from dataset
        folder = os.path.join(root_dir, "dataset", "test", "early_blight")
        files = os.listdir(folder)
        img_path = os.path.join(folder, files[0])
        field = self.client.get("/fields").json()[0]
        zone = field["zones"][0]

        with open(img_path, "rb") as f:
            resp = self.client.post(
                "/diagnosis/predict",
                files={"image": ("test_leaf.jpg", f, "image/jpeg")},
                data={
                    "field_id": field["id"],
                    "field_zone_id": zone["id"],
                    "location_name": f"{field['field_name']} · {zone['zone_name']}",
                }
            )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("id", data)
        self.assertIn("reference", data)
        self.assertEqual(data["prediction"], "Early blight")
        self.assertEqual(data["health_status"], "At risk")
        self.assertTrue(data["saved"])
        self.assertEqual(data["field_id"], field["id"])
        self.assertEqual(data["field_zone_id"], zone["id"])
        scan_id = data["id"]

        summary_resp = self.client.get(f"/fields/{field['id']}/summary")
        self.assertEqual(summary_resp.status_code, 200)
        summary = summary_resp.json()
        self.assertGreaterEqual(summary["completed_ai_scans"], 1)
        self.assertTrue(summary["plant_counts_are_estimates"])
        self.assertIsNotNone(summary["healthy_plant_count"])

        # Fetch image
        img_resp = self.client.get(f"/diagnosis/{scan_id}/image")
        self.assertEqual(img_resp.status_code, 200)
        self.assertEqual(img_resp.headers["content-type"], "image/jpeg")

    def test_06_dashboard_and_reports(self):
        dash_resp = self.client.get("/dashboard/summary")
        self.assertEqual(dash_resp.status_code, 200)
        dash = dash_resp.json()
        self.assertIn("scan_count", dash)
        self.assertIn("field_health", dash)
        self.assertIn("trend_series", dash)
        self.assertIn("plant_health_matrix", dash)

        reports_resp = self.client.get("/reports")
        self.assertEqual(reports_resp.status_code, 200)
        reports = reports_resp.json()
        self.assertGreater(len(reports), 0)

        # Download PDF
        rep_id = reports[0]["id"]
        pdf_resp = self.client.get(f"/reports/{rep_id}/pdf")
        self.assertEqual(pdf_resp.status_code, 200)
        self.assertEqual(pdf_resp.headers["content-type"], "application/pdf")
        self.assertGreater(len(pdf_resp.content), 1000)

    def test_08_field_location_and_empty_summary(self):
        response = self.client.post("/fields", json={
            "name": f"Map test field {os.getpid()}",
            "plants": 6,
            "location_name": "North test plot",
            "latitude": 43.12345,
            "longitude": -72.54321,
            "area": 1.25,
        })
        self.assertEqual(response.status_code, 201)
        field = response.json()
        self.assertAlmostEqual(field["latitude"], 43.12345)
        self.assertAlmostEqual(field["longitude"], -72.54321)
        self.assertAlmostEqual(field["area"], 1.25)

        summary_response = self.client.get(f"/fields/{field['id']}/summary")
        self.assertEqual(summary_response.status_code, 200)
        summary = summary_response.json()
        self.assertEqual(summary["completed_ai_scans"], 0)
        self.assertIsNone(summary["healthy_plant_count"])
        self.assertIsNone(summary["unhealthy_plant_count"])
        self.assertIsNone(summary["plant_health_percent"])

        zero_plant_response = self.client.patch(f"/fields/{field['id']}", json={"plants": 0})
        self.assertEqual(zero_plant_response.status_code, 200)
        zero_plant_summary = self.client.get(f"/fields/{field['id']}/summary").json()
        self.assertEqual(zero_plant_summary["field"]["plant_count"], 0)
        self.assertIsNone(zero_plant_summary["plant_health_percent"])

    def test_07_contact_endpoint(self):
        resp = self.client.post("/contact", json={
            "name": "Farmer John",
            "email": "john@farms.org",
            "subject": "Soil health inquiry",
            "message": "Interested in integrating AgroDoc sensors."
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["status"], "received")


if __name__ == "__main__":
    unittest.main()
