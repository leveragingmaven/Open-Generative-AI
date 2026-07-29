export class WorkflowCapabilityError extends Error {
  constructor(methodName) {
    super(`Workflow provider does not support ${methodName}`);
    this.name = "WorkflowCapabilityError";
    this.code = "unsupported_capability";
    this.methodName = methodName;
  }
}

export class WorkflowValidationError extends Error {
  constructor(message, details = {}) {
    super(message || "Workflow validation failed");
    this.name = "WorkflowValidationError";
    this.code = "workflow_validation_failed";
    this.details = details;
  }
}
