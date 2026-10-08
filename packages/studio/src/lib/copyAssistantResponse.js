export async function copyAssistantResponseText(text, clipboard = globalThis.navigator?.clipboard) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Assistant response is empty.");
  }
  if (!clipboard || typeof clipboard.writeText !== "function") {
    throw new Error("Clipboard access is unavailable.");
  }
  await clipboard.writeText(text);
}
