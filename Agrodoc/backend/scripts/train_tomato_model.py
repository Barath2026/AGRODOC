#!/usr/bin/env python3
"""Train/evaluate AgroDoc's 3-class tomato leaf classifier.

Expected folders:
  dataset/train/{early_blight,healthy,late_blight}/
  dataset/validation/{...}/
  dataset/test/{...}/

Run from the repository root:
  python backend/scripts/train_tomato_model.py --epochs 15 --batch-size 32
The output is a plain MobileNetV3-Small state_dict compatible with app/ml/model_loader.py.
"""
from __future__ import annotations

import argparse
import copy
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms

CLASSES = ["early_blight", "healthy", "late_blight"]
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def build_model(pretrained: bool) -> nn.Module:
    weights = models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
    model = models.mobilenet_v3_small(weights=weights)
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, len(CLASSES))
    return model


def evaluate(model, loader, device, criterion):
    model.eval()
    loss_total = 0.0
    correct = total = 0
    class_correct = [0] * len(CLASSES)
    class_total = [0] * len(CLASSES)
    confusion = np.zeros((len(CLASSES), len(CLASSES)), dtype=int)
    with torch.inference_mode():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            logits = model(images)
            loss_total += criterion(logits, labels).item() * labels.size(0)
            preds = logits.argmax(1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)
            for actual, pred in zip(labels.cpu().tolist(), preds.cpu().tolist()):
                class_total[actual] += 1
                class_correct[actual] += int(actual == pred)
                confusion[actual, pred] += 1
    return {
        "loss": loss_total / max(total, 1),
        "accuracy": correct / max(total, 1),
        "per_class_accuracy": {
            CLASSES[i]: class_correct[i] / max(class_total[i], 1) for i in range(len(CLASSES))
        },
        "confusion_matrix_rows_actual_cols_predicted": confusion.tolist(),
        "samples": total,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="dataset")
    parser.add_argument("--output", default="backend/models/agrodoc_tomato_model.pth")
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=0.0005)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-pretrained", action="store_true",
                        help="Do not download/use ImageNet pretrained weights.")
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1:
        parser.error("--epochs and --batch-size must be positive")

    seed_everything(args.seed)
    data_dir = Path(args.data_dir)
    train_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(12),
        transforms.ColorJitter(brightness=0.12, contrast=0.12, saturation=0.10),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])
    datasets_by_split = {
        "train": datasets.ImageFolder(data_dir / "train", transform=train_tf),
        "validation": datasets.ImageFolder(data_dir / "validation", transform=eval_tf),
        "test": datasets.ImageFolder(data_dir / "test", transform=eval_tf),
    }
    for split, ds in datasets_by_split.items():
        if ds.classes != CLASSES:
            raise ValueError(
                f"{split} class order/names are {ds.classes}; expected {CLASSES}. "
                "ImageFolder sorts folder names alphabetically."
            )
        if len(ds) == 0:
            raise ValueError(f"No images found in {data_dir / split}")
        split_counts = np.bincount(ds.targets, minlength=len(CLASSES))
        missing = [CLASSES[i] for i, count in enumerate(split_counts) if count == 0]
        if missing:
            raise ValueError(f"{split} split has no images for class(es): {missing}")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    workers = min(4, os_cpu_count())
    loaders = {
        "train": DataLoader(datasets_by_split["train"], batch_size=args.batch_size,
                            shuffle=True, num_workers=workers, pin_memory=device.type == "cuda"),
        "validation": DataLoader(datasets_by_split["validation"], batch_size=args.batch_size,
                                 shuffle=False, num_workers=workers, pin_memory=device.type == "cuda"),
        "test": DataLoader(datasets_by_split["test"], batch_size=args.batch_size,
                           shuffle=False, num_workers=workers, pin_memory=device.type == "cuda"),
    }
    # Inverse-frequency class weights help reduce majority-class bias.
    counts = np.bincount(datasets_by_split["train"].targets, minlength=len(CLASSES))
    if np.any(counts == 0):
        missing = [CLASSES[i] for i, count in enumerate(counts) if count == 0]
        raise ValueError(f"Training split has no images for class(es): {missing}")
    weights = torch.tensor(counts.sum() / (len(CLASSES) * counts), dtype=torch.float32, device=device)
    criterion = nn.CrossEntropyLoss(weight=weights)
    model = build_model(pretrained=not args.no_pretrained).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", patience=2, factor=0.5)

    best_loss = float("inf")
    best_state = copy.deepcopy(model.state_dict())
    history = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss = correct = total = 0
        for images, labels in loaders["train"]:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * labels.size(0)
            correct += (logits.argmax(1) == labels).sum().item()
            total += labels.size(0)
        val = evaluate(model, loaders["validation"], device, criterion)
        train_metrics = {"loss": running_loss / max(total, 1), "accuracy": correct / max(total, 1)}
        scheduler.step(val["loss"])
        history.append({"epoch": epoch, "train": train_metrics, "validation": val})
        print(f"Epoch {epoch:02d}/{args.epochs} train_acc={train_metrics['accuracy']:.3f} "
              f"val_acc={val['accuracy']:.3f} val_loss={val['loss']:.4f}")
        if val["loss"] < best_loss:
            best_loss = val["loss"]
            best_state = copy.deepcopy(model.state_dict())

    model.load_state_dict(best_state)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Plain state_dict keeps compatibility with the existing API model loader.
    # Write to a temporary sibling first, then replace atomically so an interrupted
    # save cannot truncate the currently working checkpoint.
    temporary_output = output.with_suffix(output.suffix + ".tmp")
    torch.save(model.cpu().state_dict(), temporary_output)
    temporary_output.replace(output)
    model.to(device)
    test_metrics = evaluate(model, loaders["test"], device, criterion)
    report_path = output.with_suffix(".metrics.json")
    report_path.write_text(json.dumps({
        "classes": CLASSES,
        "best_validation_loss": best_loss,
        "test": test_metrics,
        "history": history,
        "device": str(device),
        "train_class_counts": dict(zip(CLASSES, counts.tolist())),
    }, indent=2), encoding="utf-8")
    print(f"Saved model: {output}")
    print(f"Saved evaluation metrics: {report_path}")
    print("Held-out test metrics:", json.dumps(test_metrics, indent=2))


def os_cpu_count():
    import os
    return os.cpu_count() or 1


if __name__ == "__main__":
    main()
