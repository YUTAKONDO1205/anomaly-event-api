#!/usr/bin/env python3
from __future__ import annotations

import copy
import base64
import hashlib
import io
import json
import random
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

try:
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from PIL import Image
    from torch.utils.data import DataLoader, Dataset
    from torchvision import transforms
    from torchvision.models import MobileNet_V2_Weights, mobilenet_v2
except Exception as exc:  # pragma: no cover
    sys.stderr.write(
        "Python dependencies are missing. Run `pip install -r requirements.txt` before using the deep learning pipeline.\n"
    )
    sys.stderr.write(f"{exc}\n")
    raise

MODEL_VERSION = "deep-mobilenetv2-v1"
MODEL_CLASSIFIER = "MobileNetV2 Transfer Learning"
IMAGE_SIZE = 160
BATCH_SIZE = 16
HEAD_EPOCHS = 2
FINETUNE_EPOCHS = 1
TRAIN_RATIO = 0.7
VALIDATION_RATIO = 0.15
HEAD_LR = 1e-3
FINETUNE_LR = 1e-4
WEIGHT_DECAY = 1e-4
ATTENTION_GRID = 6
RANDOM_SEED = 42
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


@dataclass
class ManifestEntry:
    file_path: Path
    label: int
    label_name: str


class CrackDataset(Dataset):
    def __init__(self, entries: list[ManifestEntry], transform):
        self.entries = entries
        self.transform = transform

    def __len__(self) -> int:
        return len(self.entries)

    def __getitem__(self, index: int):
        entry = self.entries[index]
        image = Image.open(entry.file_path).convert("RGB")
        tensor = self.transform(image)
        label = torch.tensor([float(entry.label)], dtype=torch.float32)
        return tensor, label


def read_stdin_payload() -> dict:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    return json.loads(raw)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def set_seed() -> None:
    random.seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)
    torch.manual_seed(RANDOM_SEED)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(RANDOM_SEED)


def manifest_signature(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def load_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data.get("images"), list):
        raise ValueError("Dataset manifest does not contain an images array")
    return data


def parse_entries(manifest: dict) -> list[ManifestEntry]:
    entries: list[ManifestEntry] = []
    for item in manifest["images"]:
        label_name = item["label"]
        entries.append(
            ManifestEntry(
                file_path=Path(item["filePath"]),
                label=1 if label_name == "Positive" else 0,
                label_name=label_name,
            )
        )
    return entries


def stratified_split(entries: list[ManifestEntry]) -> dict[str, list[ManifestEntry]]:
    positives = [entry for entry in entries if entry.label == 1]
    negatives = [entry for entry in entries if entry.label == 0]
    random.Random(RANDOM_SEED).shuffle(positives)
    random.Random(RANDOM_SEED + 1).shuffle(negatives)

    def split_group(group: list[ManifestEntry]) -> tuple[list[ManifestEntry], list[ManifestEntry], list[ManifestEntry]]:
        total = len(group)
        train_end = max(1, int(total * TRAIN_RATIO))
        validation_end = max(train_end + 1, int(total * (TRAIN_RATIO + VALIDATION_RATIO)))
        validation_end = min(validation_end, total - 1)
        return group[:train_end], group[train_end:validation_end], group[validation_end:]

    pos_train, pos_val, pos_test = split_group(positives)
    neg_train, neg_val, neg_test = split_group(negatives)

    train = pos_train + neg_train
    validation = pos_val + neg_val
    test = pos_test + neg_test
    random.Random(RANDOM_SEED).shuffle(train)
    random.Random(RANDOM_SEED + 1).shuffle(validation)
    random.Random(RANDOM_SEED + 2).shuffle(test)
    return {"train": train, "validation": validation, "test": test}


