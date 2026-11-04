import { validateVoteSignal, optionIndicesOf, decodeVoteSignalHex } from './vote-signal';

describe('validateVoteSignal (F-VOTING-14)', () => {
  const three = new Set([0, 1, 2]);

  it('accepts a well-formed weighted vote', () => {
    expect(validateVoteSignal([[0, 1], [1, 1]], 2, three)).toBeNull();
    expect(validateVoteSignal([[2, 5]], 5, three)).toBeNull();
    expect(validateVoteSignal([[0, 1], [1, 2], [2, 2]], 5, null)).toBeNull();
  });

  it('accepts a simple vote and rejects anything but one option with one point', () => {
    expect(validateVoteSignal([[1, 1]], 1, three)).toBeNull();
    expect(validateVoteSignal([[1, 1]], null, three)).toBeNull();
    expect(validateVoteSignal([[1, 2]], 1, three)).toMatch(/exactly one option/);
    expect(validateVoteSignal([[0, 1], [1, 1]], 1, three)).toMatch(/exactly one option/);
  });

  it("rejects the reviewer's payload: negative count hidden behind a matching sum", () => {
    expect(validateVoteSignal([[0, 102], [1, -100]], 2, three)).toMatch(/must be positive/);
    expect(validateVoteSignal([[0, 3], [1, 2], [2, -1]], 4, three)).toMatch(/must be positive/);
  });

  it('rejects zero counts, wrong sums, duplicates, unknown indices and non-integers', () => {
    expect(validateVoteSignal([[0, 0], [1, 2]], 2, three)).toMatch(/must be positive/);
    expect(validateVoteSignal([[0, 1]], 2, three)).toMatch(/sum to 1, the event weight is 2/);
    expect(validateVoteSignal([[0, 2], [1, 1]], 2, three)).toMatch(/sum to 3/);
    expect(validateVoteSignal([[1, 1], [1, 1]], 2, three)).toMatch(/more than once/);
    expect(validateVoteSignal([[7, 2]], 2, three)).toMatch(/does not exist/);
    expect(validateVoteSignal([[-1, 2]], 2, three)).toMatch(/invalid option index/);
    expect(validateVoteSignal([[0, 1.5], [1, 0.5]], 2, three)).toMatch(/invalid count/);
    expect(validateVoteSignal([], 2, three)).toMatch(/no vote/);
  });

  it('reads option indices from the stored options JSON', () => {
    expect(optionIndicesOf(JSON.stringify([{ index: 0, text: 'a' }, { index: 1, text: 'b' }]))).toEqual(new Set([0, 1]));
    expect(optionIndicesOf(JSON.stringify([{ text: 'a' }, { text: 'b' }]))).toEqual(new Set([0, 1]));
    expect(optionIndicesOf(null)).toBeNull();
    expect(optionIndicesOf('not json')).toBeNull();
  });

  it('decodes the CBOR signal including negative counts', () => {
    expect(decodeVoteSignalHex('9f9f0201ffff')).toEqual([[2, 1]]);
    expect(decodeVoteSignalHex('9f9f001866ff9f013863ffff')).toEqual([[0, 102], [1, -100]]);
    expect(() => decodeVoteSignalHex('00')).toThrow();
    expect(() => decodeVoteSignalHex('9f9f00ffff')).toThrow('not a pair');
  });
});
