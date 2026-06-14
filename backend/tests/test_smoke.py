"""Smoke tests for EdgeTest AI backend."""
import sys


def test_smoke():
    assert True


def test_python_version():
    assert sys.version_info >= (3, 11)
