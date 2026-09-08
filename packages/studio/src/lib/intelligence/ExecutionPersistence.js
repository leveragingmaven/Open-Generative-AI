export class ExecutionPersistence {
  saveContext() { throw new Error("ExecutionPersistence.saveContext() must be implemented"); }
  saveJob() { throw new Error("ExecutionPersistence.saveJob() must be implemented"); }
  saveAttempt() { throw new Error("ExecutionPersistence.saveAttempt() must be implemented"); }
  getJob() { throw new Error("ExecutionPersistence.getJob() must be implemented"); }
  getContext() { throw new Error("ExecutionPersistence.getContext() must be implemented"); }
  listAttempts() { throw new Error("ExecutionPersistence.listAttempts() must be implemented"); }
}

export class InMemoryExecutionPersistence extends ExecutionPersistence {
  constructor() {
    super();
    this.contexts = new Map();
    this.jobs = new Map();
    this.attempts = new Map();
  }

  saveContext(context) { this.contexts.set(context.id, context); return context; }
  saveJob(job) { this.jobs.set(job.id, job); return job; }
  saveAttempt(attempt) { this.attempts.set(attempt.id, attempt); return attempt; }
  getContext(contextId) { return this.contexts.get(contextId) || null; }
  getJob(jobId) { return this.jobs.get(jobId) || null; }
  listAttempts(jobId) { return [...this.attempts.values()].filter((attempt) => attempt.jobId === jobId); }
}
