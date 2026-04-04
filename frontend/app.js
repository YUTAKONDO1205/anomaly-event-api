const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const state = {
  events: [],
  dashboard: null,
  selectedEventId: null,
  activeStatus: "ALL",
  previewObjectUrl: null
};

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  detectForm: document.querySelector("#detectForm"),
  deviceId: document.querySelector("#deviceId"),
  sectionId: document.querySelector("#sectionId"),
  distance: document.querySelector("#distance"),
  note: document.querySelector("#note"),
  imageFile: document.querySelector("#imageFile"),
  submitButton: document.querySelector("#submitButton"),
  scrollToStudio: document.querySelector("#scrollToStudio"),
  refreshAll: document.querySelector("#refreshAll"),
  refreshEvents: document.querySelector("#refreshEvents"),
  previewStage: document.querySelector("#previewStage"),
  previewFrame: document.querySelector("#previewFrame"),
  attentionGrid: document.querySelector("#attentionGrid"),
  focusRegionList: document.querySelector("#focusRegionList"),
  statusBanner: document.querySelector("#statusBanner"),
  summaryText: document.querySelector("#summaryText"),
  labelChips: document.querySelector("#labelChips"),
  contributionList: document.querySelector("#contributionList"),
  recommendedAction: document.querySelector("#recommendedAction"),
  resultOutput: document.querySelector("#resultOutput"),
  highlightsList: document.querySelector("#highlightsList"),
  runtimeProviderValue: document.querySelector("#runtimeProviderValue"),
  runtimeThresholdValue: document.querySelector("#runtimeThresholdValue"),
  datasetTotalValue: document.querySelector("#datasetTotalValue"),
  datasetBreakdownValue: document.querySelector("#datasetBreakdownValue"),
  modelAccuracyValue: document.querySelector("#modelAccuracyValue"),
  modelRecallValue: document.querySelector("#modelRecallValue"),
  eventTotalValue: document.querySelector("#eventTotalValue"),
  eventStatusMixValue: document.querySelector("#eventStatusMixValue"),
  latestDetectionValue: document.querySelector("#latestDetectionValue"),
  averageConfidenceValue: document.querySelector("#averageConfidenceValue"),
  datasetTelemetryTotal: document.querySelector("#datasetTelemetryTotal"),
  datasetTelemetryPositive: document.querySelector("#datasetTelemetryPositive"),
  datasetTelemetryNegative: document.querySelector("#datasetTelemetryNegative"),
  datasetGeneratedAt: document.querySelector("#datasetGeneratedAt"),
  modelClassifier: document.querySelector("#modelClassifier"),
  modelMetricAccuracy: document.querySelector("#modelMetricAccuracy"),
  modelMetricRecall: document.querySelector("#modelMetricRecall"),
  modelMetricThreshold: document.querySelector("#modelMetricThreshold"),
  opsNewCount: document.querySelector("#opsNewCount"),
  opsCheckingCount: document.querySelector("#opsCheckingCount"),
  opsResolvedCount: document.querySelector("#opsResolvedCount"),
  opsAverageConfidence: document.querySelector("#opsAverageConfidence"),
  sidebarStatusMix: document.querySelector("#sidebarStatusMix"),
  sidebarSeverityMix: document.querySelector("#sidebarSeverityMix"),
  statusFilters: document.querySelector("#statusFilters"),
  eventsTable: document.querySelector("#eventsTable"),
  eventDetail: document.querySelector("#eventDetail")
};

function getApiBaseUrl() {
  const value = elements.apiBaseUrl.value.trim().replace(/\/$/, "");
  localStorage.setItem("apiBaseUrl", value);
  return value;
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString("ja-JP");
}

function formatPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  return `${Number(value).toFixed(digits)}%`;
}

function formatRatio(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  return Number(value).toFixed(3);
}

function setStatus(kind, message) {
  elements.statusBanner.className = `status-banner ${kind}`;
  elements.statusBanner.textContent = message;
}

function setResult(payload) {
  elements.resultOutput.textContent = JSON.stringify(payload, null, 2);
}

