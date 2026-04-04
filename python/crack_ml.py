#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except Exception as exc:  # pragma: no cover
    sys.stderr.write(
        "Python dependencies are missing. Run `pip install -r requirements.txt` before using the local ML pipeline.\n"
    )
    sys.stderr.write(f"{exc}\n")
    raise

MODEL_VERSION = "local-crack-ml-v1"
IMAGE_SIZE = 160
FEATURE_GRID = 4
ATTENTION_GRID = 6
TRAIN_RATIO = 0.7
VALIDATION_RATIO = 0.15
TRAINING_STEPS = 700
BASE_LEARNING_RATE = 0.24
REGULARIZATION = 0.012
RANDOM_SEED = 42

FEATURE_LABELS = {
    "darkness": "Surface darkness",
    "contrast": "Local contrast",
    "edge_density": "Edge density",
    "dark_edge_density": "Dark edge density",
    "texture_energy": "Texture energy",
    "entropy": "Texture entropy",
    "orientation_bias": "Directional continuity",
    "hotspot_spread": "Hotspot spread",
    "central_focus": "Central focus",
}


def read_stdin_payload() -> dict:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    return json.loads(raw)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sigmoid(values: np.ndarray) -> np.ndarray:
    clipped = np.clip(values, -35.0, 35.0)
    return 1.0 / (1.0 + np.exp(-clipped))


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
    for threshold in np.linspace(0.35, 0.8, 46):
        metrics = binary_metrics(y_true, y_score, float(threshold))
        if metrics["f1"] > best_f1:
            best_f1 = metrics["f1"]
            best_threshold = float(threshold)
    return round(best_threshold, 4)


def manifest_signature(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def load_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data.get("images"), list):
        raise ValueError("Dataset manifest does not contain an images array")
    return data


def resampling_filter():
    try:
        return Image.Resampling.BILINEAR
    except AttributeError:  # pragma: no cover
        return Image.BILINEAR


