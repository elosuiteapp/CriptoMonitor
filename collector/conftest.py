"""Garante que `collector/` esteja no sys.path para os testes (import `lib.*`)."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
