export class CheckpointRepository {
  save() { throw new Error("CheckpointRepository.save() must be implemented"); }
  get() { throw new Error("CheckpointRepository.get() must be implemented"); }
  listIncomplete() { throw new Error("CheckpointRepository.listIncomplete() must be implemented"); }
  remove() { throw new Error("CheckpointRepository.remove() must be implemented"); }
}

export class InMemoryCheckpointRepository extends CheckpointRepository {
  constructor() { super(); this.values = new Map(); }
  save(checkpoint) { this.values.set(checkpoint.id, checkpoint); return checkpoint; }
  get(id) { return this.values.get(id) || null; }
  listIncomplete() { return [...this.values.values()].filter((value) => !["completed", "failed", "cancelled", "expired"].includes(value.status)); }
  remove(id) { return this.values.delete(id); }
}
