import { setupAmbientPointer, setupScrollReveal, setupSectionSpy } from "./motion.js";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const defaultHighlights = [
  "Crack detection research workflow from inference to event logging.",
  "Explainable AI with heatmap, focus regions, and contributions.",
  "Compare model output, thresholds, and stored detection events."
];

const state = {
  events: [],
  dashboard: null,
  selectedEventId: null,
  activeStatus: "ALL",
  previewObjectUrl: null,
  lastSyncedAt: null
};

const elements = {
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  syncNote: document.querySelector("#syncNote"),
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
  refreshDatabase: document.querySelector("#refreshDatabase"),
  previewStage: document.querySelector("#previewStage"),
  previewFrame: document.querySelector("#previewFrame"),
  attentionGrid: document.querySelector("#attentionGrid"),
  heatmapRawFrame: document.querySelector("#heatmapRawFrame"),
  heatmapOverlayFrame: document.querySelector("#heatmapOverlayFrame"),
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function getConfiguredApiBaseUrl() {
  const configuredValue = window.__APP_CONFIG__?.apiBaseUrl;
  if (typeof configuredValue !== "string" || !configuredValue.trim()) {
    return "";
  }

  return configuredValue.trim().replace(/\/$/, "");
}

function isLocalEndpoint(value) {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

function getApiBaseUrl() {
  const fallback = window.location.origin;
  const rawValue = elements.apiBaseUrl.value.trim() || fallback;
  const value = rawValue.replace(/\/$/, "");
  elements.apiBaseUrl.value = value;
  localStorage.setItem("apiBaseUrl", value);
  return value;
}

function buildApiUrl(path, bustCache = false) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, `${getApiBaseUrl()}/`);

  if (bustCache) {
    url.searchParams.set("_ts", String(Date.now()));
  }

  return url;
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString("ja-JP");
}

