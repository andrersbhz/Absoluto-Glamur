const AG_V17_JOB_PREFIX = "agReviewJob:";
const AG_V17_MIN_ATTEMPT_INTERVAL_MS = 7_000;
const agV17Running = new Set();
const agV17Attempts = new Map();

function agV17JobKey(requestId) {
  return `${AG_V17_JOB_PREFIX}${requestId}`;
}

async function agV17WriteSuccess(requestId, response) {
  const key = agV17JobKey(requestId);
  const current = (await chrome.storage.local.get(key))[key];
  if (!current || current.status === "success" || current.status === "error") return;
  const reviews = Array.isArray(response.reviews) ? response.reviews.filter((review) => review?.body && Number(review.rating) > 0) : [];
  if (!reviews.length) return;
  await chrome.storage.local.set({
    [key]: {
      ...current,
      status: "success",
      stage: `${reviews.length} avaliações encontradas pela sessão do AliExpress`,
      updatedAt: Date.now(),
      result: {
        ok: true,
        reviews,
        imported: reviews.length,
        withPhotos: reviews.filter((review) => Array.isArray(review.images) && review.images.length > 0).length,
        remoteTotal: Math.max(Number(response.remoteTotal) || 0, reviews.length),
      },
    },
  });
}

async function agV17Try(requestId, job) {
  if (agV17Running.has(requestId)) return;
  const now = Date.now();
  const attemptState = agV17Attempts.get(requestId) || { count: 0, lastAt: 0 };
  if (attemptState.count >= 4) return;
  if (attemptState.lastAt && now - attemptState.lastAt < AG_V17_MIN_ATTEMPT_INTERVAL_MS) return;
  agV17Attempts.set(requestId, { count: attemptState.count + 1, lastAt: now });
  agV17Running.add(requestId);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "AG_FETCH_REVIEWS_V17",
      requestId,
      productId: String(job.productId || ""),
    });
    if (response?.ok && Array.isArray(response.reviews) && response.reviews.length > 0) {
      await agV17WriteSuccess(requestId, response);
    }
  } catch {
    // A coleta visual 1.6 continua sendo o caminho principal; falhas do fallback não a interrompem.
  } finally {
    agV17Running.delete(requestId);
  }
}

async function agV17ScanJobs() {
  const all = await chrome.storage.local.get(null);
  for (const [key, job] of Object.entries(all)) {
    if (!key.startsWith(AG_V17_JOB_PREFIX) || !job) continue;
    if (!["opening", "ready", "collecting"].includes(job.status)) continue;
    const requestId = key.slice(AG_V17_JOB_PREFIX.length);
    void agV17Try(requestId, job);
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith(AG_V17_JOB_PREFIX)) continue;
    const job = change.newValue;
    if (!job || !["opening", "ready", "collecting"].includes(job.status)) continue;
    const requestId = key.slice(AG_V17_JOB_PREFIX.length);
    setTimeout(() => void agV17Try(requestId, job), 2200);
  }
});

void agV17ScanJobs();
setTimeout(() => void agV17ScanJobs(), 5000);
setTimeout(() => void agV17ScanJobs(), 14000);
setTimeout(() => void agV17ScanJobs(), 28000);
