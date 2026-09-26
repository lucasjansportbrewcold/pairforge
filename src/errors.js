export class JaVaFoError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'JaVaFoError';
    this.detail = detail;
  }
}

// Raised when no complete round-pairing exists (A.9: the arbiter has to decide).
export class PairingImpossibleError extends JaVaFoError {
  constructor() {
    super('Pairing impossible under the current rules - intervene manually');
    this.name = 'PairingImpossibleError';
  }
}