function formatSyncTime(value) {
  if (!value) {
    return "--";
  }

  return new Date(value).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
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

function getDecisionLabel(result) {
  return result?.topLabel?.name ?? result?.labels?.[0]?.name ?? result?.targetLabel ?? "--";
}

function getDecisionConfidence(result) {
  const value = result?.topLabel?.confidence ?? result?.labels?.[0]?.confidence ?? result?.anomalyConfidence;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function setStatus(kind, message) {
  elements.statusBanner.className = `status-banner ${kind}`;
  elements.statusBanner.textContent = message;
}

function setResult(payload) {
  elements.resultOutput.textContent = JSON.stringify(payload, null, 2);
}

function setSyncNote(message) {
  elements.syncNote.textContent = message;
}

function markSynced() {
  state.lastSyncedAt = Date.now();
  setSyncNote(`最終同期 ${formatSyncTime(state.lastSyncedAt)}`);
}

function resetPreview(message = "Choose an image to preview.") {
  clearPreviewObjectUrl();
  elements.previewFrame.textContent = message;
  elements.previewStage.classList.add("empty");
}

async function withBusyButton(button, busyLabel, task) {
  // Already busy: another caller owns this button's label/disabled state, so just
  // run the task without snapshotting the (already mutated) busy label.
  if (button.disabled) {
    return await task();
  }

  // Capture the canonical idle label exactly once so a concurrent/nested call can
  // never snapshot "Refreshing..." and restore it permanently.
  if (button.dataset.idleLabel === undefined) {
    button.dataset.idleLabel = button.textContent;
  }
  const originalLabel = button.dataset.idleLabel;
  button.disabled = true;
  button.textContent = busyLabel;

  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
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

function setHeatmapFrame(target, dataUrl, alt) {
  target.innerHTML = "";

  if (!dataUrl) {
    target.textContent = "No heatmap yet.";
    target.classList.add("empty");
    return;
  }

  const image = document.createElement("img");
  image.src = dataUrl;
  image.alt = alt;

  target.append(image);
  target.classList.remove("empty");
}

function clearHeatmapFrames() {
  setHeatmapFrame(elements.heatmapRawFrame, null, "");
  setHeatmapFrame(elements.heatmapOverlayFrame, null, "");
}

function renderHeatmap(heatmap) {
  if (!heatmap) {
    clearHeatmapFrames();
    return;
  }

  setHeatmapFrame(elements.heatmapRawFrame, heatmap.rawDataUrl, "Detection heatmap");
  setHeatmapFrame(elements.heatmapOverlayFrame, heatmap.overlayDataUrl, "Detection heatmap overlay");
}

function renderAttentionGrid(attentionGrid) {
  if (!attentionGrid?.values?.length) {
    clearAttentionGrid();
    return;
  }

  elements.attentionGrid.classList.remove("hidden");
  elements.attentionGrid.innerHTML = attentionGrid.values
    .map((value) => {
      const numericValue = Number(value);
      const normalizedValue = Number.isFinite(numericValue) ? Math.max(0, Math.min(1, numericValue)) : 0;
      return `<span class="attention-cell" style="--intensity:${normalizedValue}"></span>`;
    })
    .join("");
}

function renderFocusRegions(regions = []) {
  if (!regions.length) {
    elements.focusRegionList.innerHTML = `<p class="empty-copy">No attention map yet.</p>`;
    return;
  }

  elements.focusRegionList.innerHTML = regions
    .map((region) => {
      const label = escapeHtml(region.label);
      return `
        <article class="focus-card">
          <strong>${label}</strong>
          <span>Intensity ${formatPercent(Number(region.intensity) * 100, 1)}</span>
          <p>x ${formatPercent(Number(region.x) * 100, 0)} / y ${formatPercent(Number(region.y) * 100, 0)}</p>
        </article>
      `;
    })
    .join("");
}

function renderLabelChips(labels = []) {
  if (!labels.length) {
    elements.labelChips.innerHTML = `<p class="empty-copy">No detection yet.</p>`;
    return;
  }

  elements.labelChips.innerHTML = labels
    .map((label) => {
      const name = escapeHtml(label.name);
      return `
        <div class="label-chip">
          <strong>${name}</strong>
          <span>${formatPercent(label.confidence, 1)}</span>
        </div>
      `;
    })
    .join("");
}

function renderContributions(contributions = []) {
  if (!contributions.length) {
    elements.contributionList.innerHTML =
      `<p class="empty-copy">Run a detection to inspect feature influence.</p>`;
    return;
  }

  elements.contributionList.innerHTML = contributions
    .map((item) => {
      const label = escapeHtml(item.label);
      const direction = item.direction === "supports" ? "Supports anomaly" : "Suppresses anomaly";

      return `
        <article class="contribution-card">
          <strong>${label}</strong>
          <span>${direction}</span>
          <p>value ${formatRatio(item.value)} / contribution ${formatRatio(item.contribution)}</p>
        </article>
      `;
    })
    .join("");
}

function renderDetectionResult(response) {
  const result = response?.data ?? null;
  setResult(response ?? {});

  if (!result) {
    return;
  }

  elements.summaryText.textContent = result.explanation?.summary ?? "要約はまだありません。";
  elements.recommendedAction.textContent =
    result.explanation?.recommendedAction ?? "推奨アクションはまだありません。";

  renderLabelChips(result.labels ?? []);
  renderContributions(result.explanation?.contributions ?? []);
  renderFocusRegions(result.explanation?.focusRegions ?? []);
  renderAttentionGrid(result.explanation?.attentionGrid ?? null);
  renderHeatmap(result.explanation?.heatmap ?? null);
}

function renderHighlights(highlights = []) {
  const items = highlights.length ? highlights : defaultHighlights;

  elements.highlightsList.innerHTML = items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function renderDashboard(snapshot) {
  state.dashboard = snapshot;

  const model = snapshot.model ?? null;
  const byStatus = snapshot.events?.byStatus ?? { NEW: 0, CHECKING: 0, RESOLVED: 0 };
  const bySeverity = snapshot.events?.bySeverity ?? { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const canResetLocalDatabase = snapshot.runtime?.storageMode === "local";

  elements.runtimeProviderValue.textContent = (snapshot.runtime?.detectionProvider ?? "unknown").toUpperCase();
  elements.runtimeThresholdValue.textContent =
    `Threshold ${snapshot.runtime?.threshold ?? "--"}% / ${snapshot.runtime?.targetLabel ?? "--"}`;
  elements.datasetTotalValue.textContent = String(snapshot.dataset?.totalSamples ?? 0);
  elements.datasetBreakdownValue.textContent =
    `Positive ${snapshot.dataset?.positiveSamples ?? 0} / Negative ${snapshot.dataset?.negativeSamples ?? 0}`;
  elements.modelAccuracyValue.textContent = model?.metrics
    ? formatPercent(model.metrics.accuracy * 100, 1)
    : "--";
  elements.modelRecallValue.textContent = model?.metrics
    ? `Recall ${formatPercent(model.metrics.recall * 100, 1)}`
    : "Recall --";
  elements.eventTotalValue.textContent = String(snapshot.events?.total ?? 0);
  elements.eventStatusMixValue.textContent =
    `NEW ${byStatus.NEW} / CHECKING ${byStatus.CHECKING} / RESOLVED ${byStatus.RESOLVED}`;
  elements.latestDetectionValue.textContent = snapshot.events?.latestDetectionAt
    ? formatDate(snapshot.events.latestDetectionAt)
    : "No signal yet";
  elements.averageConfidenceValue.textContent =
    snapshot.events?.total > 0
      ? `Average ${formatPercent(snapshot.events.averageConfidence * 100, 1)}`
      : "Average --";

  elements.datasetTelemetryTotal.textContent = String(snapshot.dataset?.totalSamples ?? 0);
  elements.datasetTelemetryPositive.textContent = String(snapshot.dataset?.positiveSamples ?? 0);
  elements.datasetTelemetryNegative.textContent = String(snapshot.dataset?.negativeSamples ?? 0);
  elements.datasetGeneratedAt.textContent = snapshot.dataset?.generatedAt
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
    snapshot.events?.total > 0 ? formatPercent(snapshot.events.averageConfidence * 100, 1) : "--";
  elements.sidebarStatusMix.textContent =
    `NEW ${byStatus.NEW} / CHECKING ${byStatus.CHECKING} / RESOLVED ${byStatus.RESOLVED}`;
  elements.sidebarSeverityMix.textContent =
    `LOW ${bySeverity.LOW} / MEDIUM ${bySeverity.MEDIUM} / HIGH ${bySeverity.HIGH}`;

  elements.refreshDatabase.disabled = !canResetLocalDatabase;
  elements.refreshDatabase.title = canResetLocalDatabase
    ? "Delete locally stored events and uploaded images"
    : "Local mode only";

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
    .map((item) => {
      const isSelected = state.selectedEventId === item.eventId ? "is-selected" : "";
      return `
        <tr data-event-id="${escapeHtml(item.eventId)}" class="${isSelected}">
          <td data-label="Detected At">${escapeHtml(formatDate(item.detectedAt))}</td>
          <td data-label="Device">${escapeHtml(item.deviceId)}</td>
          <td data-label="Severity">${escapeHtml(item.severity ?? "--")}</td>
          <td data-label="Status">${escapeHtml(item.status)}</td>
          <td data-label="Confidence">${escapeHtml(formatPercent(Number(item.confidence) * 100, 1))}</td>
        </tr>
      `;
    })
    .join("");
}

function imageUrlFromKey(imageKey) {
  const url = buildApiUrl(`/uploads/${encodeURIComponent(imageKey)}`);

  if (state.lastSyncedAt) {
    url.searchParams.set("v", String(state.lastSyncedAt));
  }

  return url.toString();
}

// Mirror of the server-side lifecycle (src/models/event.ts). Used to disable
// status buttons that would be rejected with 409, so only legal moves are offered.
const ALLOWED_STATUS_TRANSITIONS = {
  NEW: ["CHECKING", "RESOLVED"],
  CHECKING: ["NEW", "RESOLVED"],
  RESOLVED: ["CHECKING"]
};

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
    ? `<div class="event-preview"><img class="event-image" src="${imageUrlFromKey(item.imageKey)}" alt="${escapeHtml(
        item.eventId
      )}" /></div>`
    : `<div class="event-preview"><div class="preview-frame">No stored image.</div></div>`;

  elements.eventDetail.innerHTML = `
    ${imageMarkup}
    <div class="event-info-grid">
      <article class="event-meta"><span>Event ID</span><strong>${escapeHtml(item.eventId)}</strong></article>
      <article class="event-meta"><span>Provider</span><strong>${escapeHtml(item.detectionProvider ?? "--")}</strong></article>
      <article class="event-meta"><span>Detected At</span><strong>${escapeHtml(formatDate(item.detectedAt))}</strong></article>
      <article class="event-meta"><span>Confidence</span><strong>${escapeHtml(
        formatPercent(Number(item.confidence) * 100, 1)
      )}</strong></article>
      <article class="event-meta"><span>Section</span><strong>${escapeHtml(item.sectionId)}</strong></article>
      <article class="event-meta"><span>Severity</span><strong>${escapeHtml(item.severity ?? "--")}</strong></article>
    </div>

    <article class="event-meta">
      <span>Evidence Summary</span>
      <strong>${escapeHtml(item.evidenceSummary ?? item.note ?? "No summary stored.")}</strong>
    </article>

    <div class="tag-row">
      ${
        tags.length
          ? tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")
          : `<span class="tag-chip">No tags</span>`
      }
    </div>

    <div class="status-actions">
      ${["NEW", "CHECKING", "RESOLVED"]
        .map((status) => {
          const isActive = item.status === status;
          const allowed = ALLOWED_STATUS_TRANSITIONS[item.status] ?? [];
          const isDisabled = isActive || !allowed.includes(status);
          return `<button type="button" data-update-status="${status}" class="${
            isActive ? "active" : ""
          }"${isDisabled ? " disabled" : ""}>${status}</button>`;
        })
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
  const response = await fetch(buildApiUrl("/dashboard", true), {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Dashboard fetch failed with ${response.status}`);
  }

  const json = await response.json();
  renderDashboard(json.data);
}

async function fetchEvents() {
  const response = await fetch(buildApiUrl("/events", true), {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

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
  const response = await fetch(buildApiUrl(`/events/${encodeURIComponent(eventId)}`, true), {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

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

  // fetchEvents already re-renders the selected event's detail from the refreshed
  // list, so there is no need for a second loadEventDetail round-trip here.
  await Promise.all([fetchEvents(), fetchDashboard()]);
  markSynced();

  // If the new status moved the event out of the active filter, clear the stale
  // selection rather than leaving a detail panel open for a now-hidden row.
  const stillVisible = getFilteredEvents().some((item) => item.eventId === eventId);
  if (!stillVisible) {
    state.selectedEventId = null;
    renderEvents();
    renderEventDetail(null);
  }
}

async function resetLocalDatabase() {
  const response = await fetch(`${getApiBaseUrl()}/admin/reset-local-database`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Database reset failed with ${response.status}: ${text}`);
  }

  return response.json();
}

async function handleSubmit(event) {
  event.preventDefault();

  const file = elements.imageFile.files?.[0];
  if (!file) {
    setStatus("warning", "画像を選択してから検知を実行してください。");
    return;
  }

  if (!allowedContentTypes.has(file.type)) {
    setStatus("warning", "JPEG / PNG / WEBP のみアップロードできます。");
    return;
  }

  const apiBaseUrl = getApiBaseUrl();
  elements.submitButton.disabled = true;
  setStatus("loading", "画像をアップロードして推論を実行しています...");

  try {
    const upload = await requestUploadUrl(apiBaseUrl, file.type);

    if (!upload || !upload.uploadMode || !upload.key) {
      throw new Error("アップロードURLのレスポンスが不正です。");
    }

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

    const decisionLabel = getDecisionLabel(result.data);
    const decisionConfidence = getDecisionConfidence(result.data);

    if (result.data?.anomalyDetected) {
      setStatus(
        "success",
        `異常候補を検知しました。判定 ${decisionLabel} / 信頼度 ${formatPercent(decisionConfidence, 1)} / ${
          result.data.provider
        }`
      );
    } else {
      setStatus(
        "idle",
        `異常は検知されませんでした。判定 ${decisionLabel} / 信頼度 ${formatPercent(decisionConfidence, 1)}。`
      );
    }

    await refreshDashboardAndEvents();

    if (result.data?.event?.eventId) {
      await loadEventDetail(result.data.event.eventId);
    }
  } catch (error) {
    clearAttentionGrid();
    clearHeatmapFrames();
    renderFocusRegions([]);
    renderContributions([]);
    renderLabelChips([]);
    elements.summaryText.textContent = "推論の実行に失敗しました。";
    elements.recommendedAction.textContent = "Python モデルまたは API の接続状態を確認してください。";
    setStatus("warning", error instanceof Error ? error.message : "Detection failed.");
  } finally {
    elements.submitButton.disabled = false;
  }
}

function bindPreview() {
  elements.imageFile.addEventListener("change", () => {
    const file = elements.imageFile.files?.[0];

    if (!file) {
      resetPreview();
      clearAttentionGrid();
      clearHeatmapFrames();
      return;
    }

    createPreviewFromFile(file);
    clearAttentionGrid();
    clearHeatmapFrames();
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
      setStatus("loading", `ステータスを ${button.dataset.updateStatus} に更新しています...`);
      await updateEventStatus(state.selectedEventId, button.dataset.updateStatus);
      setStatus("idle", "イベントのステータスを更新しました。");
    } catch (error) {
      setStatus("warning", error instanceof Error ? error.message : "Could not update status.");
    }
  });
}

