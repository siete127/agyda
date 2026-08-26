import unittest
from datetime import datetime
from unittest.mock import patch

from app import azul_snapshot_service


class _CatalogCursor:
    def __init__(self):
        self.sql = ""

    def execute(self, sql):
        self.sql = sql
        return self

    def fetchone(self):
        return (440, 437, 3, datetime(2026, 7, 28, 9, 41, 54))


class AzulListCatalogSyncTests(unittest.TestCase):
    def test_catalog_is_upserted_without_deleting_history(self):
        cursor = _CatalogCursor()
        result = azul_snapshot_service._sync_azul_list_catalog(cursor)

        self.assertIn("OPENQUERY", cursor.sql)
        self.assertIn("asterisk.vicidial_lists", cursor.sql)
        self.assertIn("UPDATE target", cursor.sql)
        self.assertIn("INSERT INTO", cursor.sql)
        self.assertNotIn("DELETE FROM", cursor.sql)
        self.assertEqual(result["inserted"], 3)
        self.assertEqual(result["source_rows"], 440)

    def test_linked_server_identifier_is_validated(self):
        cursor = _CatalogCursor()
        with patch.object(
            azul_snapshot_service.config,
            "AZUL_LINKED_SERVER",
            "AZULCCSERVER; DROP TABLE X",
        ):
            with self.assertRaisesRegex(RuntimeError, "Linked Server"):
                azul_snapshot_service._sync_azul_list_catalog(cursor)


if __name__ == "__main__":
    unittest.main()
