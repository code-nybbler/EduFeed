import { useEffect, useRef, useState } from 'react';

/**
 * "Sign in" button while the person is anonymous; once signed in, their avatar with a small
 * panel (name, email, sign out). Render only when sign-in is available and the account is known.
 */
export default function AccountMenu({ account, busy, onSignIn, onSignOut }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => !root.current?.contains(e.target) && setOpen(false);
    const escape = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (!account || account.isAnonymous) {
    return (
      <button
        type="button"
        className="signin"
        onClick={onSignIn}
        disabled={busy}
        title="Sign in with Google to keep your saves and streak on every device"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    );
  }

  const label = account.name || account.email || 'Account';
  const initial = label.trim().charAt(0).toUpperCase();

  return (
    <div className="account" ref={root}>
      <button
        type="button"
        className="avatar"
        aria-label={`Account: ${account.email || label}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        {account.photo ? (
          <img src={account.photo} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </button>
      {open && (
        <div className="account-panel" role="dialog" aria-label="Account">
          {account.name && <strong>{account.name}</strong>}
          {account.email && <span className="account-email">{account.email}</span>}
          <button
            type="button"
            className="action"
            disabled={busy}
            onClick={async () => {
              await onSignOut();
              setOpen(false);
            }}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
          <p className="account-note">
            Signing out removes your data from this device. It stays in your account for when you sign back in.
          </p>
        </div>
      )}
    </div>
  );
}