function clearPreviewObjectUrl() {
  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = null;
  }
}

function renderPreview(src, alt) {
  elements.previewFrame.innerHTML = "";
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  elements.previewFrame.append(image);
  elements.previewStage.classList.remove("empty");
}

function createPreviewFromFile(file) {
  clearPreviewObjectUrl();
  state.previewObjectUrl = URL.createObjectURL(file);
  renderPreview(state.previewObjectUrl, file.name);
}

function clearAttentionGrid() {
  elements.attentionGrid.innerHTML = "";
  elements.attentionGrid.classList.add("hidden");
}

function renderAttentionGrid(attentionGrid) {
  if (!attentionGrid?.values?.length) {
    clearAttentionGrid();
    return;
  }

  elements.attentionGrid.classList.remove("hidden");
  elements.attentionGrid.innerHTML = attentionGrid.values
    .map(
      (value) =>
        `<span class="attention-cell" style="--intensity:${Math.max(
          0,
          Math.min(1, Number(value))
        )}"></span>`
    )
    .join("");
}

function renderFocusRegions(regions = []) {
  if (!regions.length) {
    elements.focusRegionList.innerHTML = `<p class="empty-copy">No attention map yet.</p>`;
    return;
  }

  elements.focusRegionList.innerHTML = regions
    .map(
      (region) => `
        <article class="focus-card">
          <strong>${region.label}</strong>
          <span>Intensity ${formatPercent(Number(region.intensity) * 100, 1)}</span>
          <p>x ${formatPercent(Number(region.x) * 100, 0)} / y ${formatPercent(
            Number(region.y) * 100,
            0
          )}</p>
        </article>
      `
    )
    .join("");
}

function renderLabelChips(labels = []) {
  if (!labels.length) {
    elements.labelChips.innerHTML = `<p class="empty-copy">No detection yet.</p>`;
    return;
  }

  elements.labelChips.innerHTML = labels
    .map(
      (label) => `
        <div class="label-chip">
          <strong>${label.name}</strong>
          <span>${formatPercent(label.confidence, 1)}</span>
        </div>
      `
    )
    .join("");
}

function renderContributions(contributions = []) {
  if (!contributions.length) {
    elements.contributionList.innerHTML =
      `<p class="empty-copy">Run a detection to inspect feature influence.</p>`;
    return;
  }

  elements.contributionList.innerHTML = contributions
    .map(
      (item) => `
        <article class="contribution-card">
          <strong>${item.label}</strong>
          <span>${item.direction === "supports" ? "Supports anomaly" : "Suppresses anomaly"}</span>
          <p>value ${formatRatio(item.value)} / contribution ${formatRatio(item.contribution)}</p>
        </article>
      `
    )
    .join("");
}

function renderDetectionResult(response) {
  const result = response?.data ?? null;
  setResult(response ?? {});

  if (!result) {
    return;
  }

  elements.summaryText.textContent = result.explanation?.summary ?? "No summary available.";
  elements.recommendedAction.textContent =
    result.explanation?.recommendedAction ?? "No action recommendation available.";
  renderLabelChips(result.labels ?? []);
  renderContributions(result.explanation?.contributions ?? []);
  renderFocusRegions(result.explanation?.focusRegions ?? []);
  renderAttentionGrid(result.explanation?.attentionGrid ?? null);
}

function renderHighlights(highlights = []) {
  elements.highlightsList.innerHTML = highlights
    .map((item) => `<li>${item}</li>`)
    .join("");
}

