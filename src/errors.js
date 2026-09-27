export class JaVaFoError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'JaVaFoError';
    this.detail = detail;
  }
}

// Invalid input (TRF format, number of rounds...). Reported like JaVaFo, whose
// class for these errors is called B.A.B.E in its (obfuscated) jar.
export class InputError extends JaVaFoError {
  constructor(message, detail) {
    super(message, detail);
    this.name = 'InputError';
    this.label = `B.A.B.E: ${message}`;
  }
}

// Raised when no complete round-pairing exists (A.9: the arbiter has to decide).
export class PairingImpossibleError extends JaVaFoError {
  constructor() {
    super('Pairing impossible under the current rules - intervene manually');
    this.name = 'PairingImpossibleError';
  }
}
