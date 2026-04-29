"""Export the FastAPI OpenAPI schema as JSON to stdout.

Run from the ``api/`` directory with the project's virtualenv active::

    python -m scripts.export_openapi > openapi.json

The web/ codegen pipeline pipes the output of this script into
``openapi-typescript`` (see ``web/scripts/generate-api-types.mjs``).
This script is also the source of truth for the CI drift gate.
"""

import json
import sys
from pathlib import Path

# Make ``api/`` importable when invoked as ``python -m scripts.export_openapi``
# AND as ``python scripts/export_openapi.py``.
_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from main import app  # noqa: E402

if __name__ == "__main__":
    schema = app.openapi()
    json.dump(schema, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
