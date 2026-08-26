/**
 * Thin wrappers over the native Electron dialogs.
 *
 * `window.confirm` / `window.alert` block the renderer's event loop and render as a
 * generic browser chrome sheet, which looks out of place in a native app.
 */
export async function confirmDestructive(
  message: string,
  detail?: string,
  confirmLabel?: string
): Promise<boolean> {
  if (window.scribeAPI?.confirmDestructive) {
    try {
      return await window.scribeAPI.confirmDestructive({ message, detail, confirmLabel });
    } catch {
      // Fall through to the browser dialog if IPC is unavailable.
    }
  }
  return window.confirm(detail ? `${message}\n\n${detail}` : message);
}

export async function showMessage(
  message: string,
  detail?: string,
  type: 'info' | 'error' | 'warning' = 'info'
): Promise<void> {
  if (window.scribeAPI?.showMessage) {
    try {
      await window.scribeAPI.showMessage({ message, detail, type });
      return;
    } catch {
      // Fall through.
    }
  }
  window.alert(detail ? `${message}\n\n${detail}` : message);
}
