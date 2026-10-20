"""Fast, isolated regression tests for AgroDoc's ML input/output contract."""
import unittest
from unittest.mock import patch
import sys
import types
from pathlib import Path

import torch
from PIL import Image

# Import only the ML modules: the app/services package initializers also load
# unrelated database/auth dependencies, which these unit tests do not need.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
app_package = types.ModuleType("backend.app")
app_package.__path__ = [str(PROJECT_ROOT / "backend" / "app")]
sys.modules.setdefault("backend.app", app_package)
services_package = types.ModuleType("backend.app.services")
services_package.__path__ = [str(PROJECT_ROOT / "backend" / "app" / "services")]
sys.modules.setdefault("backend.app.services", services_package)

from backend.app.ml.preprocessing import preprocess_image
from backend.app.ml.predictor import predict_image


class FakeModel:
    def __init__(self, logits):
        self.logits = torch.tensor([logits], dtype=torch.float32)

    def __call__(self, batch):
        assert batch.shape == (1, 3, 224, 224)
        return self.logits


class MLPreprocessingTests(unittest.TestCase):
    def test_rgb_image_shape_and_finite_values(self):
        tensor = preprocess_image(Image.new("RGB", (640, 480), "green"))
        self.assertEqual(tuple(tensor.shape), (1, 3, 224, 224))
        self.assertTrue(torch.isfinite(tensor).all())

    def test_grayscale_and_rgba_images_are_supported(self):
        for image in (Image.new("L", (80, 60), 120), Image.new("RGBA", (80, 60), (10, 20, 30, 80))):
            tensor = preprocess_image(image)
            self.assertEqual(tuple(tensor.shape), (1, 3, 224, 224))

    def test_non_pil_input_fails_clearly(self):
        with self.assertRaisesRegex(TypeError, "PIL.Image"):
            preprocess_image("not an image")


class MLPredictionTests(unittest.TestCase):
    def _predict_with_logits(self, logits):
        with patch("backend.app.ml.predictor.load_model", return_value=FakeModel(logits)), \
             patch("backend.app.ml.predictor.get_device", return_value=torch.device("cpu")):
            return predict_image(Image.new("RGB", (224, 224), "green"))

    def test_confident_prediction_has_normalized_probabilities_and_remedies(self):
        result = self._predict_with_logits([8.0, 0.0, 0.0])
        self.assertEqual(result["class_key"], "early_blight")
        self.assertGreaterEqual(result["confidence"], 60.0)
        self.assertTrue(result["organic_solutions"])
        self.assertTrue(result["chemical_treatments"])
        self.assertAlmostEqual(sum(result["probabilities"].values()), 100.0, places=1)

    def test_low_confidence_does_not_return_disease_treatments(self):
        result = self._predict_with_logits([0.0, 0.0, 0.0])
        self.assertEqual(result["confidence_level"], "uncertain")
        self.assertEqual(result["health_status"], "Uncertain")
        self.assertEqual(result["prediction"], "Uncertain — retake image")
        self.assertEqual(result["disease"], "Uncertain classification")
        self.assertEqual(result["organic_solutions"], [])
        self.assertEqual(result["chemical_treatments"], [])
        self.assertTrue(result["warning"])
        self.assertTrue(result["recommendations"])

    def test_non_finite_logits_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "non-finite logits"):
            self._predict_with_logits([float("nan"), 0.0, 0.0])

    def test_wrong_model_output_shape_is_rejected(self):
        with patch("backend.app.ml.predictor.load_model", return_value=FakeModel([1.0, 2.0])), \
             patch("backend.app.ml.predictor.get_device", return_value=torch.device("cpu")):
            with self.assertRaisesRegex(RuntimeError, "unexpected output shape"):
                predict_image(Image.new("RGB", (224, 224), "green"))


if __name__ == "__main__":
    unittest.main()
