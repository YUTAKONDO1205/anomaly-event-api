export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStatusTransitionError";
  }
}

// A non-transient deep-learning failure (misconfiguration or a broken response
// contract) that retrying or falling back to the heuristic will never fix, so it
// should surface instead of being silently masked as a successful detection.
export class DeepLearningPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepLearningPermanentError";
  }
}