def build_transforms():
    train_transform = transforms.Compose(
        [
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(brightness=0.1, contrast=0.1),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )
    eval_transform = transforms.Compose(
        [
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )
    return train_transform, eval_transform


def build_dataloaders(entries: list[ManifestEntry]) -> tuple[dict[str, DataLoader], dict]:
    train_transform, eval_transform = build_transforms()
    split = stratified_split(entries)
    loaders = {
        "train": DataLoader(
            CrackDataset(split["train"], train_transform),
            batch_size=BATCH_SIZE,
            shuffle=True,
            num_workers=0,
        ),
        "validation": DataLoader(
            CrackDataset(split["validation"], eval_transform),
            batch_size=BATCH_SIZE,
            shuffle=False,
            num_workers=0,
        ),
        "test": DataLoader(
            CrackDataset(split["test"], eval_transform),
            batch_size=BATCH_SIZE,
            shuffle=False,
            num_workers=0,
        ),
    }
    return loaders, split


def get_device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def build_model(pretrained: bool = True) -> nn.Module:
    if pretrained:
        try:
            model = mobilenet_v2(weights=MobileNet_V2_Weights.DEFAULT)
        except Exception:
            model = mobilenet_v2(weights=None)
    else:
        model = mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, 1)
    return model


def freeze_backbone(model: nn.Module) -> None:
    for param in model.features.parameters():
        param.requires_grad = False
    for param in model.classifier.parameters():
        param.requires_grad = True


def unfreeze_tail(model: nn.Module) -> None:
    for layer in model.features[-4:]:
        for param in layer.parameters():
            param.requires_grad = True


def sigmoid_scores(logits: torch.Tensor) -> torch.Tensor:
    return torch.sigmoid(logits.view(-1))


def log_loss(y_true: np.ndarray, y_score: np.ndarray) -> float:
    eps = 1e-7
    y_score = np.clip(y_score, eps, 1.0 - eps)
    return float(-(y_true * np.log(y_score) + (1.0 - y_true) * np.log(1.0 - y_score)).mean())


def auc_score(y_true: np.ndarray, y_score: np.ndarray) -> float:
    positive = y_score[y_true == 1]
    negative = y_score[y_true == 0]
    if len(positive) == 0 or len(negative) == 0:
        return 0.5
    wins = 0.0
    for pos in positive:
        wins += float((pos > negative).sum())
        wins += 0.5 * float((pos == negative).sum())
    return wins / float(len(positive) * len(negative))


def binary_metrics(y_true: np.ndarray, y_score: np.ndarray, threshold: float) -> dict:
    y_pred = (y_score >= threshold).astype(np.float32)
    tp = float(np.logical_and(y_true == 1, y_pred == 1).sum())
    tn = float(np.logical_and(y_true == 0, y_pred == 0).sum())
    fp = float(np.logical_and(y_true == 0, y_pred == 1).sum())
    fn = float(np.logical_and(y_true == 1, y_pred == 0).sum())
    accuracy = (tp + tn) / max(1.0, tp + tn + fp + fn)
    precision = tp / max(1.0, tp + fp)
    recall = tp / max(1.0, tp + fn)
    f1 = 2.0 * precision * recall / max(1e-8, precision + recall)
    return {
        "accuracy": round(float(accuracy), 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1": round(float(f1), 4),
        "auc": round(float(auc_score(y_true, y_score)), 4),
    }


def choose_threshold(y_true: np.ndarray, y_score: np.ndarray) -> float:
    best_threshold = 0.5
    best_f1 = -1.0
    for threshold in np.linspace(0.25, 0.75, 51):
        metrics = binary_metrics(y_true, y_score, float(threshold))
        if metrics["f1"] > best_f1:
            best_f1 = metrics["f1"]
            best_threshold = float(threshold)
    return round(best_threshold, 4)


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device, criterion) -> tuple[float, np.ndarray, np.ndarray]:
    model.eval()
    losses: list[float] = []
    all_scores: list[float] = []
    all_labels: list[float] = []

    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            logits = model(images)
            loss = criterion(logits, labels)
            losses.append(float(loss.item()))
            all_scores.extend(sigmoid_scores(logits).cpu().numpy().tolist())
            all_labels.extend(labels.view(-1).cpu().numpy().tolist())

    return float(np.mean(losses)), np.asarray(all_labels, dtype=np.float32), np.asarray(all_scores, dtype=np.float32)


def train_phase(
    model: nn.Module,
    loaders: dict[str, DataLoader],
    device: torch.device,
    epochs: int,
    learning_rate: float,
    best_state: dict | None = None,
    best_val_loss: float = float("inf"),
) -> tuple[dict, float, list[dict]]:
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(
        [param for param in model.parameters() if param.requires_grad],
        lr=learning_rate,
        weight_decay=WEIGHT_DECAY,
    )
    history: list[dict] = []
    current_best_state = best_state
    current_best_loss = best_val_loss

    for epoch in range(epochs):
        model.train()
        train_losses: list[float] = []
        for images, labels in loaders["train"]:
            images = images.to(device)
            labels = labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            train_losses.append(float(loss.item()))

        val_loss, val_labels, val_scores = evaluate(model, loaders["validation"], device, criterion)
        val_auc = auc_score(val_labels, val_scores)
        history.append(
            {
                "epoch": epoch + 1,
                "trainLoss": round(float(np.mean(train_losses)), 5),
                "valLoss": round(val_loss, 5),
                "valAuc": round(float(val_auc), 5),
            }
        )

        if val_loss < current_best_loss:
            current_best_loss = val_loss
            current_best_state = copy.deepcopy(model.state_dict())

    return current_best_state, current_best_loss, history


def weights_path_for(model_path: Path) -> Path:
    return model_path.with_suffix(".pt")


def train_model(manifest_path: Path, model_path: Path) -> dict:
    set_seed()
    manifest = load_manifest(manifest_path)
    entries = parse_entries(manifest)
    if not entries:
        raise ValueError("Dataset manifest does not contain any indexed images")

    loaders, split = build_dataloaders(entries)
    device = get_device()
    model = build_model(pretrained=True).to(device)

    freeze_backbone(model)
    best_state, best_val_loss, head_history = train_phase(model, loaders, device, HEAD_EPOCHS, HEAD_LR)

    if best_state is not None:
        model.load_state_dict(best_state)

    unfreeze_tail(model)
    best_state, best_val_loss, finetune_history = train_phase(
        model,
        loaders,
        device,
        FINETUNE_EPOCHS,
        FINETUNE_LR,
        best_state=best_state,
        best_val_loss=best_val_loss,
    )

    if best_state is not None:
        model.load_state_dict(best_state)

    criterion = nn.BCEWithLogitsLoss()
    _, val_labels, val_scores = evaluate(model, loaders["validation"], device, criterion)
    _, test_labels, test_scores = evaluate(model, loaders["test"], device, criterion)
    threshold = choose_threshold(val_labels, val_scores)
    metrics = binary_metrics(test_labels, test_scores, threshold)
    metrics["recommendedThreshold"] = round(float(threshold), 4)

    model_path.parent.mkdir(parents=True, exist_ok=True)
    weights_path = weights_path_for(model_path)
    torch.save(model.state_dict(), weights_path)

    artifact = {
        "classifier": MODEL_CLASSIFIER,
        "architecture": "torchvision.mobilenet_v2",
        "version": MODEL_VERSION,
        "trainedAt": now_iso(),
        "manifestSignature": manifest_signature(manifest_path),
        "weightsFile": str(weights_path),
        "imageSize": IMAGE_SIZE,
        "preprocessing": {
            "mean": IMAGENET_MEAN,
            "std": IMAGENET_STD,
        },
        "dataset": {
            "positive": sum(1 for entry in entries if entry.label == 1),
            "negative": sum(1 for entry in entries if entry.label == 0),
            "total": len(entries),
            "manifestGeneratedAt": manifest.get("generatedAt"),
            "train": len(split["train"]),
            "validation": len(split["validation"]),
            "test": len(split["test"]),
        },
        "metrics": metrics,
        "trainingHistory": {
            "head": head_history,
            "finetune": finetune_history,
        },
        "device": str(device),
    }
    model_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return artifact


def load_or_train_model(manifest_path: Path, model_path: Path, force_retrain: bool = False) -> dict:
    signature = manifest_signature(manifest_path)
    if not force_retrain and model_path.exists():
        artifact = json.loads(model_path.read_text(encoding="utf-8"))
        weights_file = Path(artifact.get("weightsFile", ""))
        if (
            artifact.get("manifestSignature") == signature
            and artifact.get("version") == MODEL_VERSION
            and weights_file.exists()
        ):
            return artifact
    return train_model(manifest_path, model_path)


def load_model_for_inference(artifact: dict, device: torch.device) -> nn.Module:
    model = build_model(pretrained=False).to(device)
    state_dict = torch.load(artifact["weightsFile"], map_location=device)
    model.load_state_dict(state_dict)
    model.eval()
    return model


def build_eval_transform():
    return transforms.Compose(
        [
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )


def load_image_tensor(image_path: Path, device: torch.device) -> torch.Tensor:
    image = Image.open(image_path).convert("RGB")
    tensor = build_eval_transform()(image).unsqueeze(0).to(device)
    return tensor


def confidence_band(probability: float) -> str:
    if probability >= 0.85 or probability <= 0.15:
        return "HIGH"
    if probability >= 0.7 or probability <= 0.3:
        return "MEDIUM"
    return "LOW"


def pool_grid(values: np.ndarray, rows: int, cols: int) -> np.ndarray:
    height, width = values.shape
    row_splits = np.linspace(0, height, rows + 1, dtype=int)
    col_splits = np.linspace(0, width, cols + 1, dtype=int)
    pooled = []
    for row_index in range(rows):
        for col_index in range(cols):
            cell = values[row_splits[row_index] : row_splits[row_index + 1], col_splits[col_index] : col_splits[col_index + 1]]
            pooled.append(float(cell.mean()) if cell.size else 0.0)
    return np.asarray(pooled, dtype=np.float32)


def normalize_rgb_image(image_path: Path) -> np.ndarray:
    image = Image.open(image_path).convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE))
    return np.asarray(image, dtype=np.uint8)


