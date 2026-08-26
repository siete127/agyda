import unittest

from app.kpi_refresh_coordinator import is_query_timeout, run_serialized_kpi


class KpiRefreshCoordinatorTests(unittest.TestCase):
    def test_hyt00_is_retried_once(self):
        calls = []

        def operation():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError("HYT00 Query timeout expired")
            return "ok"

        result = run_serialized_kpi(
            "test",
            operation,
            attempts=2,
            retry_delay_seconds=0,
        )
        self.assertEqual(result, "ok")
        self.assertEqual(len(calls), 2)

    def test_non_timeout_error_is_not_retried(self):
        calls = []

        def operation():
            calls.append(1)
            raise RuntimeError("permiso denegado")

        with self.assertRaisesRegex(RuntimeError, "permiso"):
            run_serialized_kpi(
                "test",
                operation,
                attempts=2,
                retry_delay_seconds=0,
            )
        self.assertEqual(len(calls), 1)
        self.assertTrue(is_query_timeout(RuntimeError("HYT00")))


if __name__ == "__main__":
    unittest.main()
