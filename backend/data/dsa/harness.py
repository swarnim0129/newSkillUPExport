"""Test runner for practice problems.

The same file runs in two places:
  - in the student's browser, inside Pyodide, to check their code;
  - in scripts/buildDsaBank.js, to compute expected answers from the
    reference solutions, so every expected value is produced by real code.

Inputs and outputs travel as JSON. Linked lists and trees are written as
plain lists (a tree in level order, with None for missing children).
"""
import io
import json
import sys
import time
from collections import deque

MAX_OUTPUT_CHARS = 4000


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

    def __repr__(self):
        return f"ListNode({self.val})"


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        return f"TreeNode({self.val})"


def _build_list(values):
    head = None
    for value in reversed(values or []):
        head = ListNode(value, head)
    return head


def _list_values(node, limit=200000):
    out = []
    seen = 0
    while node is not None and seen < limit:
        out.append(node.val)
        node = node.next
        seen += 1
    return out


def _build_tree(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root


def _tree_values(root):
    if root is None:
        return []
    out = []
    queue = deque([root])
    while queue:
        node = queue.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        queue.append(node.left)
        queue.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out


def _to_input(value, kind):
    if kind == "list_node":
        return _build_list(value)
    if kind == "tree":
        return _build_tree(value)
    return value


def _to_output(value, kind):
    if kind == "list_node":
        return _list_values(value)
    if kind == "tree":
        return _tree_values(value)
    if isinstance(value, (tuple, set, frozenset)):
        value = list(value)
    if isinstance(value, list):
        return [_to_output(item, "plain") for item in value]
    return value


def _sort_key(value):
    return json.dumps(value, sort_keys=True)


def _canonical(value, compare):
    if compare == "unordered" and isinstance(value, list):
        return sorted(value, key=_sort_key)
    if compare == "nested_unordered" and isinstance(value, list):
        inner = [sorted(v, key=_sort_key) if isinstance(v, list) else v for v in value]
        return sorted(inner, key=_sort_key)
    return value


def _same(actual, expected, compare):
    if compare == "float":
        try:
            return abs(float(actual) - float(expected)) <= 1e-5
        except (TypeError, ValueError):
            return False
    # bool is a subclass of int in Python; 1 must not pass for True
    if isinstance(expected, bool) != isinstance(actual, bool):
        return False
    return _canonical(actual, compare) == _canonical(expected, compare)


def _as_json(value):
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return repr(value)[:500]


def run_tests(namespace, spec_json, cases_json, report=None):
    """Call the student's function on every case. Returns a JSON string.

    `report(i)` is called before case i, so the browser knows which case was
    running if the code never finishes.
    """
    spec = json.loads(spec_json)
    cases = json.loads(cases_json)
    fn = namespace.get(spec["functionName"])
    if not callable(fn):
        return json.dumps({
            "error": f"Define a function named {spec['functionName']}.",
            "results": [],
            "stdout": "",
        })

    captured = io.StringIO()
    real_stdout = sys.stdout
    sys.stdout = captured
    results = []
    try:
        for index, case in enumerate(cases):
            if report is not None:
                report(index)
            args = [_to_input(json.loads(json.dumps(arg)), kind)
                    for arg, kind in zip(case["args"], spec["argKinds"])]
            started = time.perf_counter()
            try:
                actual = _to_output(fn(*args), spec["returnKind"])
                elapsed = (time.perf_counter() - started) * 1000
                results.append({
                    "passed": _same(actual, case.get("expected"), spec["compare"]),
                    "actual": _as_json(actual),
                    "ms": round(elapsed, 1),
                })
            except Exception as exc:  # the student's code raised
                elapsed = (time.perf_counter() - started) * 1000
                results.append({
                    "passed": False,
                    "error": f"{type(exc).__name__}: {exc}"[:500],
                    "ms": round(elapsed, 1),
                })
    finally:
        sys.stdout = real_stdout

    return json.dumps({"results": results, "stdout": captured.getvalue()[:MAX_OUTPUT_CHARS]})


def expected_outputs(solution_source, spec_json, cases_json):
    """Used by the build script: run the reference solution and return its outputs."""
    namespace = {"ListNode": ListNode, "TreeNode": TreeNode}
    exec(solution_source, namespace)
    spec = json.loads(spec_json)
    fn = namespace[spec["functionName"]]
    outputs = []
    for case in json.loads(cases_json):
        args = [_to_input(json.loads(json.dumps(arg)), kind)
                for arg, kind in zip(case["args"], spec["argKinds"])]
        outputs.append(_to_output(fn(*args), spec["returnKind"]))
    return json.dumps(outputs)
