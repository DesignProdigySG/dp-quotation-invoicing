// xero-node's generated API calls reject with an Axios error whose `.message`
// is just a generic "Request failed with status code 400" — the actual
// reason (e.g. a validation error naming a bad TaxType or AccountCode) is
// buried in `.response.data`, which Xero returns as JSON. This pulls that
// out so failures are actually diagnosable instead of a generic label.
export function describeXeroError(e: unknown): string {
  if (e && typeof e === "object") {
    const anyErr = e as Record<string, any>;
    const data = anyErr.response?.data;
    if (data) {
      if (typeof data === "string") return data;
      try {
        return JSON.stringify(data);
      } catch {
        // fall through
      }
    }
    if (e instanceof Error) return e.message;
    try {
      return JSON.stringify(anyErr);
    } catch {
      // fall through
    }
  }
  return String(e);
}
