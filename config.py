"""
Central config — loads MT5 credentials from Credentials.env.
All other modules import from here; nothing touches .env directly.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

_ENV_PATH = Path(__file__).parent / "Credentials.env"
load_dotenv(dotenv_path=_ENV_PATH, override=True)

MT5_LOGIN    = int(os.getenv("MT5_LOGIN",    "0"))
MT5_PASSWORD = os.getenv("MT5_PASSWORD", "")
MT5_SERVER   = os.getenv("MT5_SERVER",   "")

# Dashboard display settings
REFRESH_INTERVAL_DEFAULT = 30   # seconds
ACCOUNT_CURRENCY         = "USD"
