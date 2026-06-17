import hashlib
import hmac
import json
from urllib.parse import unquote, parse_qsl

from fastapi import Header, HTTPException

from backend.config import settings


def verify_init_data(x_telegram_init_data: str = Header(...)) -> dict:
    if not settings.bot_token:
        # Dev mode: skip verification and return a mock user
        return {"id": 1, "first_name": "Dev", "last_name": "User", "username": "devuser"}

    try:
        params = dict(parse_qsl(unquote(x_telegram_init_data), keep_blank_values=True))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid initData format")

    received_hash = params.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=401, detail="Missing hash")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))

    # HMAC-SHA256(key="WebAppData", msg=bot_token) → secret key
    secret_key = hmac.new(b"WebAppData", settings.bot_token.encode(), digestmod=hashlib.sha256).digest()
    # HMAC-SHA256(key=secret_key, msg=data_check_string)
    expected_hash = hmac.new(secret_key, data_check_string.encode(), digestmod=hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(status_code=401, detail="Invalid initData signature")

    user_json = params.get("user", "{}")
    try:
        return json.loads(user_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=401, detail="Invalid user field")
