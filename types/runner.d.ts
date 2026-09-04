/* Minimal ambient typing for the Runner.js browser global (Run Payments tokenization). */
export {};

interface RunnerTokenizeResult {
  account_token?: string;
  expiry?: string;
  card_info?: string;
  bank_info?: string;
  risk_info?: string;
}

interface RunnerInstance {
  init(opts: Record<string, unknown>): void;
  onLoaded(cb: () => void): void;
  onTokenize(cb: (res: RunnerTokenizeResult) => void): void;
  tokenize(cb: (res: RunnerTokenizeResult, err?: unknown) => void): void;
}

declare global {
  interface Window {
    Runner?: { new (): RunnerInstance };
  }
  // Runner.js attaches a global constructor.
  var Runner: { new (): RunnerInstance } | undefined;
}
