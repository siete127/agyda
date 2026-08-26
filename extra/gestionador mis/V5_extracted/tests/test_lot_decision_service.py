import unittest
from unittest.mock import patch

from app.lot_decision_service import get_lot_decision_dashboard, score_rankings


def _ranking(batch_id, **changes):
    item = {
        "batch_id": batch_id,
        "eligible": 5000,
        "marked": 1000,
        "conversion_pct": 2.0,
        "contact_pct": 30.0,
        "recent_pct": 10.0,
        "three_plus_pct": 20.0,
        "overlap_pct": 10.0,
    }
    item.update(changes)
    return item


class LotDecisionScoringTests(unittest.TestCase):
    def test_stronger_lot_is_ranked_first(self):
        rankings = score_rankings(
            [
                _ranking(
                    1,
                    eligible=8000,
                    conversion_pct=4.0,
                    contact_pct=45.0,
                    recent_pct=5.0,
                    three_plus_pct=10.0,
                    overlap_pct=8.0,
                ),
                _ranking(
                    2,
                    eligible=1500,
                    conversion_pct=1.0,
                    contact_pct=12.0,
                    recent_pct=75.0,
                    three_plus_pct=70.0,
                    overlap_pct=85.0,
                ),
            ],
            target_quantity=5000,
            cooldown_days=15,
        )
        self.assertEqual(rankings[0]["batch_id"], 1)
        self.assertGreater(rankings[0]["score"], rankings[1]["score"])

    def test_stale_sources_reduce_score_and_confidence_signal(self):
        fresh = score_rankings(
            [_ranking(1)], 5000, 15, sources_stale=False
        )[0]
        stale = score_rankings(
            [_ranking(1)], 5000, 15, sources_stale=True
        )[0]
        self.assertEqual(fresh["score"] - stale["score"], 10.0)
        self.assertTrue(any("SLA" in reason for reason in stale["reasons"]))

    def test_small_sample_has_low_confidence(self):
        item = score_rankings(
            [_ranking(1, marked=80)], 5000, 15
        )[0]
        self.assertEqual(item["confidence"], "BAJA")

    @patch("app.lot_decision_service._start_background_refresh")
    @patch("app.lot_decision_service._load_persistent_snapshot")
    def test_missing_snapshot_returns_preparing_without_blocking(
        self,
        load_snapshot,
        start_refresh,
    ):
        load_snapshot.return_value = None
        start_refresh.return_value = True
        result = get_lot_decision_dashboard()
        self.assertTrue(result["preparing"])
        self.assertEqual(result["retry_after_seconds"], 5)
        start_refresh.assert_called_once()


if __name__ == "__main__":
    unittest.main()
