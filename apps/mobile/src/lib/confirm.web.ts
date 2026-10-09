/** react-native-web's Alert does nothing, so the web preview asks with the browser's dialog. */
export function confirmDestructive(options: { title: string; message: string; confirm: string; cancel: string }): Promise<boolean> {
  return Promise.resolve(window.confirm(`${options.title}\n\n${options.message}`));
}
