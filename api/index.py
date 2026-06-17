import sys
import os

# Add project root to path so backend/ package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.main import app  # noqa: F401 — Vercel uses the `app` name

# Vercel picks up the `app` ASGI handler automatically
