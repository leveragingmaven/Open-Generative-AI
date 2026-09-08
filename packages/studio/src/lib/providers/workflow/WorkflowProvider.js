import { WorkflowCapabilityError } from "./workflowErrors.js";

export class WorkflowProvider {
  constructor({ id, name, capabilities = [] } = {}) {
    this.id = id;
    this.name = name;
    this.capabilities = new Set(capabilities);
  }

  hasCapability(capability) {
    return this.capabilities.has(capability);
  }

  unsupported(methodName) {
    throw new WorkflowCapabilityError(methodName);
  }

  getWorkflowTemplates() {
    this.unsupported("getWorkflowTemplates");
  }

  createWorkflow() {
    this.unsupported("createWorkflow");
  }

  updateWorkflow() {
    this.unsupported("updateWorkflow");
  }

  validateWorkflow() {
    this.unsupported("validateWorkflow");
  }

  executeWorkflow() {
    this.unsupported("executeWorkflow");
  }

  getWorkflowRun() {
    this.unsupported("getWorkflowRun");
  }

  cancelWorkflowRun() {
    this.unsupported("cancelWorkflowRun");
  }

  uploadWorkflowAsset() {
    this.unsupported("uploadWorkflowAsset");
  }

  getWorkflowResults() {
    this.unsupported("getWorkflowResults");
  }
}
