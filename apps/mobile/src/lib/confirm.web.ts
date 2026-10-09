/** react-native-web's Alert does nothing, so the web preview asks with the browser's dialog. */
export function confirmDestructive(options: { title: string; message: string; confirm: string; cancel: string }): Promise<boolean> {
  return Promise.resolve(window.confirm(`${options.title}\n\n${options.message}`));
}

export function showNotice(title: string, message?: string) {
  window.alert(message ? `${title}\n\n${message}` : title);
}

export function promptText(options: { title: string; message: string; defaultValue: string; confirm: string; cancel: string }): Promise<string | null> {
  return Promise.resolve(window.prompt(`${options.title}\n\n${options.message}`, options.defaultValue));
}