function renderDashboard(snapshot) {
  state.dashboard = snapshot;
  const model = snapshot.model;
  const byStatus = snapshot.events.byStatus;
  const bySeverity = snapshot.events.bySeverity;

  elements.runtimeProviderValue.textContent = snapshot.runtime.detectionProvider.toUpperCase();
  elements.runtimeThresholdValue.textContent = `Threshold ${snapshot.runtime.threshold}% / ${snapshot.runtime.targetLabel}`;
  elements.datasetTotalValue.textContent = String(snapshot.dataset.totalSamples);
  elements.datasetBreakdownValue.textContent = `Positive ${snapshot.dataset.positiveSamples} / Negative ${snapshot.dataset.negativeSamples}`;
  elements.modelAccuracyValue.textContent = model?.metrics ? formatPercent(model.metrics.accuracy * 100, 1) : "--";
  elements.modelRecallValue.textContent = model?.metrics ? `Recall ${formatPercent(model.metrics.recall * 100, 1)}` : "Recall --";
  elements.eventTotalValue.textContent = String(snapshot.events.total);
  elements.eventStatusMixValue.textContent = `NEW ${byStatus.NEW} / CHECKING ${byStatus.CHECKING} / RESOLVED ${byStatus.RESOLVED}`;
  elements.latestDetectionValue.textContent = snapshot.events.latestDetectionAt
    ? formatDate(snapshot.events.latestDetectionAt)
    : "No signal yet";
  elements.averageConfidenceValue.textContent =
    snapshot.events.total > 0
      ? `Average ${formatPercent(snapshot.events.averageConfidence * 100, 1)}`
      : "Average --";

  elements.datasetTelemetryTotal.textContent = String(snapshot.dataset.totalSamples);
  elements.datasetTelemetryPositive.textContent = String(snapshot.dataset.positiveSamples);
  elements.datasetTelemetryNegative.textContent = String(snapshot.dataset.negativeSamples);
  elements.datasetGeneratedAt.textContent = snapshot.dataset.generatedAt
    ? formatDate(snapshot.dataset.generatedAt)
    : "--";

  elements.modelClassifier.textContent = model?.classifier ?? "Waiting for first Python train";
  elements.modelMetricAccuracy.textContent = model?.metrics
    ? formatPercent(model.metrics.accuracy * 100, 1)
    : "--";
  elements.modelMetricRecall.textContent = model?.metrics
    ? formatPercent(model.metrics.recall * 100, 1)
    : "--";
  elements.modelMetricThreshold.textContent = model?.metrics?.recommendedThreshold
    ? formatPercent(model.metrics.recommendedThreshold * 100, 1)
    : "--";

  elements.opsNewCount.textContent = String(byStatus.NEW);
  elements.opsCheckingCount.textContent = String(byStatus.CHECKING);
  elements.opsResolvedCount.textContent = String(byStatus.RESOLVED);
  elements.opsAverageConfidence.textContent =
    snapshot.events.total > 0 ? formatPercent(snapshot.events.averageConfidence * 100, 1) : "--";
  elements.sidebarStatusMix.textContent = `NEW ${byStatus.NEW} / CHECKING ${byStatus.CHECKING} / RESOLVED ${byStatus.RESOLVED}`;
  elements.sidebarSeverityMix.textContent = `LOW ${bySeverity.LOW} / MEDIUM ${bySeverity.MEDIUM} / HIGH ${bySeverity.HIGH}`;

  renderHighlights(snapshot.highlights ?? []);
}

function getFilteredEvents() {
  if (state.activeStatus === "ALL") {
    return state.events;
  }

  return state.events.filter((item) => item.status === state.activeStatus);
}

function renderEvents() {
  const items = getFilteredEvents();

  if (!items.length) {
    elements.eventsTable.innerHTML = `
      <tr>
        <td colspan="5">No events found for this filter.</td>
      </tr>
    `;
    return;
  }

  elements.eventsTable.innerHTML = items
    .map(
      (item) => `
        <tr data-event-id="${item.eventId}" class="${
          state.selectedEventId === item.eventId ? "is-selected" : ""
        }">
          <td>${formatDate(item.detectedAt)}</td>
          <td>${item.deviceId}</td>
          <td>${item.severity ?? "--"}</td>
          <td>${item.status}</td>
          <td>${formatPercent(Number(item.confidence) * 100, 1)}</td>
        </tr>
      `
    )
    .join("");
}

function imageUrlFromKey(imageKey) {
  const apiBaseUrl = getApiBaseUrl();
  return `${apiBaseUrl}/uploads/${encodeURIComponent(imageKey)}`;
}

