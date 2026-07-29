export class DesignAgentCapabilityError extends Error {
  constructor(methodName) {
    super(`Design Agent provider does not support ${methodName}`);
    this.name = "DesignAgentCapabilityError";
    this.code = "unsupported_capability";
    this.methodName = methodName;
  }
}

export class DesignAgentRequestError extends Error {
  constructor(message, { status = 0, code = "design_agent_request_failed" } = {}) {
    super(message || "Design Agent request failed");
    this.name = "DesignAgentRequestError";
    this.code = code;
    this.status = status;
  }
}
