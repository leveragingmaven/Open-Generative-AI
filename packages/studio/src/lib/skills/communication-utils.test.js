import assert from "node:assert/strict";
import test from "node:test";
import {
  splitIntoSentences,
  tokenizeWords,
  countMatches,
  clamp,
  countRepeatedPhrases,
} from "./communication-utils.js";

test("splitIntoSentences splits on sentence boundaries and trims", () => {
  assert.deepEqual(
    splitIntoSentences("First sentence. Second sentence! Third?"),
    ["First sentence.", "Second sentence!", "Third?"],
  );
});

test("splitIntoSentences handles empty and whitespace-only input", () => {
  assert.deepEqual(splitIntoSentences(""), []);
  assert.deepEqual(splitIntoSentences("   "), []);
  assert.deepEqual(splitIntoSentences(null), []);
});

test("splitIntoSentences handles newlines as boundaries", () => {
  assert.deepEqual(
    splitIntoSentences("Line one\nLine two\n\nLine three."),
    ["Line one", "Line two", "Line three."],
  );
});

test("tokenizeWords extracts words, numbers, and apostrophes", () => {
  assert.deepEqual(tokenizeWords("We don't quit, ever!"), ["We", "don't", "quit", "ever"]);
  assert.deepEqual(tokenizeWords("Save 30% today"), ["Save", "30", "today"]);
});

test("tokenizeWords handles empty input", () => {
  assert.deepEqual(tokenizeWords(""), []);
  assert.deepEqual(tokenizeWords(null), []);
});

test("countMatches counts every occurrence of every needle case-insensitively", () => {
  assert.equal(countMatches("The best and the best.", ["the best"]), 2);
  assert.equal(countMatches("AB AB AB", ["ab"]), 3);
  assert.equal(countMatches("hello world", ["nope", "world"]), 1);
  assert.equal(countMatches("", ["x"]), 0);
});

test("clamp bounds values within the inclusive range", () => {
  assert.equal(clamp(50, 0, 100), 50);
  assert.equal(clamp(-5, 0, 100), 0);
  assert.equal(clamp(150, 0, 100), 100);
});

test("countRepeatedPhrases detects repeated bigrams with default threshold", () => {
  const words = ["a", "b", "c", "a", "b", "d", "a", "b", "e", "a", "b", "f", "a", "b", "g"];
  assert.equal(countRepeatedPhrases(words), 1);
});

test("countRepeatedPhrases detects repeated trigrams with default threshold", () => {
  const words = ["a", "b", "c", "a", "b", "c", "a", "b", "c"];
  assert.equal(countRepeatedPhrases(words), 1);
});

test("countRepeatedPhrases returns zero for natural copy", () => {
  const words = ["Our", "product", "is", "fast", "and", "reliable"];
  assert.equal(countRepeatedPhrases(words), 0);
});

test("countRepeatedPhrases honors custom thresholds", () => {
  const words = ["a", "b", "c", "a", "b", "d", "a", "b", "e", "a", "b", "f"];
  assert.equal(countRepeatedPhrases(words, { bigramThreshold: 5 }), 0);
  assert.equal(countRepeatedPhrases(words, { bigramThreshold: 4 }), 1);
});

test("countRepeatedPhrases handles short and empty input", () => {
  assert.equal(countRepeatedPhrases([]), 0);
  assert.equal(countRepeatedPhrases(["only"]), 0);
});
