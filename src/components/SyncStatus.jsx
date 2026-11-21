const ICON = { syncing: '↻', synced: '☁', offline: '☁', error: '⚠' };

function describe(status) {
  switch (status.state) {
    case 'syncing':
      return 'Syncing with your account…';
    case 'synced':
      return 'Saved to your account';
    case 'offline':
      return "You're offline. Changes are kept on this device and will sync when you're back online.";
    default:
      return `Couldn't sync (${status.code ?? 'unknown'}). Your data is still saved on this device.`;
  }
}

/** A small cloud icon in the header showing whether the profile is synced. Hidden when syncing is off. */
export default function SyncStatus({ status }) {
  if (!status || status.state === 'off') return null;
  const label = describe(status);
  return (
    <span className={`sync sync-${status.state}`} role="status" aria-label={label} title={label}>
      <span aria-hidden="true">{ICON[status.state]}</span>
    </span>
  );
}
