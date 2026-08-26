import unittest
from datetime import date

from app.dashboard_service import (
    _prepare_fusion,
    _resolved_list_name_sql,
)


class _CaptureCursor:
    def __init__(self):
        self.sql = ""
        self.params = ()

    def execute(self, sql, *params):
        self.sql = sql
        self.params = params
        return self


class DashboardListCatalogTests(unittest.TestCase):
    def test_official_catalog_name_has_priority(self):
        expression = _resolved_list_name_sql(
            "cr.[list_name]",
            "cr.[list_id]",
            "vl_report",
        )

        catalog_position = expression.index("vl_report.[list_name]")
        report_position = expression.index("cr.[list_name]")
        id_position = expression.index("cr.[list_id]")
        self.assertLess(catalog_position, report_position)
        self.assertLess(report_position, id_position)

    def test_azul_source_joins_vicidial_lists(self):
        cursor = _CaptureCursor()
        _prepare_fusion(cursor, date(2026, 7, 28))

        self.assertEqual(cursor.sql.count("LEFT JOIN"), 1)
        self.assertIn("vl.[list_name]", cursor.sql)
        self.assertIn(
            "TRY_CONVERT(decimal(20,0),vl.[list_id])",
            cursor.sql,
        )


if __name__ == "__main__":
    unittest.main()