function renderEventDetail(item) {
  if (!item) {
    elements.eventDetail.className = "event-detail empty";
    elements.eventDetail.innerHTML =
      "<p>Select an event row to inspect the stored image and status controls.</p>";
    return;
  }

  elements.eventDetail.className = "event-detail";
  const tags = Array.isArray(item.insightTags) ? item.insightTags : [];
  const imageMarkup = item.imageKey
    ? `<div class="event-preview"><img class="event-image" src="${imageUrlFromKey(
        item.imageKey
      )}" alt="${item.eventId}" /></div>`
    : `<div class="event-preview"><div class="preview-frame">No stored image.</div></div>`;

  elements.eventDetail.innerHTML = `
    ${imageMarkup}
    <div class="event-info-grid">
      <article class="event-meta"><span>Event ID</span><strong>${item.eventId}</strong></article>
      <article class="event-meta"><span>Provider</span><strong>${item.detectionProvider ?? "--"}</strong></article>
      <article class="event-meta"><span>Detected At</span><strong>${formatDate(item.detectedAt)}</strong></article>
      <article class="event-meta"><span>Confidence</span><strong>${formatPercent(
        Number(item.confidence) * 100,
        1
      )}</strong></article>
      <article class="event-meta"><span>Section</span><strong>${item.sectionId}</strong></article>
      <article class="event-meta"><span>Severity</span><strong>${item.severity ?? "--"}</strong></article>
    </div>

    <article class="event-meta">
      <span>Evidence Summary</span>
      <strong>${item.evidenceSummary ?? item.note ?? "No summary stored."}</strong>
    </article>

    <div class="tag-row">
      ${tags.length ? tags.map((tag) => `<span class="tag-chip">${tag}</span>`).join("") : `<span class="tag-chip">No tags</span>`}
    </div>

    <div class="status-actions">
      ${["NEW", "CHECKING", "RESOLVED"]
        .map(
          (status) => `
            <button type="button" data-update-status="${status}" class="${
              item.status === status ? "active" : ""
            }">${status}</button>
          `
        )
        .join("")}
    </div>
  `;
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": file.type },
    body: file
  });

  if (!response.ok) {
    throw new Error(`File upload failed with ${response.status}`);
  }
}

async function runDetection(apiBaseUrl, payload) {
  const response = await fetch(`${apiBaseUrl}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Detection failed with ${response.status}: ${text}`);
  }

  return response.json();
}

async function fetchDashboard() {
  const response = await fetch(`${getApiBaseUrl()}/dashboard`);
  if (!response.ok) {
    throw new Error(`Dashboard fetch failed with ${response.status}`);
  }

  const json = await response.json();
  renderDashboard(json.data);
}

async function fetchEvents() {
  const response = await fetch(`${getApiBaseUrl()}/events`);
  if (!response.ok) {
    throw new Error(`Events fetch failed with ${response.status}`);
  }

  const json = await response.json();
  state.events = Array.isArray(json.data) ? json.data : [];
  renderEvents();

  if (state.selectedEventId) {
    const selected = state.events.find((item) => item.eventId === state.selectedEventId);
    renderEventDetail(selected ?? null);
  }
}

async function loadEventDetail(eventId) {
  const response = await fetch(`${getApiBaseUrl()}/events/${encodeURIComponent(eventId)}`);
  if (!response.ok) {
    throw new Error(`Event detail fetch failed with ${response.status}`);
  }

  const json = await response.json();
  state.selectedEventId = eventId;
  renderEvents();
  renderEventDetail(json.data);
}

