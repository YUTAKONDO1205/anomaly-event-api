const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  detectForm: document.querySelector("#detectForm"),
  deviceId: document.querySelector("#deviceId"),
  sectionId: document.querySelector("#sectionId"),
  distance: document.querySelector("#distance"),
  note: document.querySelector("#note"),
  imageFile: document.querySelector("#imageFile"),
  previewFrame: document.querySelector("#previewFrame"),
  statusBanner: document.querySelector("#statusBanner"),
  resultOutput: document.querySelector("#resultOutput"),
  refreshEvents: document.querySelector("#refreshEvents"),
  eventsTable: document.querySelector("#eventsTable"),
  submitButton: document.querySelector("#submitButton")
};

function getApiBaseUrl() {
  const value = elements.apiBaseUrl.value.trim().replace(/\/$/, "");
  localStorage.setItem("apiBaseUrl", value);
  return value;
}

function setStatus(kind, message) {
  elements.statusBanner.className = `status-banner ${kind}`;
  elements.statusBanner.textContent = message;
}

function setResult(payload) {
  elements.resultOutput.textContent = JSON.stringify(payload, null, 2);
}

function createPreview(file) {
  const objectUrl = URL.createObjectURL(file);
  const img = document.createElement("img");
  img.src = objectUrl;
  img.alt = file.name;
  img.onload = () => URL.revokeObjectURL(objectUrl);

  elements.previewFrame.innerHTML = "";
  elements.previewFrame.append(img);
  elements.previewFrame.classList.remove("empty");
}

async function readFileAsBase64(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function requestUploadUrl(apiBaseUrl, contentType) {
  const response = await fetch(`${apiBaseUrl}/upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ contentType })
  });

  if (!response.ok) {
    throw new Error(`Upload URL request failed with ${response.status}`);
  }

  const json = await response.json();
  return json.data;
}

async function uploadToSignedUrl(uploadUrl, file) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(`File upload failed with ${response.status}`);
  }
}

async function runDetection(apiBaseUrl, payload) {
  const response = await fetch(`${apiBaseUrl}/detect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Detection failed with ${response.status}: ${text}`);
  }

  return response.json();
}

function renderEvents(items) {
  if (!Array.isArray(items) || items.length === 0) {
    elements.eventsTable.innerHTML = `
      <tr>
        <td colspan="5">No events found.</td>
      </tr>
    `;
    return;
  }

  elements.eventsTable.innerHTML = items
    .slice(0, 20)
    .map(
      (item) => `
        <tr>
          <td>${new Date(item.detectedAt).toLocaleString()}</td>
          <td>${item.deviceId}</td>
          <td>${item.sectionId}</td>
          <td>${item.status}</td>
          <td>${Math.round(item.confidence * 100)}%</td>
        </tr>
      `
    )
    .join("");
}

async function loadEvents() {
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/events`);

  if (!response.ok) {
    throw new Error(`Events fetch failed with ${response.status}`);
  }

  const json = await response.json();
  renderEvents(json.data ?? []);
}

async function handleSubmit(event) {
  event.preventDefault();
  const file = elements.imageFile.files?.[0];

  if (!file) {
    setStatus("warning", "Choose an image before running detection.");
    return;
  }

  if (!allowedContentTypes.has(file.type)) {
    setStatus("warning", "Only JPEG, PNG, and WEBP images are supported.");
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  elements.submitButton.disabled = true;
  setStatus("loading", "Uploading image and running detection...");

  try {
    const upload = await requestUploadUrl(apiBaseUrl, file.type);
    if (upload.uploadMode === "presigned" && upload.uploadUrl) {
      await uploadToSignedUrl(upload.uploadUrl, file);
    }

    const detectPayload = {
      deviceId: elements.deviceId.value.trim(),
      sectionId: elements.sectionId.value.trim(),
      distance: Number(elements.distance.value),
      detectedAt: new Date().toISOString(),
      imageKey: upload.key,
      imageContentType: file.type,
      imageDataBase64:
        upload.uploadMode === "inline" ? await readFileAsBase64(file) : undefined,
      note: elements.note.value.trim() || undefined
    };

    const result = await runDetection(apiBaseUrl, detectPayload);
    setResult(result);

    if (result.data?.anomalyDetected) {
      setStatus("success", "Anomaly detected and stored as an event.");
    } else {
      setStatus("idle", "No anomaly detected for this image.");
    }

    await loadEvents();
  } catch (error) {
    setStatus("warning", error instanceof Error ? error.message : "Detection failed.");
  } finally {
    elements.submitButton.disabled = false;
  }
}

function loadSavedApiBaseUrl() {
  const saved = localStorage.getItem("apiBaseUrl");
  if (saved) {
    elements.apiBaseUrl.value = saved;
  }
}

function bindPreview() {
  elements.imageFile.addEventListener("change", () => {
    const file = elements.imageFile.files?.[0];
    if (!file) {
      elements.previewFrame.textContent = "Choose an image to preview.";
      return;
    }

    createPreview(file);
  });
}

async function init() {
  loadSavedApiBaseUrl();
  bindPreview();
  elements.detectForm.addEventListener("submit", handleSubmit);
  elements.refreshEvents.addEventListener("click", async () => {
    try {
      await loadEvents();
      setStatus("idle", "Events refreshed.");
    } catch (error) {
      setStatus("warning", error instanceof Error ? error.message : "Could not load events.");
    }
  });

  try {
    await loadEvents();
  } catch (error) {
    setStatus("warning", error instanceof Error ? error.message : "Could not load events.");
  }
}

init();
