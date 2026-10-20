from typing import Dict, Any, Tuple
from PIL import Image
import torch
from .model_loader import load_model, get_device, CLASS_NAMES
from .preprocessing import preprocess_image
from ..services.recommendation_service import get_disease_knowledge
from ..config import settings


def predict_image(image: Image.Image) -> Dict[str, Any]:
    """
    Executes real deep-learning inference using the trained MobileNetV3 tomato disease model.
    """
    model = load_model()
    device = get_device()
    
    # Preprocess
    tensor = preprocess_image(image).to(device)
    
    # Inference: inference_mode reduces autograd overhead and prevents accidental
    # graph creation in this read-only path.
    with torch.inference_mode():
        outputs = model(tensor)
        if outputs.ndim != 2 or outputs.shape[0] != 1 or outputs.shape[1] != len(CLASS_NAMES):
            raise RuntimeError(
                f"Model returned unexpected output shape {tuple(outputs.shape)}; "
                f"expected (1, {len(CLASS_NAMES)})"
            )
        if not torch.isfinite(outputs).all():
            raise RuntimeError("Model returned non-finite logits; refusing to produce a diagnosis")
        probabilities = torch.softmax(outputs, dim=1)[0]
        if not torch.isfinite(probabilities).all():
            raise RuntimeError("Model produced invalid probabilities")
        confidence_val, predicted_idx = torch.max(probabilities, dim=0)

    idx = int(predicted_idx.item())
    class_key = CLASS_NAMES[idx]
    confidence_pct = float(confidence_val.item()) * 100.0

    # Build probabilities map
    prob_dict = {
        CLASS_NAMES[i]: round(float(probabilities[i].item()) * 100.0, 2)
        for i in range(len(CLASS_NAMES))
    }

    # Confidence level mapping
    if confidence_pct < settings.confidence_threshold:
        confidence_level = "uncertain"
        warning = "Low-confidence result. Please capture a clear image of the tomato leaf and try again."
    elif confidence_pct < 80.0:
        confidence_level = "moderate"
        warning = None
    else:
        confidence_level = "high"
        warning = None

    # Disease knowledge base. A low-confidence output must be presented as uncertain,
    # not as a confirmed diagnosis or a reason to immediately apply chemicals.
    kb = get_disease_knowledge(class_key)
    if confidence_pct < settings.confidence_threshold:
        combined_recommendations = [
            "The model is uncertain. Retake a sharp photo in natural light, showing the whole leaf and both sides.",
            "Check several leaves and consult a local agricultural extension officer before applying any treatment.",
        ]
        # Keep the response schema stable, but do not expose disease-specific
        # treatment advice when the classifier itself reports low confidence.
        organic_solutions = []
        chemical_treatments = []
        health_status = "Uncertain"
        display_prediction = "Uncertain — retake image"
        display_disease = "Uncertain classification"
    else:
        organic_solutions = list(kb["organic_solutions"])
        chemical_treatments = list(kb["chemical_treatments"])
        health_status = kb["health_status"]
        display_prediction = kb["display_name"]
        display_disease = kb["display_name"]
        combined_recommendations = organic_solutions + chemical_treatments

    return {
        "class_key": class_key,
        "prediction": display_prediction,
        "confidence": round(confidence_pct, 2),
        "confidence_level": confidence_level,
        "health_status": health_status,
        "disease": display_disease,
        "specimen": kb["specimen"],
        "analysis": (
            "The model could not make a reliable classification from this image. "
            "Please retake the photo in natural light and seek local expert confirmation."
            if confidence_pct < settings.confidence_threshold else kb["analysis"]
        ),
        "organic_solutions": organic_solutions,
        "chemical_treatments": chemical_treatments,
        "recommendations": combined_recommendations,
        "pest_vector": kb["pest_vector"],
        "nutritional_status": kb["nutritional_status"],
        "fruit_quality": kb["fruit_quality"],
        "monitoring_advice": kb["monitoring_advice"],
        "warning": warning,
        "probabilities": prob_dict,
        "model_version": settings.model_version,
    }