async function updateEventStatus(eventId, status) {
  const response = await fetch(`${getApiBaseUrl()}/events/${encodeURIComponent(eventId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Status update failed with ${response.status}: ${text}`);
  }

  await Promise.all([fetchEvents(), fetchDashboard()]);
  await loadEventDetail(eventId);
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
  setStatus("loading", "Uploading image and running Python ML detection...");

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
      imageDataBase64: upload.uploadMode === "inline" ? await readFileAsBase64(file) : undefined,
      note: elements.note.value.trim() || undefined
    };

    const result = await runDetection(apiBaseUrl, detectPayload);
    renderDetectionResult(result);

    if (result.data?.anomalyDetected) {
      setStatus(
        "success",
        `Anomaly detected at ${formatPercent(result.data.anomalyConfidence, 1)} via ${
          result.data.provider
        }.`
      );
    } else {
      setStatus(
        "idle",
        `No anomaly detected. Confidence ${formatPercent(result.data?.anomalyConfidence, 1)}.`
      );
    }

    await Promise.all([fetchDashboard(), fetchEvents()]);

    if (result.data?.event?.eventId) {
      await loadEventDetail(result.data.event.eventId);
    }
  } catch (error) {
    clearAttentionGrid();
    renderFocusRegions([]);
    renderContributions([]);
    renderLabelChips([]);
    elements.summaryText.textContent = "推論に失敗しました。";
    elements.recommendedAction.textContent = "Python 依存関係や API の状態を確認してください。";
    setStatus("warning", error instanceof Error ? error.message : "Detection failed.");
  } finally {
    elements.submitButton.disabled = false;
  }
}

function bindPreview() {
  elements.imageFile.addEventListener("change", () => {
    const file = elements.imageFile.files?.[0];
    if (!file) {
      clearPreviewObjectUrl();
      elements.previewFrame.textContent = "Choose an image to preview.";
      clearAttentionGrid();
      return;
    }

    createPreviewFromFile(file);
    clearAttentionGrid();
  });
}

function bindFilters() {
  elements.statusFilters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-status]");
    if (!button) {
      return;
    }

    state.activeStatus = button.dataset.status;
    for (const candidate of elements.statusFilters.querySelectorAll("button")) {
      candidate.classList.toggle("active", candidate === button);
    }

    renderEvents();
  });
}

function bindEventTable() {
  elements.eventsTable.addEventListener("click", async (event) => {
    const row = event.target.closest("tr[data-event-id]");
    if (!row) {
      return;
    }

    try {
      await loadEventDetail(row.dataset.eventId);
    } catch (error) {
      setStatus("warning", error instanceof Error ? error.message : "Could not load event detail.");
    }
  });
}

function bindEventDetailActions() {
  elements.eventDetail.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-update-status]");
    if (!button || !state.selectedEventId) {
      return;
    }

    try {
      setStatus("loading", `Updating status to ${button.dataset.updateStatus}...`);
      await updateEventStatus(state.selectedEventId, button.dataset.updateStatus);
      setStatus("idle", "Event status updated.");
    } catch (error) {
      setStatus("warning", error instanceof Error ? error.message : "Could not update status.");
    }
  });
}

function loadSavedApiBaseUrl() {
  const saved = localStorage.getItem("apiBaseUrl");
  if (saved) {
    elements.apiBaseUrl.value = saved;
  }
}

async function refreshAll() {
  await Promise.all([fetchDashboard(), fetchEvents()]);
}

function bindGlobalActions() {
  elements.detectForm.addEventListener("submit", handleSubmit);
  elements.refreshEvents.addEventListener("click", async () => {
    try {
      await fetchEvents();
      setStatus("idle", "Events refreshed.");
    } catch (error) {
      setStatus("warning", error instanceof Error ? error.message : "Could not refresh events.");
    }
  });

  elements.refreshAll.addEventListener("click", async () => {
    try {
      await refreshAll();
      setStatus("idle", "Dashboard and events refreshed.");
    } catch (error) {
      setStatus("warning", error instanceof Error ? error.message : "Could not refresh dashboard.");
    }
  });

  elements.scrollToStudio.addEventListener("click", () => {
    document.querySelector("#detectionStudio")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function init() {
  loadSavedApiBaseUrl();
  bindPreview();
  bindFilters();
  bindEventTable();
  bindEventDetailActions();
  bindGlobalActions();

  try {
    await refreshAll();
    setStatus("idle", "Dashboard ready.");
  } catch (error) {
    setStatus("warning", error instanceof Error ? error.message : "Could not load dashboard.");
  }
}

init();