function loadSavedApiBaseUrl() {
  const saved = localStorage.getItem("apiBaseUrl")?.trim();
  const configured = getConfiguredApiBaseUrl();

  if (saved && configured && isLocalEndpoint(saved) && !isLocalEndpoint(configured)) {
    elements.apiBaseUrl.value = configured;
    localStorage.setItem("apiBaseUrl", configured);
    return;
  }

  if (saved) {
    elements.apiBaseUrl.value = saved;
    return;
  }

  if (configured) {
    elements.apiBaseUrl.value = configured;
    localStorage.setItem("apiBaseUrl", configured);
    return;
  }

  elements.apiBaseUrl.value = window.location.origin;
}

async function refreshDashboardAndEvents() {
  await Promise.all([fetchDashboard(), fetchEvents()]);
  markSynced();
}

function bindGlobalActions() {
  elements.detectForm.addEventListener("submit", handleSubmit);

  elements.refreshEvents.addEventListener("click", async () => {
    try {
      setSyncNote("イベント一覧を更新しています...");
      await withBusyButton(elements.refreshEvents, "Reloading...", async () => {
        await fetchEvents();
      });
      markSynced();
      setStatus("idle", "イベント一覧を更新しました。");
    } catch (error) {
      setSyncNote("イベント更新に失敗しました");
      setStatus("warning", error instanceof Error ? error.message : "Could not refresh events.");
    }
  });

  elements.refreshDatabase.addEventListener("click", async () => {
    if (elements.refreshDatabase.disabled) {
      return;
    }

    const confirmed = window.confirm(
      "local-storage 内の events と uploads を削除します。続けますか？"
    );
    if (!confirmed) {
      return;
    }

    try {
      setSyncNote("ローカルデータを初期化しています...");
      await withBusyButton(elements.refreshDatabase, "Clearing...", async () => {
        const result = await resetLocalDatabase();
        state.events = [];
        state.selectedEventId = null;
        renderEvents();
        renderEventDetail(null);
        await refreshDashboardAndEvents();
        setStatus(
          "idle",
          `ローカルデータを初期化しました。Events ${result.data?.eventsCleared ?? 0}, uploads ${
            result.data?.uploadsCleared ?? 0
          }`
        );
      });
    } catch (error) {
      setSyncNote("初期化に失敗しました");
      setStatus("warning", error instanceof Error ? error.message : "Could not clear local storage.");
    }
  });

  elements.refreshAll.addEventListener("click", async () => {
    try {
      setSyncNote("ダッシュボードとイベントを更新しています...");
      await withBusyButton(elements.refreshAll, "Refreshing...", async () => {
        await refreshDashboardAndEvents();
      });
      setStatus("idle", "ダッシュボードを更新しました。");
    } catch (error) {
      setSyncNote("更新に失敗しました");
      setStatus("warning", error instanceof Error ? error.message : "Could not refresh dashboard.");
    }
  });

  elements.apiBaseUrl.addEventListener("change", async () => {
    try {
      setSyncNote("API エンドポイントを反映しています...");
      await withBusyButton(elements.refreshAll, "Refreshing...", async () => {
        await refreshDashboardAndEvents();
      });
      setStatus("idle", "API エンドポイントを更新しました。");
    } catch (error) {
      setSyncNote("エンドポイント更新に失敗しました");
      setStatus("warning", error instanceof Error ? error.message : "Could not refresh dashboard.");
    }
  });

  elements.apiBaseUrl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    elements.apiBaseUrl.blur();
  });

  elements.scrollToStudio.addEventListener("click", () => {
    document.querySelector("#detectionStudio")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function init() {
  loadSavedApiBaseUrl();
  setupAmbientPointer();
  setupScrollReveal();
  setupSectionSpy();
  bindPreview();
  bindFilters();
  bindEventTable();
  bindEventDetailActions();
  bindGlobalActions();
  resetPreview();
  clearHeatmapFrames();
  setSyncNote("データを同期しています...");

  try {
    await refreshDashboardAndEvents();
    setStatus("idle", "ダッシュボードの準備ができました。");
  } catch (error) {
    setSyncNote("初期同期に失敗しました");
    setStatus("warning", error instanceof Error ? error.message : "Could not load dashboard.");
    renderHighlights();
  }
}

init();
