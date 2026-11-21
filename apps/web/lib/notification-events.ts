export const notificationsChangedEvent = "oosta:notifications-changed";

export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(notificationsChangedEvent));
}
