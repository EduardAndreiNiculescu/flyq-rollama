"""Run: python -I finetune/test_batching.py   (no GPU, no dependencies)"""
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(__file__))
from batching import BatchScheduler  # noqa: E402


def concurrent_submit(sched, requests):
    out = [None] * len(requests)
    errs = [None] * len(requests)

    def go(i):
        try:
            out[i] = sched.submit(requests[i], timeout=10)
        except BaseException as e:
            errs[i] = e

    ts = [threading.Thread(target=go, args=(i,)) for i in range(len(requests))]
    [t.start() for t in ts]
    [t.join() for t in ts]
    return out, errs


def test_each_caller_gets_its_own_result():
    s = BatchScheduler(lambda rs: [r * 10 for r in rs], max_batch=4, max_wait_s=0.2)
    out, errs = concurrent_submit(s, list(range(8)))
    s.close()
    assert out == [i * 10 for i in range(8)] and not any(errs)


def test_concurrent_requests_are_batched():
    s = BatchScheduler(lambda rs: list(rs), max_batch=8, max_wait_s=0.3)
    concurrent_submit(s, list(range(8)))
    s.close()
    assert sum(s.batch_sizes) == 8
    assert len(s.batch_sizes) < 8, s.batch_sizes  # fewer model calls than requests


def test_max_batch_is_respected():
    s = BatchScheduler(lambda rs: list(rs), max_batch=3, max_wait_s=0.3)
    concurrent_submit(s, list(range(9)))
    s.close()
    assert max(s.batch_sizes) <= 3 and sum(s.batch_sizes) == 9


def test_incompatible_keys_are_never_mixed():
    seen = []

    def run(rs):
        seen.append(sorted(r["m"] for r in rs))
        return [r["m"] for r in rs]

    s = BatchScheduler(run, max_batch=8, max_wait_s=0.3, key=lambda r: r["m"])
    reqs = [{"m": "base"}, {"m": "adapter"}, {"m": "base"}, {"m": "adapter"}, {"m": "base"}]
    out, errs = concurrent_submit(s, reqs)
    s.close()
    assert not any(errs) and out == [r["m"] for r in reqs]
    assert all(len(set(b)) == 1 for b in seen), seen


def test_single_request_is_not_held_forever():
    s = BatchScheduler(lambda rs: list(rs), max_batch=8, max_wait_s=0.05)
    t = time.monotonic()
    assert s.submit("x", timeout=5) == "x"
    assert time.monotonic() - t < 1.0
    s.close()


def test_a_failed_batch_fails_only_its_requests_and_the_worker_survives():
    def run(rs):
        if any(r == "boom" for r in rs):
            raise ValueError("model exploded")
        return list(rs)

    s = BatchScheduler(run, max_batch=1, max_wait_s=0.01)
    try:
        s.submit("boom", timeout=5)
        raise AssertionError("expected an error")
    except ValueError as e:
        assert "exploded" in str(e)
    assert s.submit("ok", timeout=5) == "ok"
    s.close()


def test_wrong_result_count_is_an_error_not_a_hang():
    s = BatchScheduler(lambda rs: [], max_batch=2, max_wait_s=0.01)
    try:
        s.submit("x", timeout=5)
        raise AssertionError("expected an error")
    except RuntimeError as e:
        assert "results" in str(e)
    s.close()


def test_closed_scheduler_rejects_new_requests():
    s = BatchScheduler(lambda rs: list(rs))
    s.close()
    try:
        s.submit(1)
        raise AssertionError("expected an error")
    except RuntimeError:
        pass


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print("ok", t.__name__)
    print(f"{len(tests)} passed")