def apply_heatmap_palette(heatmap: np.ndarray) -> np.ndarray:
    clipped = np.clip(heatmap, 0.0, 1.0)
    red = np.clip(1.8 * clipped - 0.35, 0.0, 1.0)
    green = np.clip(1.9 - 2.4 * np.abs(clipped - 0.5), 0.0, 1.0)
    blue = np.clip(1.35 - 1.7 * clipped, 0.0, 1.0)
    stacked = np.stack([red, green, blue], axis=-1)
    return (stacked * 255.0).astype(np.uint8)


def png_data_url_base64(image_array: np.ndarray) -> str:
    buffer = io.BytesIO()
    Image.fromarray(image_array).save(buffer, format="PNG")
    encoded = buffer.getvalue()
    return "data:image/png;base64," + base64.b64encode(encoded).decode("ascii")


def build_heatmap_output(image_path: Path, heatmap: np.ndarray, alpha: float = 0.42) -> dict:
    base_image = normalize_rgb_image(image_path)
    heatmap_rgb = apply_heatmap_palette(heatmap)
    overlay = np.clip(base_image.astype(np.float32) * (1.0 - alpha) + heatmap_rgb.astype(np.float32) * alpha, 0, 255).astype(np.uint8)
    return {
        "width": IMAGE_SIZE,
        "height": IMAGE_SIZE,
        "alpha": alpha,
        "rawDataUrl": png_data_url_base64(heatmap_rgb),
        "overlayDataUrl": png_data_url_base64(overlay),
    }


