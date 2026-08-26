import unittest
from unittest.mock import patch

from app.sql_loader import connection_scope


class _FakeConnection:
    def __init__(self):
        self.entered = False
        self.exited = False
        self.closed = False
        self.exit_error = None

    def __enter__(self):
        self.entered = True
        return self

    def __exit__(self, error_type, error, traceback):
        self.exited = True
        self.exit_error = error
        return False

    def close(self):
        self.closed = True


class SqlConnectionScopeTests(unittest.TestCase):
    def test_connection_is_closed_after_success(self):
        fake = _FakeConnection()
        with patch("app.sql_loader.get_connection", return_value=fake):
            with connection_scope() as connection:
                self.assertIs(connection, fake)

        self.assertTrue(fake.entered)
        self.assertTrue(fake.exited)
        self.assertTrue(fake.closed)
        self.assertIsNone(fake.exit_error)

    def test_connection_is_closed_after_error(self):
        fake = _FakeConnection()
        with patch("app.sql_loader.get_connection", return_value=fake):
            with self.assertRaisesRegex(RuntimeError, "fallo controlado"):
                with connection_scope():
                    raise RuntimeError("fallo controlado")

        self.assertTrue(fake.exited)
        self.assertTrue(fake.closed)
        self.assertIsInstance(fake.exit_error, RuntimeError)


if __name__ == "__main__":
    unittest.main()
