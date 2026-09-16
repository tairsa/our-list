import { Alert, Platform } from 'react-native';

/**
 * Cross-platform drop-in replacement for Alert.alert.
 * On web: uses window.alert / window.confirm.
 * On native: delegates to Alert.alert as usual.
 */
export function crossAlert(title, message, buttons) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const msg = message ? `${title}\n\n${message}` : title;

  // No buttons or single OK button — just show an alert
  if (!buttons || buttons.length === 0) {
    window.alert(msg);
    return;
  }

  const cancelButton = buttons.find(b => b.style === 'cancel');
  const actionButtons = buttons.filter(b => b.style !== 'cancel');

  if (actionButtons.length === 0) {
    // Info-only dialog (e.g. "Last Manager" warning)
    window.alert(msg);
    cancelButton?.onPress?.();
    return;
  }

  // Confirmation dialog
  const actionLabel = actionButtons[0].text ?? 'OK';
  const confirmed = window.confirm(`${msg}\n\n[Confirm = ${actionLabel}]`);
  if (confirmed) {
    actionButtons[0].onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}