def compute_gradcam(model: nn.Module, input_tensor: torch.Tensor) -> np.ndarray:
    activations = None
    gradients = None

    def save_gradient(grad):
        nonlocal gradients
        gradients = grad

    def forward_hook(_module, _inputs, output):
        nonlocal activations
        activations = output
        output.register_hook(save_gradient)

    handle = model.features[-1].register_forward_hook(forward_hook)
    try:
        model.zero_grad(set_to_none=True)
        logits = model(input_tensor)
        logits[:, 0].backward(torch.ones_like(logits[:, 0]))
        if activations is None or gradients is None:
            raise RuntimeError("Failed to capture MobileNet feature maps for Grad-CAM")

        pooled_gradients = gradients.mean(dim=(2, 3), keepdim=True)
        cam = torch.relu((pooled_gradients * activations).sum(dim=1, keepdim=True))
        cam = F.interpolate(cam, size=(IMAGE_SIZE, IMAGE_SIZE), mode="bilinear", align_corners=False)
        cam = cam[0, 0]
        cam = cam - cam.min()
        cam = cam / (cam.max() + 1e-8)
        return cam.detach().cpu().numpy()
    finally:
        handle.remove()


def build_focus_regions(attention_grid: np.ndarray) -> list[dict]:
    indexed = sorted(enumerate(attention_grid.tolist()), key=lambda item: item[1], reverse=True)[:3]
    regions = []
    for rank, (index, intensity) in enumerate(indexed, start=1):
        row_index = index // ATTENTION_GRID
        col_index = index % ATTENTION_GRID
        regions.append(
            {
                "id": f"region-{rank}",
                "label": f"Activation {rank}",
                "x": round(col_index / ATTENTION_GRID, 4),
                "y": round(row_index / ATTENTION_GRID, 4),
                "width": round(1.0 / ATTENTION_GRID, 4),
                "height": round(1.0 / ATTENTION_GRID, 4),
                "intensity": round(float(intensity), 4),
            }
        )
    return regions


