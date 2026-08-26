import unittest
from datetime import datetime

from app.lead_export_service import _resolve_batch_export_name


class BatchExportNamingTests(unittest.TestCase):
    def setUp(self):
        self.generated_at = datetime(2026, 7, 29, 10, 15, 30)

    def test_destination_list_names_history_and_csv(self):
        visible_name, file_name = _resolve_batch_export_name(
            "LOTE_INTERNO",
            "LISTA DESTINO 60035",
            self.generated_at,
        )

        self.assertEqual(visible_name, "LISTA DESTINO 60035")
        self.assertEqual(
            file_name,
            "LISTA_DESTINO_60035_20260729_101530.csv",
        )

    def test_batch_name_is_preserved_when_destination_list_is_empty(self):
        visible_name, file_name = _resolve_batch_export_name(
            "LOTE_JULIO_01",
            "   ",
            self.generated_at,
        )

        self.assertEqual(visible_name, "LOTE_JULIO_01")
        self.assertEqual(
            file_name,
            "LOTE_JULIO_01_20260729_101530.csv",
        )

    def test_current_default_nomenclature_is_preserved_when_both_are_empty(self):
        visible_name, file_name = _resolve_batch_export_name(
            None,
            None,
            self.generated_at,
        )

        self.assertEqual(visible_name, "LOTE_20260729_101530")
        self.assertEqual(
            file_name,
            "LOTE_20260729_101530_20260729_101530.csv",
        )

    def test_destination_list_length_is_validated(self):
        with self.assertRaisesRegex(ValueError, "100 caracteres"):
            _resolve_batch_export_name(
                None,
                "X" * 101,
                self.generated_at,
            )


if __name__ == "__main__":
    unittest.main()
