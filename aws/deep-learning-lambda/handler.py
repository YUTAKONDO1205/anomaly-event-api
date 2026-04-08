from __future__ import annotations

import base64
import json
import os
import tempfile
from pathlib import Path

import torch

from crack_ml import (
    ATTENTION_GRID,
    build_contributions,
    build_focus_regions,
    build_heatmap_output,
    build_summary,
    confidence_band,
    compute_gradcam,
    get_device,
    load_image_tensor,
    load_model_for_inference,
    pool_grid,
)

APP_ROOT = Path(__file__).resolve().parent
MODEL_ARTIFACT_PATH = Path(
    os.environ.get("MODEL_ARTIFACT_PATH", str(APP_ROOT / "model" / "crack-local-model.json"))
)
MODEL_WEIGHTS_PATH = Path(
    os.environ.get("MODEL_WEIGHTS_PATH", str(APP_ROOT / "model" / "crack-local-model.pt"))
)

_cached_artifact: dict | None = None
_cached_device = None
_cached_model = None


def load_artifact() -> dict:
    global _cached_artifact
    if _cached_artifact is None:
        artifact = json.loads(MODEL_ARTIFACT_PATH.read_text(encoding="utf-8"))
        artifact["weightsFile"] = str(MODEL_WEIGHTS_PATH)
        _cached_artifact = artifact
    return _cached_artifact


def load_runtime():
    global _cached_device
    global _cached_model
    artifact = load_artifact()
    if _cached_model is None:
        _cached_device = get_device()
        _cached_model = load_model_for_inference(artifact, _cached_device)
    return artifact, _cached_device, _cached_model


def infer_image(image_bytes: bytes, target_label: str, threshold_percent: float) -> dict:
    artifact, device, model = load_runtime()

    suffix = ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(image_bytes)
        image_path = Path(temp_file.name)

    try:
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
            "provider": "aws-deep-learning",
            "model": {
                "provider": "aws-deep-learning",
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
    finally:
        image_path.unlink(missing_ok=True)


def handler(event, _context):
    image_base64 = event.get("imageBase64")
    if not image_base64:
        raise ValueError("imageBase64 is required")

    image_bytes = base64.b64decode(image_base64)
    target_label = str(event.get("targetLabel") or "Positive")
    threshold_percent = float(event.get("threshold") or 55)

    return infer_image(image_bytes, target_label, threshold_percent)
