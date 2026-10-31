"""Dynamic request batching for the evaluation server (pure Python, no torch: unit-testable).

Autoregressive decoding of a 4-bit 4B model is memory-bound, so generating 8 sequences in one
`generate()` call costs only a little more than generating 1. Callers submit requests from many
threads; a single worker thread groups compatible requests and runs them together.

    sched = BatchScheduler(run_batch, max_batch=8, max_wait_s=0.05, key=lambda r: (r["adapter"], r["tools"]))
    result = sched.submit(request)      # blocks until this request's result is ready

`run_batch(requests) -> results` must return one result per request, in order. Requests with
different `key` values are never mixed (e.g. base vs adapter, with or without tools).
"""
import threading
import time
from concurrent.futures import Future
from typing import Any, Callable, Hashable, List, Optional


class BatchScheduler:
    def __init__(
        self,
        run_batch: Callable[[List[Any]], List[Any]],
        max_batch: int = 8,
        max_wait_s: float = 0.05,
        key: Callable[[Any], Hashable] = lambda r: (),
    ):
        if max_batch < 1:
            raise ValueError("max_batch must be >= 1")
        self._run_batch = run_batch
        self._max_batch = max_batch
        self._max_wait = max_wait_s
        self._key = key
        self._pending: List[tuple] = []  # (request, future), arrival order
        self._cv = threading.Condition()
        self._closed = False
        self.batch_sizes: List[int] = []  # for tests and stats
        self._worker = threading.Thread(target=self._loop, name="batch-worker", daemon=True)
        self._worker.start()

    def submit(self, request: Any, timeout: Optional[float] = None) -> Any:
        fut: Future = Future()
        with self._cv:
            if self._closed:
                raise RuntimeError("scheduler is closed")
            self._pending.append((request, fut))
            self._cv.notify_all()
        return fut.result(timeout)

    def close(self) -> None:
        with self._cv:
            self._closed = True
            self._cv.notify_all()
        self._worker.join(timeout=5)

    def _take_batch(self) -> List[tuple]:
        """Oldest request defines the group; wait briefly for more of the same key, up to max_batch."""
        with self._cv:
            while not self._pending and not self._closed:
                self._cv.wait()
            if not self._pending:
                return []
            k = self._key(self._pending[0][0])
            deadline = time.monotonic() + self._max_wait
            while True:
                same = [p for p in self._pending if self._key(p[0]) == k]
                remaining = deadline - time.monotonic()
                if len(same) >= self._max_batch or remaining <= 0 or self._closed:
                    break
                self._cv.wait(remaining)
            batch = same[: self._max_batch]
            taken = {id(p) for p in batch}
            self._pending = [p for p in self._pending if id(p) not in taken]
            return batch

    def _loop(self) -> None:
        while True:
            batch = self._take_batch()
            if not batch:
                if self._closed:
                    return
                continue
            self.batch_sizes.append(len(batch))
            try:
                results = self._run_batch([r for r, _ in batch])
                if len(results) != len(batch):
                    raise RuntimeError(f"run_batch returned {len(results)} results for {len(batch)} requests")
                for (_, fut), res in zip(batch, results):
                    fut.set_result(res)
            except BaseException as e:  # a failed batch fails only its own requests; the worker survives
                for _, fut in batch:
                    if not fut.done():
                        fut.set_exception(e)
