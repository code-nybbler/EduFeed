// Turns a Firebase sign-in error into something to show a person, or null when the person
// simply changed their mind (closed the window), which needs no message.

const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

export function authMessage(error) {
  const code = error?.code ?? '';
  if (CANCELLED.has(code)) return null;
  switch (code) {
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return "This site's address isn't authorized for sign-in yet. In the Firebase console, add it under Authentication → Settings → Authorized domains.";
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not turned on for this project yet (Firebase console → Authentication → Sign-in method).';
    case 'auth/network-request-failed':
      return "Couldn't reach Google. Check your connection and try again.";
    case 'unsynced':
      return error.message; // sign-out refused: the latest changes could not be saved to the account
    default:
      return `Couldn't sign in (${code || 'unknown error'}).`;
  }
}
