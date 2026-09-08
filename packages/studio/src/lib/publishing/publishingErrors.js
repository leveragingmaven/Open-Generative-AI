export class PublishingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PublishingError";
    this.code = details.code || "publishing_error";
    this.status = details.status;
    this.details = details;
  }
}

export class UnsupportedPublishingCapabilityError extends PublishingError {
  constructor(methodName, provider = "muapi") {
    super(`${provider} publishing provider does not support ${methodName} in this Creative Studio build`, {
      code: "unsupported_capability",
      provider,
      methodName,
    });
    this.name = "UnsupportedPublishingCapabilityError";
  }
}

export class PublishingValidationError extends PublishingError {
  constructor(message, details = {}) {
    super(message, { ...details, code: "validation_error" });
    this.name = "PublishingValidationError";
  }
}
