// Rejects if `promise` does not settle within `timeoutMs`, so one stalled request cannot block a whole screen.
export function withTimeout(promise, timeoutMs, message = "request_timed_out") {
  let timer = null;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
