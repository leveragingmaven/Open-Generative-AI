const emitNotification = (type, message, options = {}) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("studio:notify", { detail: { type, message, ...options } }));
  }

  if (type === "error") console.error(message, options.error || "");
  else if (type === "warning") console.warn(message);
  else if (options.log) console.log(message);

  return { type, message, ...options };
};

export const notify = {
  success: (message, options) => emitNotification("success", message, options),
  error: (message, options) => emitNotification("error", message, options),
  warning: (message, options) => emitNotification("warning", message, options),
  progress: (message, options) => emitNotification("progress", message, options),
};

export const notifySuccess = notify.success;
export const notifyError = notify.error;
export const notifyWarning = notify.warning;
export const notifyProgress = notify.progress;
