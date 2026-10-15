// Practice problem bank (source). Run `npm run build:dsa` after editing: the build
// runs every reference solution on every test input and writes problems.json
// with the expected answers, so no expected value here is typed by hand.
//
// Fields:
//   params      shown to the student in the starter code
//   argKinds    how each argument is passed in: 'plain', 'list_node' or 'tree'
//   returnKind  how the result is read back: 'plain', 'list_node' or 'tree'
//   compare     'exact', 'unordered' (order of the outer list does not matter),
//               'nested_unordered' (inner lists too) or 'float'
//   examples    shown with the problem; tests are hidden and include edge cases
//   perf        large hidden inputs that only an efficient solution finishes in time

// Repeatable pseudo-random numbers, so large test inputs are the same on every build
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomInts(seed, count, lo, hi) {
  const next = seeded(seed);
  return Array.from({ length: count }, () => lo + Math.floor(next() * (hi - lo + 1)));
}

function randomString(seed, count, alphabet) {
  const next = seeded(seed);
  return Array.from({ length: count }, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
}

const PROBLEMS = [
  // ── Arrays and Hashing ────────────────────────────────────────────────────
  {
    slug: 'contains-duplicate',
    title: 'Contains Duplicate',
    pattern: 'arrays_hashing',
    difficulty: 'easy',
    statement:
      'Given a list of integers `nums`, return `True` if any value appears at least twice, and `False` if every value is different.',
    constraints: ['0 <= len(nums) <= 100000'],
    functionName: 'contains_duplicate',
    params: [{ name: 'nums', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[1, 2, 3, 1]], [[4, 5, 6]]],
    tests: [[[]], [[7]], [[-1, -1]], [[0, 1, 2, 3, 4, 5, 0]]],
    perf: [[randomInts(11, 30000, 0, 10 ** 9)]],
    hints: [
      'As you scan the list, what do you need to remember about the values you have already seen?',
      'Keep a set of seen values. A value already in the set is a duplicate.',
      'seen = empty set; for each x: if x in seen return True; add x; after the loop return False.',
    ],
    complexity: 'O(n) time, O(n) space',
    solution: `
def contains_duplicate(nums):
    seen = set()
    for x in nums:
        if x in seen:
            return True
        seen.add(x)
    return False
`,
  },
  {
    slug: 'two-sum',
    title: 'Two Sum',
    pattern: 'arrays_hashing',
    difficulty: 'easy',
    statement:
      'Given a list of integers `nums` and an integer `target`, return the indexes of the two different elements that add up to `target`. Exactly one such pair exists. The indexes may be returned in any order.',
    constraints: ['2 <= len(nums) <= 100000', 'exactly one valid pair'],
    functionName: 'two_sum',
    params: [{ name: 'nums', type: 'list[int]' }, { name: 'target', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'unordered',
    examples: [[[2, 7, 11, 15], 9], [[3, 2, 4], 6]],
    tests: [[[3, 3], 6], [[-1, -2, -3, -4, -5], -8], [[0, 4, 3, 0], 0], [[1, 5, 9, 14], 23]],
    perf: [[[...randomInts(12, 25000, 1, 1000000).map((x) => x * 2 + 10), 3, 5], 8]],
    hints: [
      'For each number, which other number would complete the target?',
      'Store each value with its index in a dictionary. For a new number, check whether target - number is already stored.',
      'index_of = {}; for i, x in enumerate(nums): if target - x in index_of return [index_of[target - x], i]; index_of[x] = i.',
    ],
    complexity: 'O(n) time, O(n) space',
    solution: `
def two_sum(nums, target):
    index_of = {}
    for i, x in enumerate(nums):
        if target - x in index_of:
            return [index_of[target - x], i]
        index_of[x] = i
    return []
`,
  },
  {
    slug: 'group-anagrams',
    title: 'Group Anagrams',
    pattern: 'arrays_hashing',
    difficulty: 'medium',
    statement:
      'Given a list of lowercase words, group together the words that are anagrams of each other (same letters, same counts). Return the groups in any order; the words inside a group may also be in any order.',
    constraints: ['0 <= len(words) <= 10000', 'each word has at most 100 lowercase letters'],
    functionName: 'group_anagrams',
    params: [{ name: 'words', type: 'list[str]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'nested_unordered',
    examples: [[['eat', 'tea', 'tan', 'ate', 'nat', 'bat']], [['a']]],
    tests: [[['']], [[]], [['abc', 'bca', 'cab', 'xyz']], [['ab', 'ba', 'abc', 'ab']]],
    hints: [
      'Two words are anagrams exactly when something about them is identical. What can you compute from a word that ignores letter order?',
      'Use the sorted letters of each word (or a count of each letter) as a dictionary key, and collect words under their key.',
      'groups = defaultdict(list); for w in words: groups[tuple(sorted(w))].append(w); return list(groups.values()).',
    ],
    complexity: 'O(n * k log k) time for n words of length k',
    solution: `
def group_anagrams(words):
    groups = {}
    for w in words:
        groups.setdefault(''.join(sorted(w)), []).append(w)
    return list(groups.values())
`,
  },

  // ── Two Pointers ──────────────────────────────────────────────────────────
  {
    slug: 'valid-palindrome',
    title: 'Valid Palindrome',
    pattern: 'two_pointers',
    difficulty: 'easy',
    statement:
      'Return `True` if the string `s` reads the same forwards and backwards after removing every character that is not a letter or digit and ignoring upper/lower case.',
    constraints: ['0 <= len(s) <= 200000'],
    functionName: 'is_palindrome',
    params: [{ name: 's', type: 'str' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [['A man, a plan, a canal: Panama'], ['race a car']],
    tests: [[''], [' '], ['0P'], ['ab_a'], ['No lemon, no melon']],
    hints: [
      'Can you compare characters from both ends at once instead of building a cleaned copy?',
      'Use a left and a right index. Skip characters that are not alphanumeric, then compare the two lowercased characters.',
      'l, r = 0, len(s)-1; while l < r: move l right past non-alnum; move r left past non-alnum; if lower differs return False; l += 1; r -= 1.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def is_palindrome(s):
    l, r = 0, len(s) - 1
    while l < r:
        while l < r and not s[l].isalnum():
            l += 1
        while l < r and not s[r].isalnum():
            r -= 1
        if s[l].lower() != s[r].lower():
            return False
        l += 1
        r -= 1
    return True
`,
  },
  {
    slug: 'container-with-most-water',
    title: 'Container With Most Water',
    pattern: 'two_pointers',
    difficulty: 'medium',
    statement:
      '`heights[i]` is the height of a vertical line at position `i`. Choose two lines that, together with the x-axis, hold the most water. Return that amount: the distance between the lines times the shorter height.',
    constraints: ['2 <= len(heights) <= 100000', '0 <= heights[i] <= 10000'],
    functionName: 'max_area',
    params: [{ name: 'heights', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[1, 8, 6, 2, 5, 4, 8, 3, 7]], [[1, 1]]],
    tests: [[[4, 3, 2, 1, 4]], [[1, 2, 1]], [[0, 0]], [[2, 3, 10, 5, 7, 8, 9]]],
    perf: [[randomInts(21, 30000, 0, 10000)]],
    hints: [
      'Start with the widest container. Which of the two lines limits it?',
      'Move the pointer at the shorter line inward: moving the taller one can never give more water.',
      'l, r = 0, n-1; best = 0; while l < r: best = max(best, (r-l)*min(h[l], h[r])); move the shorter side inward.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def max_area(heights):
    l, r = 0, len(heights) - 1
    best = 0
    while l < r:
        best = max(best, (r - l) * min(heights[l], heights[r]))
        if heights[l] < heights[r]:
            l += 1
        else:
            r -= 1
    return best
`,
  },
  {
    slug: 'three-sum',
    title: 'Three Sum',
    pattern: 'two_pointers',
    difficulty: 'medium',
    statement:
      'Return every distinct triplet of values from `nums` whose sum is 0. Each triplet uses three different positions, and the answer must not contain the same triplet twice. Triplets and their values may be in any order.',
    constraints: ['0 <= len(nums) <= 3000'],
    functionName: 'three_sum',
    params: [{ name: 'nums', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'nested_unordered',
    examples: [[[-1, 0, 1, 2, -1, -4]], [[0, 1, 1]]],
    tests: [[[0, 0, 0, 0]], [[]], [[-2, 0, 1, 1, 2]], [[3, -2, 1, 0]], [[-4, -1, -1, 0, 1, 2]]],
    perf: [[randomInts(31, 900, -100000, 100000)]],
    hints: [
      'Sorting the list first makes both finding pairs and skipping duplicates easier.',
      'Fix the first value, then find pairs for the rest with two pointers moving inward on the sorted list.',
      'sort; for i: skip if same as previous; l, r = i+1, n-1; move by comparing the sum with 0; after a hit, skip equal values on both sides.',
    ],
    complexity: 'O(n^2) time, O(1) extra space',
    solution: `
def three_sum(nums):
    nums = sorted(nums)
    out = []
    for i in range(len(nums)):
        if i and nums[i] == nums[i - 1]:
            continue
        l, r = i + 1, len(nums) - 1
        while l < r:
            s = nums[i] + nums[l] + nums[r]
            if s < 0:
                l += 1
            elif s > 0:
                r -= 1
            else:
                out.append([nums[i], nums[l], nums[r]])
                l += 1
                while l < r and nums[l] == nums[l - 1]:
                    l += 1
                r -= 1
    return out
`,
  },

  // ── Sliding Window ────────────────────────────────────────────────────────
  {
    slug: 'best-time-to-sell',
    title: 'Best Time to Buy and Sell',
    pattern: 'sliding_window',
    difficulty: 'easy',
    statement:
      '`prices[i]` is a share price on day `i`. Buy on one day and sell on a later day. Return the largest possible profit, or 0 if no profit is possible.',
    constraints: ['1 <= len(prices) <= 100000'],
    functionName: 'max_profit',
    params: [{ name: 'prices', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[7, 1, 5, 3, 6, 4]], [[7, 6, 4, 3, 1]]],
    tests: [[[5]], [[1, 2]], [[2, 4, 1]], [[3, 3, 3]], [[2, 1, 2, 1, 0, 1, 2]]],
    perf: [[randomInts(41, 30000, 1, 100000)]],
    hints: [
      'For a sale on a given day, which buying day gives the best profit?',
      'Track the lowest price seen so far; each day, compare selling today against the best profit so far.',
      'low = inf; best = 0; for p in prices: low = min(low, p); best = max(best, p - low).',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def max_profit(prices):
    low = float('inf')
    best = 0
    for p in prices:
        low = min(low, p)
        best = max(best, p - low)
    return best
`,
  },
  {
    slug: 'longest-unique-substring',
    title: 'Longest Substring Without Repeats',
    pattern: 'sliding_window',
    difficulty: 'medium',
    statement:
      'Return the length of the longest contiguous part of string `s` in which no character appears twice.',
    constraints: ['0 <= len(s) <= 100000'],
    functionName: 'length_of_longest_substring',
    params: [{ name: 's', type: 'str' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [['abcabcbb'], ['bbbbb']],
    tests: [[''], ['pwwkew'], [' '], ['dvdf'], ['abba'], ['tmmzuxt']],
    perf: [[randomString(51, 40000, 'abcdefghijklmnopqrstuvwxyz0123456789')]],
    hints: [
      'When you meet a repeated character, which part of the current window can you throw away?',
      'Keep a window [left, right] and the last index of each character. On a repeat inside the window, move left just past the earlier copy.',
      'last = {}; left = 0; for right, c in enumerate(s): if c in last and last[c] >= left: left = last[c] + 1; last[c] = right; best = max(best, right-left+1).',
    ],
    complexity: 'O(n) time, O(k) space for k distinct characters',
    solution: `
def length_of_longest_substring(s):
    last = {}
    left = 0
    best = 0
    for right, c in enumerate(s):
        if c in last and last[c] >= left:
            left = last[c] + 1
        last[c] = right
        best = max(best, right - left + 1)
    return best
`,
  },
  {
    slug: 'sliding-window-maximum',
    title: 'Sliding Window Maximum',
    pattern: 'sliding_window',
    difficulty: 'hard',
    statement:
      'A window of size `k` slides over `nums` from left to right, one position at a time. Return a list with the largest value in each window position.',
    constraints: ['1 <= k <= len(nums) <= 100000'],
    functionName: 'max_sliding_window',
    params: [{ name: 'nums', type: 'list[int]' }, { name: 'k', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[1, 3, -1, -3, 5, 3, 6, 7], 3], [[1], 1]],
    tests: [[[9, 8, 7, 6], 2], [[1, 2, 3, 4], 4], [[4, -2], 1], [[7, 2, 4], 2]],
    perf: [[randomInts(61, 24000, -10000, 10000), 4000]],
    hints: [
      'Once a bigger number enters the window, can any smaller number before it ever be the maximum again?',
      'Keep a deque of indexes whose values are decreasing. The front is the current maximum; drop it when it leaves the window.',
      'for i, x: pop back while nums[back] <= x; push i; pop front if it is i-k; once i >= k-1 append nums[front].',
    ],
    complexity: 'O(n) time, O(k) space',
    solution: `
from collections import deque
def max_sliding_window(nums, k):
    q = deque()
    out = []
    for i, x in enumerate(nums):
        while q and nums[q[-1]] <= x:
            q.pop()
        q.append(i)
        if q[0] == i - k:
            q.popleft()
        if i >= k - 1:
            out.append(nums[q[0]])
    return out
`,
  },

  // ── Stack ─────────────────────────────────────────────────────────────────
  {
    slug: 'valid-parentheses',
    title: 'Valid Brackets',
    pattern: 'stack',
    difficulty: 'easy',
    statement:
      'The string `s` contains only the characters `()[]{}`. Return `True` if every bracket is closed by the same type of bracket in the correct order.',
    constraints: ['0 <= len(s) <= 100000'],
    functionName: 'is_valid',
    params: [{ name: 's', type: 'str' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [['()[]{}'], ['(]']],
    tests: [[''], ['('], [')'], ['([)]'], ['{[]}'], ['(('], ['){']],
    hints: [
      'Which opening bracket must the next closing bracket match?',
      'Push opening brackets on a stack. A closing bracket must match the top; pop it if it does.',
      'pairs = {")": "(", "]": "[", "}": "{"}; for c in s: if c in pairs: if not stack or stack.pop() != pairs[c]: return False else push c; return not stack.',
    ],
    complexity: 'O(n) time, O(n) space',
    solution: `
def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for c in s:
        if c in pairs:
            if not stack or stack.pop() != pairs[c]:
                return False
        else:
            stack.append(c)
    return not stack
`,
  },
  {
    slug: 'daily-temperatures',
    title: 'Days Until Warmer',
    pattern: 'stack',
    difficulty: 'medium',
    statement:
      'For each day in `temps`, return how many days you have to wait for a strictly warmer temperature. Use 0 when no warmer day follows.',
    constraints: ['1 <= len(temps) <= 100000'],
    functionName: 'daily_temperatures',
    params: [{ name: 'temps', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[73, 74, 75, 71, 69, 72, 76, 73]], [[30, 40, 50, 60]]],
    tests: [[[30, 60, 90]], [[90, 80, 70]], [[50]], [[70, 70, 71]]],
    perf: [[[...Array.from({ length: 25000 }, (_, i) => 100000 - i), 100001]]],
    hints: [
      'Which days are still waiting for their warmer day when you reach today?',
      'Keep a stack of indexes still waiting. Today answers every waiting day colder than today.',
      'ans = [0]*n; stack = []; for i, t: while stack and temps[stack[-1]] < t: j = stack.pop(); ans[j] = i - j; push i.',
    ],
    complexity: 'O(n) time, O(n) space',
    solution: `
def daily_temperatures(temps):
    ans = [0] * len(temps)
    stack = []
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()
            ans[j] = i - j
        stack.append(i)
    return ans
`,
  },
  {
    slug: 'largest-rectangle-histogram',
    title: 'Largest Rectangle in a Histogram',
    pattern: 'stack',
    difficulty: 'hard',
    statement:
      '`heights` are the bar heights of a histogram, each bar 1 unit wide. Return the area of the largest rectangle that fits entirely inside the histogram.',
    constraints: ['1 <= len(heights) <= 100000'],
    functionName: 'largest_rectangle',
    params: [{ name: 'heights', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[2, 1, 5, 6, 2, 3]], [[2, 4]]],
    tests: [[[1]], [[0, 0]], [[2, 2, 2]], [[6, 2, 5, 4, 5, 1, 6]], [[1, 2, 3, 4, 5]]],
    perf: [[Array.from({ length: 25000 }, (_, i) => i + 1)]],
    hints: [
      'For each bar, how far left and right can a rectangle of exactly its height reach?',
      'Keep a stack of bars with increasing heights. When a shorter bar arrives, bars popped from the stack have found their right edge.',
      'append a 0 sentinel; for i, h: while stack and heights[top] > h: height = heights[pop]; left = stack[-1] if stack else -1; area = height*(i-left-1).',
    ],
    complexity: 'O(n) time, O(n) space',
    solution: `
def largest_rectangle(heights):
    heights = list(heights) + [0]
    stack = []
    best = 0
    for i, h in enumerate(heights):
        while stack and heights[stack[-1]] > h:
            height = heights[stack.pop()]
            left = stack[-1] if stack else -1
            best = max(best, height * (i - left - 1))
        stack.append(i)
    return best
`,
  },

  // ── Binary Search ─────────────────────────────────────────────────────────
  {
    slug: 'binary-search',
    title: 'Binary Search',
    pattern: 'binary_search',
    difficulty: 'easy',
    statement:
      '`nums` is sorted in increasing order with no repeats. Return the index of `target`, or -1 if it is not present. Aim for O(log n).',
    constraints: ['1 <= len(nums) <= 100000'],
    functionName: 'search',
    params: [{ name: 'nums', type: 'list[int]' }, { name: 'target', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[-1, 0, 3, 5, 9, 12], 9], [[-1, 0, 3, 5, 9, 12], 2]],
    tests: [[[5], 5], [[5], -5], [[1, 3], 3], [[1, 3], 1], [[1, 3, 5, 7, 9], 10], [[1, 3, 5, 7, 9], 0]],
    hints: [
      'Comparing the middle element with the target tells you which half can be ignored.',
      'Keep lo and hi bounds. Check the middle, then move lo or hi past it. Be careful with the loop condition and the + 1 / - 1.',
      'lo, hi = 0, n-1; while lo <= hi: mid = (lo+hi)//2; equal: return mid; less: lo = mid+1; else hi = mid-1; return -1.',
    ],
    complexity: 'O(log n) time, O(1) space',
    solution: `
def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`,
  },
  {
    slug: 'search-rotated-array',
    title: 'Search a Rotated Sorted Array',
    pattern: 'binary_search',
    difficulty: 'medium',
    statement:
      'A sorted list of distinct integers was rotated at an unknown point, for example `[0,1,2,4,5,6,7]` became `[4,5,6,7,0,1,2]`. Return the index of `target`, or -1. Aim for O(log n).',
    constraints: ['1 <= len(nums) <= 5000', 'values are distinct'],
    functionName: 'search_rotated',
    params: [{ name: 'nums', type: 'list[int]' }, { name: 'target', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[4, 5, 6, 7, 0, 1, 2], 0], [[4, 5, 6, 7, 0, 1, 2], 3]],
    tests: [[[1], 0], [[1], 1], [[3, 1], 1], [[5, 1, 3], 5], [[6, 7, 1, 2, 3, 4, 5], 7], [[1, 2, 3, 4], 4]],
    hints: [
      'After picking the middle, at least one of the two halves is still sorted. Which one?',
      'Find the sorted half by comparing nums[lo] and nums[mid]; check whether the target lies inside that half to decide where to go.',
      'if nums[lo] <= nums[mid]: go left if nums[lo] <= target < nums[mid] else right; else go right if nums[mid] < target <= nums[hi] else left.',
    ],
    complexity: 'O(log n) time, O(1) space',
    solution: `
def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1
`,
  },
  {
    slug: 'minimum-eating-speed',
    title: 'Minimum Eating Speed',
    pattern: 'binary_search',
    difficulty: 'medium',
    statement:
      '`piles[i]` bananas are in pile `i`. Each hour you eat up to `k` bananas from one pile (a pile with fewer left takes the whole hour). Return the smallest whole `k` that lets you finish every pile within `h` hours.',
    constraints: ['1 <= len(piles) <= h <= 1000000000', '1 <= piles[i] <= 1000000000'],
    functionName: 'min_eating_speed',
    params: [{ name: 'piles', type: 'list[int]' }, { name: 'h', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[3, 6, 7, 11], 8], [[30, 11, 23, 4, 20], 5]],
    tests: [[[30, 11, 23, 4, 20], 6], [[1], 1], [[1000000000], 2], [[312884470], 312884469], [[5, 5, 5], 15]],
    perf: [[randomInts(71, 15000, 1, 1000000000), 400000]],
    hints: [
      'If speed k is fast enough, is every speed above k also fast enough?',
      'Binary search on k between 1 and max(piles). For a candidate speed, count the hours needed with ceiling division.',
      'lo, hi = 1, max(piles); while lo < hi: mid = (lo+hi)//2; hours = sum((p+mid-1)//mid); if hours <= h: hi = mid else lo = mid+1; return lo.',
    ],
    complexity: 'O(n log m) time for largest pile m',
    solution: `
def min_eating_speed(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        if sum((p + mid - 1) // mid for p in piles) <= h:
            hi = mid
        else:
            lo = mid + 1
    return lo
`,
  },

  // ── Linked List ───────────────────────────────────────────────────────────
  {
    slug: 'reverse-linked-list',
    title: 'Reverse a Linked List',
    pattern: 'linked_list',
    difficulty: 'easy',
    statement:
      'Given the `head` of a singly linked list (`ListNode` with `.val` and `.next`), reverse the list and return the new head. Tests write lists as Python lists, e.g. `[1,2,3]`.',
    constraints: ['0 <= length <= 5000'],
    functionName: 'reverse_list',
    params: [{ name: 'head', type: 'ListNode' }],
    argKinds: ['list_node'],
    returnKind: 'list_node',
    compare: 'exact',
    examples: [[[1, 2, 3, 4, 5]], [[1, 2]]],
    tests: [[[]], [[7]], [[1, 1, 2]]],
    hints: [
      'Walk the list once. When you are at a node, what should its next pointer point to afterwards?',
      'Keep prev and current. Before changing current.next, save the original next node.',
      'prev = None; while head: nxt = head.next; head.next = prev; prev = head; head = nxt; return prev.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def reverse_list(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev = head
        head = nxt
    return prev
`,
  },
  {
    slug: 'merge-two-sorted-lists',
    title: 'Merge Two Sorted Lists',
    pattern: 'linked_list',
    difficulty: 'easy',
    statement:
      'Merge two sorted linked lists `a` and `b` into one sorted linked list made by splicing their nodes together, and return its head.',
    constraints: ['0 <= length of each <= 5000'],
    functionName: 'merge_two_lists',
    params: [{ name: 'a', type: 'ListNode' }, { name: 'b', type: 'ListNode' }],
    argKinds: ['list_node', 'list_node'],
    returnKind: 'list_node',
    compare: 'exact',
    examples: [[[1, 2, 4], [1, 3, 4]], [[], [0]]],
    tests: [[[], []], [[5], [1, 2, 3]], [[1, 1], [1]], [[-3, 10], [-5, 0, 11]]],
    hints: [
      'At each step, only the two current heads can be the next smallest node.',
      'Use a dummy node as the start of the result and a tail pointer you extend; attach whatever is left at the end.',
      'dummy = tail = ListNode(); while a and b: take the smaller, tail.next = it, advance; tail.next = a or b; return dummy.next.',
    ],
    complexity: 'O(n + m) time, O(1) space',
    solution: `
def merge_two_lists(a, b):
    dummy = tail = ListNode()
    while a and b:
        if a.val <= b.val:
            tail.next, a = a, a.next
        else:
            tail.next, b = b, b.next
        tail = tail.next
    tail.next = a or b
    return dummy.next
`,
  },
  {
    slug: 'remove-nth-from-end',
    title: 'Remove the N-th Node From the End',
    pattern: 'linked_list',
    difficulty: 'medium',
    statement:
      'Remove the `n`-th node counting from the end of the linked list and return the head. `n` is always valid.',
    constraints: ['1 <= n <= length <= 5000'],
    functionName: 'remove_nth_from_end',
    params: [{ name: 'head', type: 'ListNode' }, { name: 'n', type: 'int' }],
    argKinds: ['list_node', 'plain'],
    returnKind: 'list_node',
    compare: 'exact',
    examples: [[[1, 2, 3, 4, 5], 2], [[1], 1]],
    tests: [[[1, 2], 1], [[1, 2], 2], [[1, 2, 3], 3], [[10, 20, 30, 40], 1]],
    hints: [
      'If one pointer starts n steps ahead of another, where is the second pointer when the first reaches the end?',
      'Start both pointers at a dummy node before the head, move the fast one n+1 steps, then move both until fast is None.',
      'dummy.next = head; fast = slow = dummy; advance fast n+1 times; while fast: both step; slow.next = slow.next.next; return dummy.next.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def remove_nth_from_end(head, n):
    dummy = ListNode(0, head)
    fast = slow = dummy
    for _ in range(n + 1):
        fast = fast.next
    while fast:
        fast = fast.next
        slow = slow.next
    slow.next = slow.next.next
    return dummy.next
`,
  },

  // ── Recursion and Backtracking ────────────────────────────────────────────
  {
    slug: 'subsets',
    title: 'All Subsets',
    pattern: 'recursion_backtracking',
    difficulty: 'medium',
    statement:
      'Given a list of distinct integers, return every possible subset (including the empty one). Subsets and their values may be in any order.',
    constraints: ['0 <= len(nums) <= 10'],
    functionName: 'subsets',
    params: [{ name: 'nums', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'nested_unordered',
    examples: [[[1, 2, 3]], [[0]]],
    tests: [[[]], [[5, -5]], [[1, 2, 3, 4]]],
    hints: [
      'For each number there are exactly two choices. What are they?',
      'Recurse over the index: once include nums[i] and recurse, once skip it and recurse; record the subset when you pass the end.',
      'def go(i, cur): if i == n: out.append(cur[:]); return; cur.append(nums[i]); go(i+1, cur); cur.pop(); go(i+1, cur).',
    ],
    complexity: 'O(n * 2^n) time',
    solution: `
def subsets(nums):
    out = []
    cur = []
    def go(i):
        if i == len(nums):
            out.append(cur[:])
            return
        cur.append(nums[i])
        go(i + 1)
        cur.pop()
        go(i + 1)
    go(0)
    return out
`,
  },
  {
    slug: 'permutations',
    title: 'All Orderings',
    pattern: 'recursion_backtracking',
    difficulty: 'medium',
    statement:
      'Given a list of distinct integers, return every possible ordering of them. The orderings may be listed in any order, but each ordering itself must be exact.',
    constraints: ['1 <= len(nums) <= 7'],
    functionName: 'permute',
    params: [{ name: 'nums', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'unordered',
    examples: [[[1, 2, 3]], [[0, 1]]],
    tests: [[[1]], [[4, 5, 6, 7]]],
    hints: [
      'Choose the first element, then arrange the rest. How do you avoid using a value twice?',
      'Backtrack with a list being built and a record of which values are used; undo each choice after recursing.',
      'def go(cur): if len(cur) == n: out.append(cur[:]); for x in nums: if x not used: mark, cur.append(x), go(cur), cur.pop(), unmark.',
    ],
    complexity: 'O(n * n!) time',
    solution: `
def permute(nums):
    out = []
    cur = []
    used = [False] * len(nums)
    def go():
        if len(cur) == len(nums):
            out.append(cur[:])
            return
        for i, x in enumerate(nums):
            if not used[i]:
                used[i] = True
                cur.append(x)
                go()
                cur.pop()
                used[i] = False
    go()
    return out
`,
  },
  {
    slug: 'generate-parentheses',
    title: 'Generate Balanced Brackets',
    pattern: 'recursion_backtracking',
    difficulty: 'medium',
    statement:
      'Return every string of `n` pairs of round brackets that is balanced, in any order.',
    constraints: ['1 <= n <= 8'],
    functionName: 'generate_parenthesis',
    params: [{ name: 'n', type: 'int' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'unordered',
    examples: [[3], [1]],
    tests: [[2], [4]],
    hints: [
      'While building a string left to right, when is adding "(" allowed, and when is ")" allowed?',
      'Track how many opening and closing brackets are used: "(" while opened < n, ")" while closed < opened.',
      'def go(s, opened, closed): if len(s) == 2n: out.append(s); if opened < n: go(s+"(", opened+1, closed); if closed < opened: go(s+")", opened, closed+1).',
    ],
    complexity: 'O(4^n / sqrt(n)) results',
    solution: `
def generate_parenthesis(n):
    out = []
    def go(s, opened, closed):
        if len(s) == 2 * n:
            out.append(s)
            return
        if opened < n:
            go(s + '(', opened + 1, closed)
        if closed < opened:
            go(s + ')', opened, closed + 1)
    go('', 0, 0)
    return out
`,
  },

  // ── Trees ─────────────────────────────────────────────────────────────────
  {
    slug: 'max-depth-binary-tree',
    title: 'Depth of a Binary Tree',
    pattern: 'trees',
    difficulty: 'easy',
    statement:
      'Given the `root` of a binary tree (`TreeNode` with `.val`, `.left`, `.right`), return the number of nodes on the longest path from the root down to a leaf. Tests write trees in level order, e.g. `[3,9,20,None,None,15,7]`.',
    constraints: ['0 <= nodes <= 10000'],
    functionName: 'max_depth',
    params: [{ name: 'root', type: 'TreeNode' }],
    argKinds: ['tree'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[3, 9, 20, null, null, 15, 7]], [[1, null, 2]]],
    tests: [[[]], [[0]], [[1, 2, 3, 4, null, null, 5, 6]]],
    hints: [
      'If you knew the depth of the left and right subtrees, what is the depth of the whole tree?',
      'Recurse: an empty tree has depth 0; otherwise 1 + the larger child depth.',
      'def max_depth(root): return 0 if root is None else 1 + max(max_depth(root.left), max_depth(root.right)).',
    ],
    complexity: 'O(n) time, O(h) space',
    solution: `
def max_depth(root):
    if root is None:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))
`,
  },
  {
    slug: 'invert-binary-tree',
    title: 'Mirror a Binary Tree',
    pattern: 'trees',
    difficulty: 'easy',
    statement: 'Swap the left and right child of every node in the tree and return the root.',
    constraints: ['0 <= nodes <= 10000'],
    functionName: 'invert_tree',
    params: [{ name: 'root', type: 'TreeNode' }],
    argKinds: ['tree'],
    returnKind: 'tree',
    compare: 'exact',
    examples: [[[4, 2, 7, 1, 3, 6, 9]], [[2, 1, 3]]],
    tests: [[[]], [[1]], [[1, 2]], [[1, null, 2, null, 3]]],
    hints: [
      'Mirroring a tree means mirroring both subtrees and then doing what at the root?',
      'Recursively invert the left and right subtrees and assign them to the opposite sides.',
      'if root: root.left, root.right = invert_tree(root.right), invert_tree(root.left); return root.',
    ],
    complexity: 'O(n) time, O(h) space',
    solution: `
def invert_tree(root):
    if root:
        root.left, root.right = invert_tree(root.right), invert_tree(root.left)
    return root
`,
  },
  {
    slug: 'level-order-traversal',
    title: 'Level by Level',
    pattern: 'trees',
    difficulty: 'medium',
    statement: 'Return the values of the tree level by level, from top to bottom and left to right within a level.',
    constraints: ['0 <= nodes <= 2000'],
    functionName: 'level_order',
    params: [{ name: 'root', type: 'TreeNode' }],
    argKinds: ['tree'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[3, 9, 20, null, null, 15, 7]], [[1]]],
    tests: [[[]], [[1, 2, 3, 4, 5, 6, 7]], [[1, 2, null, 3, null, 4]]],
    hints: [
      'Which data structure visits nodes in the order they were discovered?',
      'Use a queue. Process the tree one level at a time by taking exactly the current queue length each round.',
      'q = deque([root]); while q: level = []; for _ in range(len(q)): node = q.popleft(); level.append(node.val); queue its children; out.append(level).',
    ],
    complexity: 'O(n) time, O(n) space',
    solution: `
from collections import deque
def level_order(root):
    if root is None:
        return []
    out = []
    q = deque([root])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        out.append(level)
    return out
`,
  },

  // ── Heaps ─────────────────────────────────────────────────────────────────
  {
    slug: 'kth-largest-element',
    title: 'K-th Largest Element',
    pattern: 'heaps',
    difficulty: 'medium',
    statement: 'Return the `k`-th largest value in `nums` (by sorted position, so repeats count separately).',
    constraints: ['1 <= k <= len(nums) <= 100000'],
    functionName: 'find_kth_largest',
    params: [{ name: 'nums', type: 'list[int]' }, { name: 'k', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[3, 2, 1, 5, 6, 4], 2], [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4]],
    tests: [[[1], 1], [[2, 1], 2], [[7, 7, 7], 2], [[-1, -5, 10, 3], 1]],
    perf: [[randomInts(81, 20000, -1000000, 1000000), 900]],
    hints: [
      'Do you need the whole list sorted, or only the k largest values?',
      'Keep a min-heap of size k: push each value and pop the smallest when it grows past k. Its top is the answer.',
      'heap = []; for x in nums: heappush(heap, x); if len(heap) > k: heappop(heap); return heap[0].',
    ],
    complexity: 'O(n log k) time, O(k) space',
    solution: `
import heapq
def find_kth_largest(nums, k):
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)
    return heap[0]
`,
  },
  {
    slug: 'top-k-frequent',
    title: 'K Most Frequent Values',
    pattern: 'heaps',
    difficulty: 'medium',
    statement:
      'Return the `k` values that appear most often in `nums`, in any order. The answer is unique (no ties at the cut-off).',
    constraints: ['1 <= k <= number of distinct values'],
    functionName: 'top_k_frequent',
    params: [{ name: 'nums', type: 'list[int]' }, { name: 'k', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'unordered',
    examples: [[[1, 1, 1, 2, 2, 3], 2], [[1], 1]],
    tests: [[[4, 4, 4, 5, 5, 6, 6, 6, 6], 1], [[-1, -1, 2, 2, 2, 3], 2], [[9, 8, 8, 7, 7, 7], 3]],
    hints: [
      'First find out how often each value occurs.',
      'Count with a dictionary, then take the k entries with the highest counts using a heap (or sort the counts).',
      'count = Counter(nums); return [x for x, _ in heapq.nlargest(k, count.items(), key=lambda kv: kv[1])].',
    ],
    complexity: 'O(n log k) time',
    solution: `
import heapq
from collections import Counter
def top_k_frequent(nums, k):
    count = Counter(nums)
    return [x for x, _ in heapq.nlargest(k, count.items(), key=lambda kv: kv[1])]
`,
  },
  {
    slug: 'k-closest-points',
    title: 'K Closest Points to the Origin',
    pattern: 'heaps',
    difficulty: 'medium',
    statement:
      'Each point is `[x, y]`. Return the `k` points closest to `(0, 0)` by straight-line distance, in any order. The answer is unique.',
    constraints: ['1 <= k <= len(points) <= 10000'],
    functionName: 'k_closest',
    params: [{ name: 'points', type: 'list[list[int]]' }, { name: 'k', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'unordered',
    examples: [[[[1, 3], [-2, 2]], 1], [[[3, 3], [5, -1], [-2, 4]], 2]],
    tests: [[[[0, 1]], 1], [[[1, 0], [0, 2], [3, 3]], 2], [[[-5, -5], [1, 1], [2, 2]], 1]],
    hints: [
      'Comparing distances does not need a square root. Why?',
      'Use x*x + y*y as the distance key and keep the k smallest with a heap (or sort by the key).',
      'return heapq.nsmallest(k, points, key=lambda p: p[0]*p[0] + p[1]*p[1]).',
    ],
    complexity: 'O(n log k) time',
    solution: `
import heapq
def k_closest(points, k):
    return heapq.nsmallest(k, points, key=lambda p: p[0] * p[0] + p[1] * p[1])
`,
  },

  // ── Graphs ────────────────────────────────────────────────────────────────
  {
    slug: 'number-of-islands',
    title: 'Count the Islands',
    pattern: 'graphs',
    difficulty: 'medium',
    statement:
      '`grid` is a list of rows of "1" (land) and "0" (water). Land cells connect up, down, left and right. Return how many separate islands there are.',
    constraints: ['1 <= rows, cols <= 300'],
    functionName: 'num_islands',
    params: [{ name: 'grid', type: 'list[list[str]]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [
      [[['1', '1', '0', '0'], ['1', '1', '0', '0'], ['0', '0', '1', '0'], ['0', '0', '0', '1']]],
      [[['1', '1', '1'], ['0', '1', '0'], ['1', '1', '1']]],
    ],
    tests: [[[['0']]], [[['1']]], [[['1', '0', '1', '0', '1']]], [[['1'], ['0'], ['1']]]],
    hints: [
      'When you find an unvisited land cell, how can you make sure you never count the rest of its island again?',
      'Each time you find new land, add 1 and flood out from it (BFS or DFS) marking all connected land as visited.',
      'for each cell: if grid[r][c] == "1": count += 1; BFS from it, setting visited land to "0".',
    ],
    complexity: 'O(rows * cols) time',
    solution: `
from collections import deque
def num_islands(grid):
    rows, cols = len(grid), len(grid[0])
    seen = set()
    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1' and (r, c) not in seen:
                count += 1
                seen.add((r, c))
                q = deque([(r, c)])
                while q:
                    y, x = q.popleft()
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= ny < rows and 0 <= nx < cols and grid[ny][nx] == '1' and (ny, nx) not in seen:
                            seen.add((ny, nx))
                            q.append((ny, nx))
    return count
`,
  },
  {
    slug: 'course-schedule',
    title: 'Can All Courses Be Finished?',
    pattern: 'graphs',
    difficulty: 'medium',
    statement:
      'There are `num_courses` courses numbered from 0. Each pair `[a, b]` in `prerequisites` means course `b` must be finished before course `a`. Return `True` if all courses can be finished.',
    constraints: ['1 <= num_courses <= 2000'],
    functionName: 'can_finish',
    params: [{ name: 'num_courses', type: 'int' }, { name: 'prerequisites', type: 'list[list[int]]' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[2, [[1, 0]]], [2, [[1, 0], [0, 1]]]],
    tests: [[1, []], [3, [[1, 0], [2, 1]]], [3, [[0, 1], [1, 2], [2, 0]]], [4, [[1, 0], [2, 0], [3, 1], [3, 2]]], [2, [[0, 0]]]],
    hints: [
      'When is it impossible to finish everything? Think about following "must come before" arrows.',
      'Count incoming prerequisites for each course. Repeatedly take courses with none left (a queue), and see whether every course gets taken.',
      'indeg and adjacency from pairs; q = courses with indeg 0; pop, count, decrement neighbours and enqueue new zeros; return count == num_courses.',
    ],
    complexity: 'O(V + E) time',
    solution: `
from collections import deque
def can_finish(num_courses, prerequisites):
    adj = [[] for _ in range(num_courses)]
    indeg = [0] * num_courses
    for a, b in prerequisites:
        adj[b].append(a)
        indeg[a] += 1
    q = deque(i for i in range(num_courses) if indeg[i] == 0)
    done = 0
    while q:
        node = q.popleft()
        done += 1
        for nxt in adj[node]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                q.append(nxt)
    return done == num_courses
`,
  },
  {
    slug: 'rotting-oranges',
    title: 'Spreading Rot',
    pattern: 'graphs',
    difficulty: 'medium',
    statement:
      'In `grid`, 0 is empty, 1 is a fresh orange and 2 a rotten one. Every minute, fresh oranges next to a rotten one (up, down, left, right) rot. Return the minutes until no fresh orange is left, or -1 if some never rot.',
    constraints: ['1 <= rows, cols <= 50'],
    functionName: 'oranges_rotting',
    params: [{ name: 'grid', type: 'list[list[int]]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[[2, 1, 1], [1, 1, 0], [0, 1, 1]]], [[[2, 1, 1], [0, 1, 1], [1, 0, 1]]]],
    tests: [[[[0, 2]]], [[[0]]], [[[1]]], [[[2, 2], [1, 1]]], [[[2, 0, 1]]]],
    hints: [
      'All rotten oranges spread at the same time. Which search explores outward in rounds?',
      'Put every rotten orange in a queue at the start and run BFS level by level; each level is one minute.',
      'queue all 2s, count fresh; minutes = 0; while q and fresh: for each in current level: rot fresh neighbours, fresh -= 1; minutes += 1; return minutes if fresh == 0 else -1.',
    ],
    complexity: 'O(rows * cols) time',
    solution: `
from collections import deque
def oranges_rotting(grid):
    rows, cols = len(grid), len(grid[0])
    grid = [row[:] for row in grid]
    q = deque()
    fresh = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                q.append((r, c))
            elif grid[r][c] == 1:
                fresh += 1
    minutes = 0
    while q and fresh:
        for _ in range(len(q)):
            y, x = q.popleft()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < rows and 0 <= nx < cols and grid[ny][nx] == 1:
                    grid[ny][nx] = 2
                    fresh -= 1
                    q.append((ny, nx))
        minutes += 1
    return minutes if fresh == 0 else -1
`,
  },

  // ── Greedy ────────────────────────────────────────────────────────────────
  {
    slug: 'maximum-subarray',
    title: 'Maximum Sum Subarray',
    pattern: 'greedy',
    difficulty: 'medium',
    statement: 'Return the largest sum of any non-empty contiguous part of `nums`.',
    constraints: ['1 <= len(nums) <= 100000'],
    functionName: 'max_subarray',
    params: [{ name: 'nums', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[-2, 1, -3, 4, -1, 2, 1, -5, 4]], [[5, 4, -1, 7, 8]]],
    tests: [[[-1]], [[-3, -2, -5]], [[1]], [[0, -1, 0]], [[8, -19, 5, -4, 20]]],
    perf: [[randomInts(91, 30000, -1000, 1000)]],
    hints: [
      'When does it make sense to drop the running sum and start fresh?',
      'Walk the list keeping the best sum of a subarray ending here: either extend the previous one or start at this element.',
      'cur = best = nums[0]; for x in nums[1:]: cur = max(x, cur + x); best = max(best, cur).',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def max_subarray(nums):
    cur = best = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    return best
`,
  },
  {
    slug: 'jump-game',
    title: 'Jump Game',
    pattern: 'greedy',
    difficulty: 'medium',
    statement:
      'You start at index 0. `nums[i]` is the furthest you may jump forward from index `i`. Return `True` if you can reach the last index.',
    constraints: ['1 <= len(nums) <= 100000'],
    functionName: 'can_jump',
    params: [{ name: 'nums', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[2, 3, 1, 1, 4]], [[3, 2, 1, 0, 4]]],
    tests: [[[0]], [[1, 0]], [[0, 1]], [[2, 0, 0]], [[1, 1, 0, 1]]],
    perf: [[[...Array(30000).fill(1), 0]]],
    hints: [
      'Instead of trying every jump, what single number about the positions you can reach is enough?',
      'Track the furthest index reachable so far. If you ever stand beyond it, you are stuck.',
      'reach = 0; for i, x in enumerate(nums): if i > reach: return False; reach = max(reach, i + x); return True.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def can_jump(nums):
    reach = 0
    for i, x in enumerate(nums):
        if i > reach:
            return False
        reach = max(reach, i + x)
    return True
`,
  },
  {
    slug: 'gas-station',
    title: 'Fuel Stops on a Loop',
    pattern: 'greedy',
    difficulty: 'medium',
    statement:
      'Stations sit on a circular road. At station `i` you can fill `gas[i]`, and driving to station `i+1` costs `cost[i]`. Starting with an empty tank, return the index of the station from which you can drive all the way around once, or -1. The answer is unique if it exists.',
    constraints: ['1 <= len(gas) <= 100000'],
    functionName: 'can_complete_circuit',
    params: [{ name: 'gas', type: 'list[int]' }, { name: 'cost', type: 'list[int]' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[1, 2, 3, 4, 5], [3, 4, 5, 1, 2]], [[2, 3, 4], [3, 4, 3]]],
    tests: [[[5], [4]], [[1], [2]], [[3, 1, 1], [1, 2, 2]], [[4, 5, 2, 6, 5, 3], [3, 2, 7, 3, 2, 9]]],
    hints: [
      'If total gas is less than total cost, no start works. Otherwise, how do you find the start?',
      'Drive from a candidate start; if the tank goes negative at station i, no station up to i can be the start, so try i + 1.',
      'if sum(gas) < sum(cost): return -1; tank = start = 0; for i: tank += gas[i] - cost[i]; if tank < 0: start = i + 1; tank = 0; return start.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def can_complete_circuit(gas, cost):
    if sum(gas) < sum(cost):
        return -1
    tank = start = 0
    for i in range(len(gas)):
        tank += gas[i] - cost[i]
        if tank < 0:
            start = i + 1
            tank = 0
    return start
`,
  },

  // ── Intervals ─────────────────────────────────────────────────────────────
  {
    slug: 'merge-intervals',
    title: 'Merge Overlapping Intervals',
    pattern: 'intervals',
    difficulty: 'medium',
    statement:
      'Merge all overlapping intervals `[start, end]` and return the result sorted by start. Intervals that only touch (`[1,4]` and `[4,5]`) also merge.',
    constraints: ['1 <= len(intervals) <= 10000'],
    functionName: 'merge',
    params: [{ name: 'intervals', type: 'list[list[int]]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[[1, 3], [2, 6], [8, 10], [15, 18]]], [[[1, 4], [4, 5]]]],
    tests: [[[[1, 4]]], [[[5, 6], [1, 2]]], [[[1, 10], [2, 3], [4, 5]]], [[[2, 3], [4, 5], [6, 7], [1, 10]]]],
    hints: [
      'If the intervals were sorted by start, where could an overlap with the current interval come from?',
      'Sort by start. Keep a result list; extend the last interval when the next one starts inside it, otherwise start a new one.',
      'sort; out = []; for s, e in intervals: if out and s <= out[-1][1]: out[-1][1] = max(out[-1][1], e) else out.append([s, e]).',
    ],
    complexity: 'O(n log n) time',
    solution: `
def merge(intervals):
    out = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out
`,
  },
  {
    slug: 'insert-interval',
    title: 'Insert an Interval',
    pattern: 'intervals',
    difficulty: 'medium',
    statement:
      '`intervals` is sorted by start and has no overlaps. Insert `new` into it, merging where needed, and return the sorted list without overlaps.',
    constraints: ['0 <= len(intervals) <= 10000'],
    functionName: 'insert',
    params: [{ name: 'intervals', type: 'list[list[int]]' }, { name: 'new', type: 'list[int]' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[[1, 3], [6, 9]], [2, 5]], [[[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], [4, 8]]],
    tests: [[[], [5, 7]], [[[1, 5]], [6, 8]], [[[3, 5]], [1, 2]], [[[1, 5]], [0, 0]], [[[1, 5]], [2, 3]]],
    hints: [
      'The existing intervals fall into three groups relative to the new one. What are they?',
      'Copy intervals that end before the new start; merge every interval that overlaps into the new one; copy the rest.',
      'i = 0; while ends before: append; while starts <= new end: new = [min starts, max ends]; append new; append the remainder.',
    ],
    complexity: 'O(n) time',
    solution: `
def insert(intervals, new):
    out = []
    i = 0
    s, e = new
    while i < len(intervals) and intervals[i][1] < s:
        out.append(intervals[i])
        i += 1
    while i < len(intervals) and intervals[i][0] <= e:
        s = min(s, intervals[i][0])
        e = max(e, intervals[i][1])
        i += 1
    out.append([s, e])
    out.extend(intervals[i:])
    return out
`,
  },
  {
    slug: 'non-overlapping-intervals',
    title: 'Fewest Removals for No Overlap',
    pattern: 'intervals',
    difficulty: 'medium',
    statement:
      'Return the smallest number of intervals to remove so that the rest do not overlap. Intervals that only touch (`[1,2]` and `[2,3]`) do not overlap.',
    constraints: ['1 <= len(intervals) <= 100000'],
    functionName: 'erase_overlap_intervals',
    params: [{ name: 'intervals', type: 'list[list[int]]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[[1, 2], [2, 3], [3, 4], [1, 3]]], [[[1, 2], [1, 2], [1, 2]]]],
    tests: [[[[1, 2], [2, 3]]], [[[1, 100], [11, 22], [1, 11], [2, 12]]], [[[0, 2], [1, 3], [2, 4], [3, 5], [4, 6]]]],
    hints: [
      'To keep as many intervals as possible, which interval should you keep first?',
      'Sort by end time and greedily keep each interval that starts at or after the end of the last kept one.',
      'sort by end; end = -inf; kept = 0; for s, e: if s >= end: kept += 1; end = e; return len(intervals) - kept.',
    ],
    complexity: 'O(n log n) time',
    solution: `
def erase_overlap_intervals(intervals):
    end = float('-inf')
    kept = 0
    for s, e in sorted(intervals, key=lambda x: x[1]):
        if s >= end:
            kept += 1
            end = e
    return len(intervals) - kept
`,
  },

  // ── 1-D Dynamic Programming ───────────────────────────────────────────────
  {
    slug: 'climbing-stairs',
    title: 'Climbing Stairs',
    pattern: 'dp_1d',
    difficulty: 'easy',
    statement: 'You climb a staircase of `n` steps, 1 or 2 steps at a time. Return how many different ways reach the top.',
    constraints: ['1 <= n <= 45'],
    functionName: 'climb_stairs',
    params: [{ name: 'n', type: 'int' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[2], [3]],
    tests: [[1], [5], [10], [45]],
    hints: [
      'The last move onto step n came either from step n-1 or from step n-2.',
      'ways(n) = ways(n-1) + ways(n-2). Build it up from the bottom instead of recursing repeatedly.',
      'a, b = 1, 1; repeat n-1 times: a, b = b, a + b; return b.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def climb_stairs(n):
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b
`,
  },
  {
    slug: 'house-robber',
    title: 'Non-Adjacent Maximum',
    pattern: 'dp_1d',
    difficulty: 'medium',
    statement:
      'Each house on a street holds `nums[i]` money. You may not take from two houses next to each other. Return the most money you can take.',
    constraints: ['1 <= len(nums) <= 100000', '0 <= nums[i] <= 400'],
    functionName: 'rob',
    params: [{ name: 'nums', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[1, 2, 3, 1]], [[2, 7, 9, 3, 1]]],
    tests: [[[5]], [[2, 1]], [[0, 0, 0]], [[2, 1, 1, 2]], [[10, 1, 1, 10, 1]]],
    perf: [[randomInts(101, 8000, 0, 400)]],
    hints: [
      'At house i, you either take it or skip it. What does each choice allow for house i-1?',
      'best(i) = max(best(i-1), best(i-2) + nums[i]). Only the last two values are needed.',
      'prev, cur = 0, 0; for x in nums: prev, cur = cur, max(cur, prev + x); return cur.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def rob(nums):
    prev, cur = 0, 0
    for x in nums:
        prev, cur = cur, max(cur, prev + x)
    return cur
`,
  },
  {
    slug: 'coin-change',
    title: 'Fewest Coins',
    pattern: 'dp_1d',
    difficulty: 'medium',
    statement:
      'Return the fewest coins (unlimited supply of each value in `coins`) that add up to `amount`, or -1 if it cannot be done. An amount of 0 needs 0 coins.',
    constraints: ['1 <= len(coins) <= 12', '0 <= amount <= 10000'],
    functionName: 'coin_change',
    params: [{ name: 'coins', type: 'list[int]' }, { name: 'amount', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[1, 2, 5], 11], [[2], 3]],
    tests: [[[1], 0], [[3, 7], 5], [[1, 3, 4], 6], [[186, 419, 83, 408], 6249]],
    perf: [[[7, 11, 13, 17, 19, 23, 29, 31, 37, 41], 10000]],
    hints: [
      'Greedy (largest coin first) fails for some coin sets. What smaller question would answer this one?',
      'Let best[a] be the fewest coins for amount a. Fill it for a = 1..amount from best[a - coin] + 1.',
      'best = [0] + [inf]*amount; for a in 1..amount: for c in coins: if c <= a: best[a] = min(best[a], best[a-c] + 1); return -1 if inf.',
    ],
    complexity: 'O(amount * coins) time',
    solution: `
def coin_change(coins, amount):
    INF = float('inf')
    best = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and best[a - c] + 1 < best[a]:
                best[a] = best[a - c] + 1
    return -1 if best[amount] == INF else best[amount]
`,
  },

  // ── 2-D Dynamic Programming ───────────────────────────────────────────────
  {
    slug: 'unique-paths',
    title: 'Grid Paths',
    pattern: 'dp_2d',
    difficulty: 'medium',
    statement:
      'A robot starts at the top-left of an `m` by `n` grid and moves only right or down. Return how many different paths reach the bottom-right corner.',
    constraints: ['1 <= m, n <= 100'],
    functionName: 'unique_paths',
    params: [{ name: 'm', type: 'int' }, { name: 'n', type: 'int' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[3, 7], [3, 2]],
    tests: [[1, 1], [1, 10], [10, 10], [23, 12]],
    hints: [
      'How many ways reach a cell, if you know the counts for the cell above and the cell to the left?',
      'paths[r][c] = paths[r-1][c] + paths[r][c-1], with 1 along the first row and column. One row of memory is enough.',
      'row = [1]*n; repeat m-1 times: for c in 1..n-1: row[c] += row[c-1]; return row[-1].',
    ],
    complexity: 'O(m * n) time, O(n) space',
    solution: `
def unique_paths(m, n):
    row = [1] * n
    for _ in range(m - 1):
        for c in range(1, n):
            row[c] += row[c - 1]
    return row[-1]
`,
  },
  {
    slug: 'longest-common-subsequence',
    title: 'Longest Common Subsequence',
    pattern: 'dp_2d',
    difficulty: 'medium',
    statement:
      'Return the length of the longest sequence of characters that appears in both `a` and `b` in the same order (not necessarily next to each other).',
    constraints: ['1 <= len(a), len(b) <= 1000'],
    functionName: 'longest_common_subsequence',
    params: [{ name: 'a', type: 'str' }, { name: 'b', type: 'str' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [['abcde', 'ace'], ['abc', 'def']],
    tests: [['a', 'a'], ['abc', 'abc'], ['bsbininm', 'jmjkbkjkv'], ['oxcpqrsvwf', 'shmtulqrypy']],
    perf: [[randomString(111, 900, 'abcd'), randomString(112, 900, 'abcd')]],
    hints: [
      'Compare the last characters of the two strings. What happens when they match, and when they do not?',
      'dp[i][j] = dp[i-1][j-1] + 1 if a[i-1] == b[j-1], else max(dp[i-1][j], dp[i][j-1]).',
      'build a (len(a)+1) x (len(b)+1) table of zeros, fill row by row with the rule above, return dp[-1][-1].',
    ],
    complexity: 'O(n * m) time',
    solution: `
def longest_common_subsequence(a, b):
    prev = [0] * (len(b) + 1)
    for ca in a:
        cur = [0] * (len(b) + 1)
        for j, cb in enumerate(b, 1):
            cur[j] = prev[j - 1] + 1 if ca == cb else max(prev[j], cur[j - 1])
        prev = cur
    return prev[-1]
`,
  },
  {
    slug: 'edit-distance',
    title: 'Edit Distance',
    pattern: 'dp_2d',
    difficulty: 'hard',
    statement:
      'Return the fewest single-character edits (insert, delete or replace) that turn word `a` into word `b`.',
    constraints: ['0 <= len(a), len(b) <= 500'],
    functionName: 'min_distance',
    params: [{ name: 'a', type: 'str' }, { name: 'b', type: 'str' }],
    argKinds: ['plain', 'plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [['horse', 'ros'], ['intention', 'execution']],
    tests: [['', ''], ['', 'abc'], ['abc', ''], ['same', 'same'], ['kitten', 'sitting']],
    perf: [[randomString(121, 480, 'abc'), randomString(122, 480, 'abc')]],
    hints: [
      'Turning a[:i] into b[:j]: what are the three possible last operations?',
      'dp[i][j] = dp[i-1][j-1] if the last letters match, else 1 + min(delete dp[i-1][j], insert dp[i][j-1], replace dp[i-1][j-1]).',
      'first row = 0..len(b), first column = 0..len(a); fill with the rule above; return dp[len(a)][len(b)].',
    ],
    complexity: 'O(n * m) time',
    solution: `
def min_distance(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            if ca == cb:
                cur[j] = prev[j - 1]
            else:
                cur[j] = 1 + min(prev[j], cur[j - 1], prev[j - 1])
        prev = cur
    return prev[-1]
`,
  },

  // ── Bit Manipulation ──────────────────────────────────────────────────────
  {
    slug: 'single-number',
    title: 'The Unpaired Number',
    pattern: 'bit_manipulation',
    difficulty: 'easy',
    statement:
      'Every value in `nums` appears exactly twice except one, which appears once. Return that one, using O(1) extra space.',
    constraints: ['1 <= len(nums) <= 30000'],
    functionName: 'single_number',
    params: [{ name: 'nums', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[2, 2, 1]], [[4, 1, 2, 1, 2]]],
    tests: [[[1]], [[-3, 5, 5]], [[0, 7, 7, 9, 9]]],
    hints: [
      'What is x XOR x? And x XOR 0?',
      'XOR all the numbers together: pairs cancel out, the single one remains.',
      'result = 0; for x in nums: result ^= x; return result.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def single_number(nums):
    result = 0
    for x in nums:
        result ^= x
    return result
`,
  },
  {
    slug: 'count-bits',
    title: 'Count the 1 Bits up to n',
    pattern: 'bit_manipulation',
    difficulty: 'easy',
    statement: 'Return a list where position `i` (for every `i` from 0 to `n`) holds the number of 1 bits in `i` written in binary.',
    constraints: ['0 <= n <= 100000'],
    functionName: 'count_bits',
    params: [{ name: 'n', type: 'int' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[2], [5]],
    tests: [[0], [1], [16]],
    hints: [
      'How does the bit count of i relate to the bit count of i shifted right by one?',
      'bits[i] = bits[i >> 1] + (i & 1).',
      'bits = [0]*(n+1); for i in 1..n: bits[i] = bits[i >> 1] + (i & 1); return bits.',
    ],
    complexity: 'O(n) time',
    solution: `
def count_bits(n):
    bits = [0] * (n + 1)
    for i in range(1, n + 1):
        bits[i] = bits[i >> 1] + (i & 1)
    return bits
`,
  },
  {
    slug: 'missing-number',
    title: 'The Missing Number',
    pattern: 'bit_manipulation',
    difficulty: 'easy',
    statement:
      '`nums` holds `n` distinct values from the range 0 to `n` with exactly one value missing. Return the missing value using O(1) extra space.',
    constraints: ['1 <= n <= 100000'],
    functionName: 'missing_number',
    params: [{ name: 'nums', type: 'list[int]' }],
    argKinds: ['plain'],
    returnKind: 'plain',
    compare: 'exact',
    examples: [[[3, 0, 1]], [[9, 6, 4, 2, 3, 5, 7, 0, 1]]],
    tests: [[[0]], [[1]], [[0, 1]], [[1, 2]]],
    hints: [
      'XOR every index 0..n with every value. What survives?',
      'Start with n, then XOR in each index i and each value nums[i]; matching pairs cancel.',
      'result = len(nums); for i, x in enumerate(nums): result ^= i ^ x; return result.',
    ],
    complexity: 'O(n) time, O(1) space',
    solution: `
def missing_number(nums):
    result = len(nums)
    for i, x in enumerate(nums):
        result ^= i ^ x
    return result
`,
  },
];

module.exports = { PROBLEMS };
