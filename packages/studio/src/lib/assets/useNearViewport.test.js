import assert from "node:assert/strict";
import test from "node:test";
import { watchForNearViewport } from "./useNearViewport.js";

class FakeObserver {
  static instances = [];
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observed = [];
    this.disconnects = 0;
    FakeObserver.instances.push(this);
  }
  observe(node) { this.observed.push(node); }
  disconnect() { this.disconnects += 1; }
}

const freshObservers = () => { FakeObserver.instances = []; return FakeObserver; };

test("a tile reports once on its first intersection and then stops observing", () => {
  const Observer = freshObservers();
  const node = { name: "tile" };
  let reported = 0;
  const stop = watchForNearViewport(node, { rootMargin: "100px", onNear: () => { reported += 1; }, Observer });
  const [observer] = Observer.instances;
  assert.deepEqual(observer.observed, [node]);
  assert.deepEqual(observer.options, { rootMargin: "100px" });
  assert.equal(reported, 0, "arming the gate must not load media");
  observer.callback([{ isIntersecting: false }]);
  assert.equal(reported, 0, "an offscreen tile must not fetch");
  observer.callback([{ isIntersecting: true }]);
  assert.equal(reported, 1);
  assert.equal(observer.disconnects, 1);
  observer.callback([{ isIntersecting: true }]);
  assert.equal(reported, 1, "a loaded tile is never re-armed");
  stop();
  assert.equal(observer.disconnects, 2, "unmounting releases the observer");
});

test("one intersecting sibling is enough to load the tile", () => {
  const Observer = freshObservers();
  let reported = 0;
  const observer = () => Observer.instances[0];
  watchForNearViewport({}, { onNear: () => { reported += 1; }, Observer });
  observer().callback([{ isIntersecting: false }, { isIntersecting: true }]);
  assert.equal(reported, 1);
});

test("a missing observer or node never hides media behind the gate", () => {
  const Observer = freshObservers();
  let reported = 0;
  const onNear = () => { reported += 1; };
  watchForNearViewport(null, { onNear, Observer });
  watchForNearViewport({}, { onNear, Observer: null });
  watchForNearViewport({}, { onNear, Observer: undefined });
  assert.equal(reported, 3);
  const stop = watchForNearViewport(null, { onNear });
  assert.equal(typeof stop, "function");
  stop();
  assert.equal(reported, 4);
});

test("a tile without a callback is inert instead of throwing", () => {
  const Observer = freshObservers();
  const stop = watchForNearViewport({}, { onNear: null, Observer });
  assert.equal(typeof stop, "function");
  stop();
  assert.equal(Observer.instances.length, 0);
});