def load_gray_image(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE), resampling_filter())
    rgb = np.asarray(image, dtype=np.float32) / 255.0
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def sobel(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    gx = (
        -gray[:-2, :-2]
        - 2.0 * gray[1:-1, :-2]
        - gray[2:, :-2]
        + gray[:-2, 2:]
        + 2.0 * gray[1:-1, 2:]
        + gray[2:, 2:]
    )
    gy = (
        -gray[:-2, :-2]
        - 2.0 * gray[:-2, 1:-1]
        - gray[:-2, 2:]
        + gray[2:, :-2]
        + 2.0 * gray[2:, 1:-1]
        + gray[2:, 2:]
    )
    grad = np.sqrt(gx ** 2 + gy ** 2)
    center = gray[1:-1, 1:-1]
    return gx, gy, grad, center


def grid_pool(values: np.ndarray, rows: int, cols: int) -> np.ndarray:
    height, width = values.shape
    row_splits = np.linspace(0, height, rows + 1, dtype=int)
    col_splits = np.linspace(0, width, cols + 1, dtype=int)
    pooled = []
    for row_index in range(rows):
        for col_index in range(cols):
            cell = values[row_splits[row_index] : row_splits[row_index + 1], col_splits[col_index] : col_splits[col_index + 1]]
            pooled.append(float(cell.mean()) if cell.size else 0.0)
    return np.asarray(pooled, dtype=np.float32)


def extract_bundle(image_path: Path) -> dict:
    gray = load_gray_image(image_path)
    gx, gy, grad, center = sobel(gray)

    grad_reference = float(np.quantile(grad, 0.98)) if grad.size else 1.0
    grad_norm = np.clip(grad / max(grad_reference, 1e-6), 0.0, 1.0)
    darkness_map = np.clip((0.62 - center) / 0.62, 0.0, 1.0)
    attention = np.clip(0.72 * grad_norm + 0.28 * darkness_map, 0.0, 1.0)

    histogram, _ = np.histogram(center, bins=16, range=(0.0, 1.0), density=True)
    histogram = histogram / max(histogram.sum(), 1e-6)
    entropy = float(-(histogram * np.log2(histogram + 1e-8)).sum() / math.log2(16))

    feature_map = {
        "darkness": float(np.clip((0.58 - float(center.mean())) / 0.58, 0.0, 1.0)),
        "contrast": float(np.clip(center.std() / 0.32, 0.0, 1.0)),
        "edge_density": float((grad_norm > 0.36).mean()),
        "dark_edge_density": float(np.logical_and(grad_norm > 0.34, center < 0.48).mean()),
        "texture_energy": float(grad_norm.mean()),
        "entropy": float(np.clip(entropy, 0.0, 1.0)),
        "orientation_bias": float(
            max(abs(gx).mean(), abs(gy).mean()) / max(1e-6, abs(gx).mean() + abs(gy).mean())
        ),
    }

    attention_grid = grid_pool(attention, ATTENTION_GRID, ATTENTION_GRID)
    feature_map["hotspot_spread"] = float(np.clip(attention_grid.std() / 0.28, 0.0, 1.0))
    center_slice = attention_grid.reshape(ATTENTION_GRID, ATTENTION_GRID)[2:4, 2:4]
    feature_map["central_focus"] = float(np.clip(center_slice.mean() - attention_grid.mean() + 0.5, 0.0, 1.0))

    feature_vector = [feature_map[name] for name in FEATURE_LABELS]
    patch_features = grid_pool(attention, FEATURE_GRID, FEATURE_GRID)
    feature_names = list(FEATURE_LABELS.keys()) + [
        f"patch_{row_index + 1}_{col_index + 1}"
        for row_index in range(FEATURE_GRID)
        for col_index in range(FEATURE_GRID)
    ]
    feature_labels = {
        **FEATURE_LABELS,
        **{
            f"patch_{row_index + 1}_{col_index + 1}": f"Hotspot block {row_index + 1}-{col_index + 1}"
            for row_index in range(FEATURE_GRID)
            for col_index in range(FEATURE_GRID)
        },
    }

    vector = np.asarray(feature_vector + patch_features.tolist(), dtype=np.float32)
    regions = []
    flat_attention = attention_grid.tolist()
    indexed = sorted(enumerate(flat_attention), key=lambda item: item[1], reverse=True)[:3]
    for rank, (index, intensity) in enumerate(indexed, start=1):
        row_index = index // ATTENTION_GRID
        col_index = index % ATTENTION_GRID
        regions.append(
            {
                "id": f"region-{rank}",
                "label": f"Hotspot {rank}",
                "x": round(col_index / ATTENTION_GRID, 4),
                "y": round(row_index / ATTENTION_GRID, 4),
                "width": round(1.0 / ATTENTION_GRID, 4),
                "height": round(1.0 / ATTENTION_GRID, 4),
                "intensity": round(float(intensity), 4),
            }
        )

    return {
        "vector": vector,
        "feature_names": feature_names,
        "feature_labels": feature_labels,
        "attention_grid": [round(float(value), 4) for value in attention_grid.tolist()],
        "focus_regions": regions,
    }


def stratified_split(labels: np.ndarray) -> dict:
    positives = [index for index, label in enumerate(labels.tolist()) if label == 1.0]
    negatives = [index for index, label in enumerate(labels.tolist()) if label == 0.0]
    random.Random(RANDOM_SEED).shuffle(positives)
    random.Random(RANDOM_SEED + 1).shuffle(negatives)

    def split_indices(indices: list[int]) -> tuple[list[int], list[int], list[int]]:
        total = len(indices)
        train_end = max(1, int(total * TRAIN_RATIO))
        validation_end = max(train_end + 1, int(total * (TRAIN_RATIO + VALIDATION_RATIO)))
        validation_end = min(validation_end, total - 1)
        return indices[:train_end], indices[train_end:validation_end], indices[validation_end:]

    pos_train, pos_val, pos_test = split_indices(positives)
    neg_train, neg_val, neg_test = split_indices(negatives)
    train_indices = pos_train + neg_train
    validation_indices = pos_val + neg_val
    test_indices = pos_test + neg_test
    random.Random(RANDOM_SEED).shuffle(train_indices)
    random.Random(RANDOM_SEED + 1).shuffle(validation_indices)
    random.Random(RANDOM_SEED + 2).shuffle(test_indices)
    return {
        "train": np.asarray(train_indices, dtype=int),
        "validation": np.asarray(validation_indices, dtype=int),
        "test": np.asarray(test_indices, dtype=int),
    }


def standardize(matrix: np.ndarray, mean: np.ndarray | None = None, std: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if mean is None:
        mean = matrix.mean(axis=0)
    if std is None:
        std = matrix.std(axis=0)
    std = np.where(std < 1e-6, 1.0, std)
    return (matrix - mean) / std, mean, std


def fit_logistic_regression(
    x_train: np.ndarray, y_train: np.ndarray, x_val: np.ndarray, y_val: np.ndarray
) -> tuple[np.ndarray, float]:
    weights = np.zeros(x_train.shape[1], dtype=np.float32)
    bias = 0.0
    best_weights = weights.copy()
    best_bias = bias
    best_loss = float("inf")
    patience = 90
    remaining_patience = patience

    for step in range(TRAINING_STEPS):
        predictions = sigmoid(x_train @ weights + bias)
        error = predictions - y_train
        grad_w = (x_train.T @ error) / float(len(x_train)) + REGULARIZATION * weights
        grad_b = float(error.mean())
        learning_rate = BASE_LEARNING_RATE * (0.985 ** (step / 40.0))
        weights -= learning_rate * grad_w
        bias -= learning_rate * grad_b

        current_loss = log_loss(y_val, sigmoid(x_val @ weights + bias))
        if current_loss < best_loss - 1e-5:
            best_loss = current_loss
            best_weights = weights.copy()
            best_bias = bias
            remaining_patience = patience
        else:
            remaining_patience -= 1
            if remaining_patience <= 0:
                break

    return best_weights, float(best_bias)


def train_model(manifest_path: Path, model_path: Path) -> dict:
    manifest = load_manifest(manifest_path)
    if not manifest["images"]:
        raise ValueError("Dataset manifest does not contain any indexed images")

    feature_rows = []
    labels = []
    feature_names = []
    feature_labels = {}

    for entry in manifest["images"]:
        bundle = extract_bundle(Path(entry["filePath"]))
        feature_rows.append(bundle["vector"])
        labels.append(1.0 if entry["label"] == "Positive" else 0.0)
        feature_names = bundle["feature_names"]
        feature_labels = bundle["feature_labels"]

    matrix = np.vstack(feature_rows).astype(np.float32)
    label_array = np.asarray(labels, dtype=np.float32)
    split = stratified_split(label_array)

    x_train, mean, std = standardize(matrix[split["train"]])
    x_val = (matrix[split["validation"]] - mean) / std
    x_test = (matrix[split["test"]] - mean) / std
    y_train = label_array[split["train"]]
    y_val = label_array[split["validation"]]
    y_test = label_array[split["test"]]

    weights, bias = fit_logistic_regression(x_train, y_train, x_val, y_val)
    validation_scores = sigmoid(x_val @ weights + bias)
    threshold = choose_threshold(y_val, validation_scores)
    test_scores = sigmoid(x_test @ weights + bias)
    metrics = binary_metrics(y_test, test_scores, threshold)
    metrics["recommendedThreshold"] = round(float(threshold), 4)

    artifact = {
        "classifier": "Local Crack Logistic Regression",
        "version": MODEL_VERSION,
        "trainedAt": now_iso(),
        "manifestSignature": manifest_signature(manifest_path),
        "dataset": {
            "positive": int((label_array == 1.0).sum()),
            "negative": int((label_array == 0.0).sum()),
            "total": int(len(label_array)),
            "manifestGeneratedAt": manifest.get("generatedAt"),
        },
        "featureNames": feature_names,
        "featureLabels": feature_labels,
        "mean": mean.tolist(),
        "std": std.tolist(),
        "weights": weights.tolist(),
        "bias": float(bias),
        "metrics": metrics,
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return artifact


def load_or_train_model(manifest_path: Path, model_path: Path, force_retrain: bool = False) -> dict:
    current_signature = manifest_signature(manifest_path)
    if not force_retrain and model_path.exists():
        artifact = json.loads(model_path.read_text(encoding="utf-8"))
        if artifact.get("manifestSignature") == current_signature and artifact.get("version") == MODEL_VERSION:
            return artifact
    return train_model(manifest_path, model_path)


def confidence_band(probability: float) -> str:
    if probability >= 0.85 or probability <= 0.15:
        return "HIGH"
    if probability >= 0.7 or probability <= 0.3:
        return "MEDIUM"
    return "LOW"


def build_summary(anomaly_detected: bool, confidence: float, dominant: list[str], focus_regions: list[dict]) -> str:
    hotspot_count = len([region for region in focus_regions if region["intensity"] >= 0.45])
    signal = dominant[0] if dominant else "surface texture"
    if anomaly_detected:
        return (
            f"Crack-like structure is dominant around {hotspot_count or 1} hotspot(s), with {signal.lower()} pushing the score to {confidence:.1f}%."
        )
    return f"The surface stays closer to the normal pattern baseline, with {signal.lower()} remaining muted at {confidence:.1f}%."


def infer(payload: dict) -> dict:
    manifest_path = Path(payload["manifestPath"])
    model_path = Path(payload["modelPath"])
    image_path = Path(payload["imagePath"])
    target_label = payload.get("targetLabel", "Positive")
    threshold_percent = float(payload.get("threshold", 55))

    artifact = load_or_train_model(manifest_path, model_path)
    bundle = extract_bundle(image_path)
    vector = bundle["vector"]
    mean = np.asarray(artifact["mean"], dtype=np.float32)
    std = np.asarray(artifact["std"], dtype=np.float32)
    weights = np.asarray(artifact["weights"], dtype=np.float32)
    standardized = (vector - mean) / std
    probability = float(sigmoid(np.asarray([standardized @ weights + artifact["bias"]], dtype=np.float32))[0])
    confidence = round(probability * 100.0, 2)
    anomaly_detected = confidence >= threshold_percent

    contributions = []
    for name, value, contribution in zip(
        artifact["featureNames"], vector.tolist(), (standardized * weights).tolist()
    ):
        contributions.append(
            {
                "key": name,
                "label": artifact["featureLabels"].get(name, name),
                "value": round(float(value), 4),
                "contribution": round(float(contribution), 4),
                "direction": "supports" if contribution >= 0 else "suppresses",
            }
        )

    ranked = sorted(contributions, key=lambda item: abs(item["contribution"]), reverse=True)
    dominant = [item["label"] for item in ranked[:3]]
    summary = build_summary(anomaly_detected, confidence, dominant, bundle["focus_regions"])
    recommendation = (
        "Flag this frame for operator review and move the event into CHECKING."
        if anomaly_detected
        else "Keep monitoring. If needed, capture one more angle to increase certainty."
    )

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
            "dominantSignals": dominant,
            "recommendedAction": recommendation,
            "contributions": ranked[:6],
            "focusRegions": bundle["focus_regions"],
            "attentionGrid": {
                "rows": ATTENTION_GRID,
                "cols": ATTENTION_GRID,
                "values": bundle["attention_grid"],
            },
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
                    "message": "Model trained",
                    "modelPath": str(model_path),
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
