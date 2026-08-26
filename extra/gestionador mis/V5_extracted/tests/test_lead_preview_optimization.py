import json
import unittest
from contextlib import contextmanager
from unittest.mock import patch

from app import lead_export_service
from app.lead_export_service import (
    LeadPreviewTimeout,
    _preview_eligibility_predicate,
    _where_filters,
    get_filter_options,
    preview_candidates,
)
from web import LeadBatchRequest, _service_http_error


class _PreviewCursor:
    def __init__(self, row=None, error=None):
        self.description = None
        self.row = row
        self.error = error
        self.executions = []

    def execute(self, sql, params=None):
        self.executions.append((sql, list(params or [])))
        if self.error:
            raise self.error
        self.description = [
            ("Total",),
            ("NuncaMarcados",),
            ("PromedioCalidad",),
            ("Estados",),
            ("Ciudades",),
            ("TotalFiltrado",),
            ("PendientesValidos",),
            ("VentasDNCValidos",),
            ("PendientesVentaDNC",),
            ("ExcluidosTelefonoInvalido",),
            ("PendientesDetectados",),
            ("SampleJson",),
        ]
        return self

    def fetchone(self):
        return self.row

    def nextset(self):
        return False


class _PreviewConnection:
    def __init__(self, cursor):
        self.timeout = 0
        self._cursor = cursor

    def cursor(self):
        return self._cursor


class _CatalogCursor:
    def __init__(self, rows):
        self.rows = rows
        self.executions = []

    def execute(self, sql, params=None):
        self.executions.append((sql, list(params or [])))
        return self

    def fetchall(self):
        return self.rows


def _connection_scope_for(cursor):
    @contextmanager
    def fake_scope():
        yield _PreviewConnection(cursor)

    return fake_scope


class LeadPreviewOptimizationTests(unittest.TestCase):
    def test_eligibility_rules_remain_explicit_by_mode(self):
        new_rule = _preview_eligibility_predicate("NUEVOS", False)
        self.assertIn("TienePendiente=0", new_rule)
        self.assertIn("TieneMarcado=0", new_rule)

        recycle_rule = _preview_eligibility_predicate("RECICLAJE", False)
        self.assertIn("TienePendiente=0", recycle_rule)
        self.assertIn("ExcluidoVentaDNC=0", recycle_rule)
        self.assertNotIn("TieneMarcado=0", recycle_rule)

        recycle_pending_rule = _preview_eligibility_predicate(
            "RECICLAJE",
            True,
        )
        self.assertNotIn("TienePendiente=0", recycle_pending_rule)
        self.assertIn("ExcluidoVentaDNC=0", recycle_pending_rule)

    def test_preview_materializes_once_and_returns_sample_in_same_query(self):
        sample = json.dumps(
            [
                {
                    "lead_id": 1,
                    "phone": "5551234567",
                    "name": "Prueba",
                    "campaign": "60035",
                    "status": "NEW",
                    "called_count": 0,
                    "quality": 60,
                }
            ]
        )
        cursor = _PreviewCursor(
            row=(5, 4, 60.0, 1, 1, 10, 2, 1, 0, 0, 2, sample)
        )
        with patch.object(
            lead_export_service,
            "connection_scope",
            _connection_scope_for(cursor),
        ), patch.object(
            lead_export_service,
            "ensure_control_tables",
            lambda connection: None,
        ):
            result = preview_candidates(
                {
                    "mode": "NUEVOS",
                    "campaign_id": ["60035"],
                    "management_month": ["2026-07"],
                    "last_management_month": ["2026-07"],
                }
            )

        self.assertEqual(len(cursor.executions), 1)
        sql = cursor.executions[0][0]
        self.assertEqual(sql.count("INTO #CandidateAudit"), 1)
        self.assertIn("FOR JSON PATH", sql)
        self.assertIn("m.UltimoMesGestion IN (?)", sql)
        self.assertIn("2026-07", cursor.executions[0][1])
        self.assertEqual(result["available"], 5)
        self.assertEqual(result["items"][0]["phone"], "5551234567")

    def test_last_management_month_catalog_is_parameterized_and_descending(self):
        cursor = _CatalogCursor([("2026-07",), ("2026-06",)])
        with patch.object(
            lead_export_service,
            "connection_scope",
            _connection_scope_for(cursor),
        ):
            result = get_filter_options(
                "last_management_month",
                filters={"campaign_id": ["60035"]},
            )

        self.assertEqual(result, ["2026-07", "2026-06"])
        sql, params = cursor.executions[0]
        self.assertIn("m.UltimoMesGestion AS Valor", sql)
        self.assertIn("ORDER BY Valor DESC", sql)
        self.assertIn("60035", params)

    def test_last_management_month_uses_indexed_master_column(self):
        params = []
        where = _where_filters(
            {"last_management_month": ["2026-07"]},
            params,
        )

        self.assertIn("m.UltimoMesGestion IN (?)", where)
        self.assertNotIn("CONVERT(char(7), m.LastInteractionDate", where)
        self.assertEqual(params, ["2026-07"])

    def test_invalid_last_management_month_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "AAAA-MM"):
            _where_filters(
                {"last_management_month": ["07/2026"]},
                [],
            )

    def test_sql_timeout_is_translated_to_a_domain_error(self):
        cursor = _PreviewCursor(
            error=RuntimeError("HYT00 Query timeout expired")
        )
        with patch.object(
            lead_export_service,
            "connection_scope",
            _connection_scope_for(cursor),
        ), patch.object(
            lead_export_service,
            "ensure_control_tables",
            lambda connection: None,
        ):
            with self.assertRaises(LeadPreviewTimeout) as raised:
                preview_candidates({"mode": "NUEVOS"})

        self.assertNotIn("HYT00", str(raised.exception))
        self.assertIn("Selecciona", str(raised.exception))

    def test_http_timeout_is_friendly_and_quantity_is_bounded(self):
        http_error = _service_http_error(
            RuntimeError("HYT00 Query timeout expired")
        )
        self.assertEqual(http_error.status_code, 504)
        self.assertNotIn("HYT00", http_error.detail)
        with self.assertRaises(Exception):
            LeadBatchRequest(quantity=50001)


if __name__ == "__main__":
    unittest.main()
