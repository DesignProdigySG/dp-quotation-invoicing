export type AppStatus = "Draft" | "Sent" | "Paid";

const APP_STATUS_RANK: Record<AppStatus, number> = { Draft: 0, Sent: 1, Paid: 2 };

const XERO_TO_APP_STATUS: Record<string, AppStatus | undefined> = {
  AUTHORISED: "Sent",
  SUBMITTED: "Sent",
  PAID: "Paid",
};

// Only ever moves the app's own status forward (Draft -> Sent -> Paid), never
// back — a manually-marked "Paid" invoice must not be knocked back to "Sent"
// just because Xero hasn't caught up yet, and a VOIDED/DELETED Xero status
// shouldn't silently regress anything either. Returns null when there's
// nothing to change.
export function nextAppStatus(
  currentStatus: AppStatus,
  xeroStatus: string | null | undefined
): AppStatus | null {
  if (!xeroStatus) return null;
  const target = XERO_TO_APP_STATUS[xeroStatus];
  if (!target) return null;
  return APP_STATUS_RANK[target] > APP_STATUS_RANK[currentStatus] ? target : null;
}
