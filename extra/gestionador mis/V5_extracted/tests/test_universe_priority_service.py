import unittest
from unittest.mock import patch

from app.universe_priority_service import (
    get_universe_priority_dashboard,
    score_entry_months,
    score_lists,
)


def _month(entry_month, **changes):
    item = {
        "entry_month": entry_month,
        "eligible": 100000,
        "never_dialed": 20000,
        "dialed": 5000,
        "contacted": 750,
        "callbacks": 0,
        "approved": 10,
        "contact_pct": 15.0,
        "approved_per_1000": 2.0,
        "sample_coverage_pct": 5.0,
    }
    item.update(changes)
    return item


class UniversePriorityTests(unittest.TestCase):
    def test_commercial_signal_with_evidence_ranks_first(self):
        ranked = score_entry_months(
            [
                _month(
                    "2026-07",
                    dialed=6666,
                    contact_pct=17.78,
                    approved_per_1000=6.751,
                    sample_coverage_pct=4.62,
                ),
                _month(
                    "2025-09",
                    dialed=3171,
                    contact_pct=23.30,
                    approved_per_1000=0.631,
                    sample_coverage_pct=0.32,
                ),
            ],
            5000,
        )
        self.assertEqual(ranked[0]["entry_month"], "2026-07")
        self.assertEqual(ranked[0]["level"], "ESCALAR")

    def test_low_coverage_is_labeled_as_pilot(self):
        item = score_entry_months(
            [_month("2025-10", sample_coverage_pct=1.09)],
            5000,
        )[0]
        self.assertEqual(item["level"], "PILOTO")

    def test_small_sample_has_low_confidence(self):
        item = score_entry_months(
            [_month("2026-06", dialed=280)],
            5000,
        )[0]
        self.assertEqual(item["confidence"], "BAJA")

    def test_list_name_is_preserved_in_ranked_result(self):
        ranked = score_lists(
            [
                {
                    "list_id": "123",
                    "list_name": "CARTERA NORTE",
                    "dialed": 1500,
                    "contacted": 300,
                    "approved": 12,
                    "contact_pct": 20.0,
                    "approved_per_1000": 8.0,
                }
            ]
        )
        self.assertEqual(ranked[0]["list_name"], "CARTERA NORTE")
        self.assertEqual(ranked[0]["confidence"], "ALTA")

    def test_small_list_is_kept_as_pilot(self):
        ranked = score_lists(
            [
                {
                    "list_id": "456",
                    "list_name": "MUESTRA",
                    "dialed": 50,
                    "contacted": 20,
                    "approved": 2,
                    "contact_pct": 40.0,
                    "approved_per_1000": 40.0,
                }
            ]
        )
        self.assertEqual(ranked[0]["level"], "PILOTO")

    @patch("app.universe_priority_service._start_refresh")
    @patch("app.universe_priority_service._load_snapshot")
    def test_missing_snapshot_returns_preparing_without_sql_wait(
        self,
        load_snapshot,
        start_refresh,
    ):
        load_snapshot.return_value = None
        start_refresh.return_value = True
        result = get_universe_priority_dashboard()
        self.assertTrue(result["preparing"])
        self.assertEqual(result["retry_after_seconds"], 5)
        start_refresh.assert_called_once()


if __name__ == "__main__":
    unittest.main()
