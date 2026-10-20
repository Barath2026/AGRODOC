import os
import logging
from pathlib import Path
import torch
import torch.nn as nn
from torchvision import models
from ..config import settings

logger = logging.getLogger("agrodoc.ml")

CLASS_NAMES = ["early_blight", "healthy", "late_blight"]

_model_instance = None
_device = None


def get_device() -> torch.device:
    global _device
    if _device is None:
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return _device


def load_model() -> nn.Module:
    global _model_instance
    if _model_instance is not None:
        return _model_instance

    device = get_device()
    model_path = settings.resolved_model_path

    logger.info(f"Loading AgroDoc MobileNetV3 model from: {model_path} on device: {device}")

    # Build architecture
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, len(CLASS_NAMES))

    if os.path.exists(model_path):
        try:
            # Checkpoints are expected to contain tensors only; prefer safe loading.
            try:
                state_dict = torch.load(model_path, map_location=device, weights_only=True)
            except TypeError:  # PyTorch versions before weights_only was introduced
                state_dict = torch.load(model_path, map_location=device)
            # Accept common checkpoint wrappers while keeping backward compatibility.
            if isinstance(state_dict, dict) and "state_dict" in state_dict:
                state_dict = state_dict["state_dict"]
            if isinstance(state_dict, dict) and state_dict and all(k.startswith("module.") for k in state_dict):
                state_dict = {k.removeprefix("module."): v for k, v in state_dict.items()}
            model.load_state_dict(state_dict, strict=True)
            logger.info("Successfully loaded model weights from checkpoint.")
        except Exception as e:
            logger.error(f"Error loading model weights from {model_path}: {e}")
            raise RuntimeError(f"Failed to load AgroDoc model weights: {e}")
    else:
        logger.error(f"AgroDoc model checkpoint not found at {model_path}")
        raise FileNotFoundError(f"Model checkpoint not found: {model_path}")

    model = model.to(device)
    model.eval()
    _model_instance = model
    return _model_instance
