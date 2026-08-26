import tempfile
import unittest
from pathlib import Path

from importar_universo import csv_rows, normalize_entry_month


class MonthlyCsvImportTests(unittest.TestCase):
    def _records(self, content: str):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.csv"
            path.write_text(content, encoding="utf-8")
            return list(csv_rows(path, 2026, "2026-08"))

    def test_lista_vicidial_profile(self):
        records = self._records(
            "Lead,Fecha,Disposicion,Nombre Disposicion,Agente,Lista,Telefono,"
            "Telefono 2,Nombre,Apellidos,Email,Estado\n"
            "10,2026-08-04 10:00:00,NA,NO CONTESTA,agent1,2026080401,"
            "5512345678,,ANA,PEREZ,ana@example.com,CDMX\n"
        )
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["PhoneNormalized"], "5512345678")
        self.assertEqual(record["EntryDate"], "2026-08-01 00:00:00")
        self.assertEqual(record["LastLocalCallTime"], "2026-08-04 10:00:00")
        self.assertEqual(record["CampaignID"], "60035")
        self.assertEqual(record["StatusDetalle"], "NA - NO CONTESTA")
        self.assertEqual(record["LastName"], "PEREZ")

    def test_reporte_general_profile(self):
        records = self._records(
            "Fecha,Conteo Llamadas,Numero Marcado,Disposicion,Agente,Campana,"
            "Lista,Lead,NOMBRE,Estado,TEL CASA,CORREO\n"
            "2026-08-05 11:30:00,3,5587654321,AA,agent2,1009OJT,"
            "2026080502,11,LUIS,JAL,5587654321,luis@example.com\n"
        )
        record = records[0]
        self.assertEqual(record["PhoneNormalized"], "5587654321")
        self.assertEqual(record["EntryDate"], "2026-08-01 00:00:00")
        self.assertEqual(record["CalledCount"], 3)
        self.assertEqual(record["CampaignID"], "60035")

    def test_invalid_month_is_rejected(self):
        with self.assertRaises(ValueError):
            normalize_entry_month("2026-13")


if __name__ == "__main__":
    unittest.main()
