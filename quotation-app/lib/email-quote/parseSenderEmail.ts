export function parseSenderEmail(fromHeader: string): string | null {
  const bracketed = fromHeader.match(/<([^<>]+)>/);
  const candidate = (bracketed ? bracketed[1] : fromHeader).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate.toLowerCase() : null;
}
