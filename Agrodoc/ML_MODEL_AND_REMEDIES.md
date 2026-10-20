# AgroDoc ML model and remedy guidance

## What is included
- MobileNetV3-Small, three classes: `early_blight`, `healthy`, `late_blight`.
- Existing inference endpoint integration under `backend/app/ml/`.
- Training script: `backend/scripts/train_tomato_model.py`.
- Validation-selected checkpoint, held-out test evaluation, per-class accuracy and confusion matrix output.
- Remedy guidance for each class in `backend/app/services/recommendation_service.py`.
- Low-confidence predictions return an explicitly uncertain label, no disease-specific treatment lists, and retake/expert-review guidance.
- Input handling respects EXIF orientation, supports grayscale/RGBA images, and validates tensor shape/finite values.
- Inference rejects malformed model outputs and non-finite logits rather than returning a potentially misleading result.
- Seven isolated ML regression tests are included in `backend/tests/test_ml_safety.py`.

## Run inference
Start the FastAPI backend as usual. The default checkpoint is
`backend/models/agrodoc_tomato_model.pth`. The loader expects MobileNetV3-Small weights
with a three-output classifier, matching the class order above.

## Retrain
Run these commands from the repository root (the directory containing `dataset/`):

```bash
python -m pip install -r backend/requirements.txt
python backend/scripts/train_tomato_model.py --epochs 15 --batch-size 32
```

The script uses ImageNet pretrained weights by default, so the first run may need internet
access to download them. If you need fully offline training, use `--no-pretrained`.
It saves the best validation-loss checkpoint to the configured output path and writes a
`.metrics.json` file with held-out test results. The checkpoint is written to a temporary
sibling file and atomically replaced after training, reducing the chance an interrupted save
corrupts the existing model. Back it up before retraining if you need to preserve the old one.

## Model-quality note
The shipped checkpoint was evaluated against all 677 images in `dataset/test` using the API's exact preprocessing pipeline. It scored **96.01% accuracy** (650/677 correct): early blight 90.00% (135/150), healthy 100.00% (240/240), late blight 95.82% (275/287). The confusion matrix (actual rows, predicted columns) is `[[135, 5, 10], [0, 240, 0], [11, 1, 275]]`.

These figures describe only this supplied split. They are not a guarantee of real-world accuracy; images may be correlated with training images, and field photos can differ in lighting, background, camera, cultivar, and disease stage. Use a genuinely independent field dataset before making production-quality claims. Retraining creates a new checkpoint and a fresh metrics report.

## Remedy safety
Recommendations are general crop-care guidance, not a confirmed diagnosis or a pesticide
prescription. Similar leaf symptoms can have different causes. Confirm suspected late blight
quickly with a local agricultural extension officer. Use only locally registered products
labelled for tomato and the target disease; follow the product label and local rules exactly.
No fixed pesticide dose is given because registrations and formulations vary by location.
