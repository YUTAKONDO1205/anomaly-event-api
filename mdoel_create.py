from pathlib import Path

# --------------------------------------------------
# Paths
# --------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent
TFLITE_PATH = PROJECT_ROOT / "crack_classifier_mobilenetv2.tflite"
MODELS_DIR = PROJECT_ROOT / "models"
HEADER_PATH = MODELS_DIR / "model_data.h"
CPP_PATH = MODELS_DIR / "model_data.cpp"

# --------------------------------------------------
# Check
# --------------------------------------------------
if not TFLITE_PATH.exists():
    raise FileNotFoundError(f"Not found: {TFLITE_PATH}")

MODELS_DIR.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------
# Read model bytes
# --------------------------------------------------
data = TFLITE_PATH.read_bytes()
model_len = len(data)

# --------------------------------------------------
# Generate header
# --------------------------------------------------
header_text = """#pragma once

#include <stdint.h>

// TFLite model byte array
extern const unsigned char g_model_data[];
extern const unsigned int g_model_data_len;
"""

HEADER_PATH.write_text(header_text, encoding="utf-8")

# --------------------------------------------------
# Generate cpp
# --------------------------------------------------
with CPP_PATH.open("w", encoding="utf-8") as f:
    f.write('#include "model_data.h"\n\n')
    f.write("// Auto-generated from crack_classifier_mobilenetv2.tflite\n")
    f.write("const unsigned char g_model_data[] = {\n")

    for i, b in enumerate(data):
        if i % 12 == 0:
            f.write("  ")
        f.write(f"0x{b:02x}")
        if i != model_len - 1:
            f.write(", ")
        if i % 12 == 11:
            f.write("\n")

    if model_len % 12 != 0:
        f.write("\n")

    f.write("};\n\n")
    f.write(f"const unsigned int g_model_data_len = {model_len};\n")

print("Generated:")
print(f"  {HEADER_PATH}")
print(f"  {CPP_PATH}")
print(f"Model size: {model_len} bytes")
