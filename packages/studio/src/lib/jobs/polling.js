export async function pollUntilComplete({
  poll,
  isComplete,
  isFailed,
  interval = 2000,
  maxAttempts = 900,
  onStatus,
  signal,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Polling cancelled", "AbortError");
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
    const result = await poll({ attempt });
    onStatus?.(result, { attempt, maxAttempts });

    if (isComplete(result)) return result;
    if (isFailed?.(result)) {
      throw new Error(result?.error || "Job failed");
    }
  }

  throw new Error("Job timed out after polling.");
}
