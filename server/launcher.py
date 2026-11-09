"""Entry point for the app-bundled, isolated Python runtime."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.http import main
main()
