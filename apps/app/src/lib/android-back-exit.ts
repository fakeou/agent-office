export interface OfficeBackExitInput {
  now: number;
  armedUntil: number;
  windowMs: number;
}

export interface OfficeBackExitOutcome {
  shouldExit: boolean;
  showHint: boolean;
  armedUntil: number;
}

export function isAndroidUserAgent(userAgent: string) {
  return /Android/i.test(userAgent);
}

export function getOfficeBackExitOutcome({
  now,
  armedUntil,
  windowMs,
}: OfficeBackExitInput): OfficeBackExitOutcome {
  if (armedUntil > now) {
    return {
      shouldExit: true,
      showHint: false,
      armedUntil: 0,
    };
  }

  return {
    shouldExit: false,
    showHint: true,
    armedUntil: now + windowMs,
  };
}