def build_contributions(probability: float, attention_grid: np.ndarray) -> list[dict]:
    contributions = [
        {
            "key": "crack_probability",
            "label": "Crack probability",
            "value": round(float(probability), 4),
            "contribution": round(float(probability), 4),
            "direction": "supports" if probability >= 0.5 else "suppresses",
        },
        {
            "key": "normal_probability",
            "label": "Normal surface probability",
            "value": round(float(1.0 - probability), 4),
            "contribution": round(float(1.0 - probability), 4),
            "direction": "supports" if probability < 0.5 else "suppresses",
        },
    ]

    indexed = sorted(enumerate(attention_grid.tolist()), key=lambda item: item[1], reverse=True)[:4]
    for rank, (index, intensity) in enumerate(indexed, start=1):
        row_index = index // ATTENTION_GRID
        col_index = index % ATTENTION_GRID
        contributions.append(
            {
                "key": f"activation_{rank}",
                "label": f"Activation block {row_index + 1}-{col_index + 1}",
                "value": round(float(intensity), 4),
                "contribution": round(float(intensity), 4),
                "direction": "supports",
            }
        )

    return contributions[:6]


def build_summary(
    probability: float,
    regions: list[dict],
    target_label: str = "Positive",
    negative_label: str = "Negative",
) -> str:
    confidence = probability * 100.0
    negative_confidence = (1.0 - probability) * 100.0
    hotspot_count = len([region for region in regions if region["intensity"] >= 0.35]) or 1
    if probability >= 0.5:
        return (
            f"Deep model activated around {hotspot_count} region(s), and the {target_label} probability reached {confidence:.1f}%."
        )
    return (
        "Deep model kept the frame close to the normal texture manifold, "
        f"with {negative_label} confidence at {negative_confidence:.1f}%."
    )


def infer(payload: dict) -> dict:
    manifest_path = Path(payload["manifestPath"])
    model_path = Path(payload["modelPath"])
    image_path = Path(payload["imagePath"])
    target_label = payload.get("targetLabel", "Positive")
    threshold_percent = float(payload.get("threshold", 55))

    artifact = load_or_train_model(manifest_path, model_path)
    device = get_device()
    model = load_model_for_inference(artifact, device)
    input_tensor = load_image_tensor(image_path, device)

    with torch.no_grad():
        logits = model(input_tensor)
        probability = float(torch.sigmoid(logits[0, 0]).item())

    heatmap = compute_gradcam(model, input_tensor)
    attention_grid = pool_grid(heatmap, ATTENTION_GRID, ATTENTION_GRID)
    heatmap_output = build_heatmap_output(image_path, heatmap)
    focus_regions = build_focus_regions(attention_grid)
    contributions = build_contributions(probability, attention_grid)
    summary = build_summary(probability, focus_regions, target_label=target_label)
    confidence = round(probability * 100.0, 2)
    anomaly_detected = confidence >= threshold_percent
    dominant_signals = [item["label"] for item in contributions[:3]]

    labels = [
        {"name": target_label, "confidence": confidence},
        {"name": "Negative", "confidence": round(100.0 - confidence, 2)},
    ]
    labels.sort(key=lambda item: item["confidence"], reverse=True)

    return {
        "anomalyDetected": anomaly_detected,
        "anomalyConfidence": confidence,
        "labels": labels,
        "provider": "python",
        "model": {
            "provider": "python",
            "classifier": artifact["classifier"],
            "version": artifact["version"],
            "trainedAt": artifact.get("trainedAt"),
            "ready": True,
            "metrics": artifact.get("metrics"),
            "dataset": artifact.get("dataset"),
        },
        "explanation": {
            "summary": summary,
            "confidenceBand": confidence_band(probability),
            "dominantSignals": dominant_signals,
            "recommendedAction": (
                "Flag this frame for operator review and move the event into CHECKING."
                if anomaly_detected
                else "Keep monitoring. Capture another angle if you want a second deep-learning pass."
            ),
            "contributions": contributions,
            "focusRegions": focus_regions,
            "attentionGrid": {
                "rows": ATTENTION_GRID,
                "cols": ATTENTION_GRID,
                "values": [round(float(value), 4) for value in attention_grid.tolist()],
            },
            "heatmap": heatmap_output,
        },
    }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: crack_ml.py [train|infer]")

    command = sys.argv[1].strip().lower()
    payload = read_stdin_payload()

    if command == "train":
        manifest_path = Path(payload["manifestPath"])
        model_path = Path(payload["modelPath"])
        artifact = load_or_train_model(manifest_path, model_path, force_retrain=True)
        sys.stdout.write(
            json.dumps(
                {
                    "message": "Deep learning model trained",
                    "modelPath": str(model_path),
                    "weightsPath": artifact["weightsFile"],
                    "classifier": artifact["classifier"],
                    "metrics": artifact["metrics"],
                    "dataset": artifact["dataset"],
                }
            )
        )
        return

    if command == "infer":
        sys.stdout.write(json.dumps(infer(payload)))
        return

    raise SystemExit(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
