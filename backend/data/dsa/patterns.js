// The DSA patterns a student masters, in teaching order. `needs` lists the
// patterns that should be comfortable first; the practice map draws these as
// prerequisites and the plan recommends patterns in this order.

const PATTERNS = [
  {
    key: 'arrays_hashing',
    name: 'Arrays and Hashing',
    needs: [],
    summary: 'Count, look up and group values in one pass using a hash map or set.',
  },
  {
    key: 'two_pointers',
    name: 'Two Pointers',
    needs: ['arrays_hashing'],
    summary: 'Walk two indexes toward or alongside each other instead of checking every pair.',
  },
  {
    key: 'sliding_window',
    name: 'Sliding Window',
    needs: ['two_pointers'],
    summary: 'Keep a window over a contiguous range and update it as it slides.',
  },
  {
    key: 'stack',
    name: 'Stack',
    needs: ['arrays_hashing'],
    summary: 'Remember unfinished work in last-in, first-out order.',
  },
  {
    key: 'binary_search',
    name: 'Binary Search',
    needs: ['arrays_hashing'],
    summary: 'Halve the search space each step, on an array or on the answer itself.',
  },
  {
    key: 'linked_list',
    name: 'Linked List',
    needs: ['two_pointers'],
    summary: 'Rewire next pointers carefully; dummy heads and fast/slow pointers help.',
  },
  {
    key: 'recursion_backtracking',
    name: 'Recursion and Backtracking',
    needs: ['arrays_hashing'],
    summary: 'Build answers choice by choice and undo choices that lead nowhere.',
  },
  {
    key: 'trees',
    name: 'Trees',
    needs: ['recursion_backtracking'],
    summary: 'Solve for a node by combining the answers from its children.',
  },
  {
    key: 'heaps',
    name: 'Heaps',
    needs: ['trees'],
    summary: 'Keep the smallest or largest few items at hand with a priority queue.',
  },
  {
    key: 'graphs',
    name: 'Graphs',
    needs: ['trees', 'stack'],
    summary: 'Explore connected things with breadth-first or depth-first search.',
  },
  {
    key: 'greedy',
    name: 'Greedy',
    needs: ['two_pointers'],
    summary: 'Make the locally best choice when it can be shown never to hurt.',
  },
  {
    key: 'intervals',
    name: 'Intervals',
    needs: ['greedy'],
    summary: 'Sort by start or end, then merge, insert or count overlaps.',
  },
  {
    key: 'dp_1d',
    name: '1-D Dynamic Programming',
    needs: ['recursion_backtracking'],
    summary: 'Reuse answers to smaller prefixes instead of recomputing them.',
  },
  {
    key: 'dp_2d',
    name: '2-D Dynamic Programming',
    needs: ['dp_1d'],
    summary: 'Fill a table where each cell depends on its neighbours.',
  },
  {
    key: 'bit_manipulation',
    name: 'Bit Manipulation',
    needs: ['arrays_hashing'],
    summary: 'Use XOR, shifts and masks to work on individual bits.',
  },
];

const PATTERN_BY_KEY = Object.fromEntries(PATTERNS.map((p) => [p.key, p]));

module.exports = { PATTERNS, PATTERN_BY_KEY };
