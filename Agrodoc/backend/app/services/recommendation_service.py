"""Evidence-informed tomato disease guidance.

Recommendations are intentionally conservative: image classification is not a laboratory
diagnosis, and pesticide registration/labels vary by country and crop.
"""
from typing import Any, Dict

DISEASE_KNOWLEDGE_BASE: Dict[str, Dict[str, Any]] = {
    "early_blight": {
        "display_name": "Tomato early blight",
        "health_status": "At risk",
        "specimen": "Tomato leaf",
        "description": "A fungal disease commonly associated with Alternaria species.",
        "analysis": "The image is most consistent with early blight. Typical signs include brown lesions with concentric rings and yellowing, often on older lower leaves. Other problems can look similar, so inspect the whole plant.",
        "symptoms": "Brown, target-like rings; yellowing around lesions; older leaves affected first.",
        "impact": "Severe defoliation can reduce plant vigor and expose fruit to sunscald.",
        "organic_solutions": [
            "Remove badly affected lower leaves with clean tools; do not leave infected debris in the field.",
            "Keep foliage as dry as practical: use drip/soil-level irrigation, water early, and avoid working among wet plants.",
            "Provide adequate plant spacing and airflow; control volunteer tomato plants and weeds that can harbor disease.",
            "Use disease-free transplants and rotate away from tomato and potato crops where practical.",
            "If considering a biological or organically approved product, choose one registered for tomato and the target disease locally and follow its label."
        ],
        "chemical_treatments": [
            "If disease is spreading, ask a local agricultural extension officer or licensed agronomist about a fungicide currently registered for tomato early blight in your area.",
            "Use only products whose label explicitly permits the crop and use; follow label rates, protective equipment, re-entry interval, and pre-harvest interval.",
            "Rotate fungicide modes of action as directed by the product label to reduce resistance risk. Do not mix products unless the labels allow it."
        ],
        "pest_vector": "Not typically spread by an insect vector; infected plant debris and splashing water can spread spores.",
        "nutritional_status": "A photograph cannot reliably determine soil nutrient status. Use a soil/leaf test before changing fertilizer.",
        "fruit_quality": "Defoliation may expose fruit to sunscald.",
        "monitoring_advice": "Inspect lower and middle leaves twice weekly, especially after humid or rainy weather. Photograph new lesions and track spread."
    },
    "late_blight": {
        "display_name": "Tomato late blight",
        "health_status": "At risk",
        "specimen": "Tomato leaf",
        "description": "A potentially fast-moving disease caused by the oomycete Phytophthora infestans.",
        "analysis": "The image is most consistent with late blight. Typical signs can include rapidly enlarging, water-soaked dark lesions and pale growth at lesion edges in humid conditions. Because it can spread quickly and look similar to other disorders, seek prompt local confirmation.",
        "symptoms": "Irregular water-soaked dark lesions, rapid tissue collapse, and sometimes pale growth on leaf undersides in humid weather.",
        "impact": "Can spread rapidly through foliage and fruit during favorable weather.",
        "organic_solutions": [
            "Treat a suspected outbreak as urgent: isolate the affected area where possible and avoid moving wet plant material through the crop.",
            "Ask a local agricultural extension officer to confirm the diagnosis promptly; remove and dispose of heavily affected material according to local guidance.",
            "Avoid overhead irrigation, improve airflow, and sanitize tools after handling affected plants.",
            "Do not compost visibly diseased material unless local extension guidance confirms the composting process is adequate."
        ],
        "chemical_treatments": [
            "Contact a local agricultural extension officer or licensed agronomist promptly for a currently registered late-blight product and local control plan.",
            "Only use products labelled for tomato and late blight in your jurisdiction; follow label rates, PPE, re-entry and pre-harvest intervals exactly.",
            "Do not rely on a product intended for other fungal diseases; late blight is caused by an oomycete and product choice matters."
        ],
        "pest_vector": "Spores can spread through wind and rain splash; no insect vector is required.",
        "nutritional_status": "A leaf image cannot diagnose nutrient deficiency. Avoid corrective fertilizer applications without supporting evidence.",
        "fruit_quality": "Fruit can develop firm, brown, irregular lesions and become unmarketable.",
        "monitoring_advice": "Inspect daily during cool, wet, foggy, or overcast conditions. Seek expert confirmation quickly if lesions are spreading."
    },
    "healthy": {
        "display_name": "No visible disease detected",
        "health_status": "Healthy",
        "specimen": "Tomato leaf",
        "description": "The model did not identify the two target diseases in this image.",
        "analysis": "No clear signs of early or late blight were identified by the model. This does not guarantee the plant is disease-free; check stems, fruit, leaf undersides, and neighboring plants.",
        "symptoms": "No obvious target disease pattern detected in the submitted image.",
        "impact": "Continue routine crop monitoring.",
        "organic_solutions": [
            "Scout plants weekly and after heavy rain; inspect both leaf surfaces, stems, and fruit.",
            "Water at soil level where practical and avoid prolonged leaf wetness.",
            "Maintain airflow, remove dead plant debris, and use clean tools.",
            "Use balanced fertilizer based on soil testing and local crop recommendations."
        ],
        "chemical_treatments": [
            "No disease-specific pesticide treatment is indicated by this image alone.",
            "Do not apply fungicides preventively unless local extension guidance and the product label support their use."
        ],
        "pest_vector": "No insect vector can be assessed reliably from a leaf-only classification.",
        "nutritional_status": "Nutrient status cannot be determined reliably from this image; use soil or leaf testing if deficiency is suspected.",
        "fruit_quality": "Not assessed by this leaf image.",
        "monitoring_advice": "Continue weekly scouting and rescan if new spots, yellowing, or wilting appear."
    }
}


def get_disease_knowledge(class_key: str) -> Dict[str, Any]:
    """Return guidance for a known model class; unknown labels never default to healthy."""
    key = class_key.strip().lower().replace(" ", "_")
    if key not in DISEASE_KNOWLEDGE_BASE:
        raise ValueError(f"Unknown disease class: {class_key}")
    return DISEASE_KNOWLEDGE_BASE[key]
