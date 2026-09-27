export class PairingError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'PairingError';
    this.detail = detail;
  }
}

// Invalid input (TRF format, number of rounds...).
export class InputError extends PairingError {
  constructor(message, detail) {
    super(message, detail);
    this.name = 'InputError';
  }
}

// Raised when no complete round-pairing exists (A.9: the arbiter has to decide).
export class PairingImpossibleError extends PairingError {
  constructor() {
    super('Pairing impossible under the current rules - intervene manually');
    this.name = 'PairingImpossibleError';
  }
}
