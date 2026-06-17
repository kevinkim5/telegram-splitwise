import hmac

from fastapi import APIRouter, Request, HTTPException
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo

from backend.config import settings

router = APIRouter(prefix="/api/bot", tags=["bot"])


def _verify_telegram_token(token: str) -> bool:
    """Simple check that the bot token in URL matches our token."""
    return hmac.compare_digest(token, settings.bot_token)


@router.post("/webhook/{token}")
async def webhook(token: str, request: Request):
    if not settings.bot_token or not _verify_telegram_token(token):
        raise HTTPException(status_code=403, detail="Forbidden")

    data = await request.json()

    bot = Bot(token=settings.bot_token)
    update = Update.de_json(data, bot)

    if not update.message:
        return {"ok": True}

    message = update.message
    chat = update.effective_chat

    if message.text and message.text.startswith("/start"):
        if chat.type == "private":
            await bot.send_message(
                chat_id=chat.id,
                text="Add me to a group chat to start splitting expenses with your friends!",
            )
        else:
            webapp_url = settings.webapp_url
            if webapp_url:
                keyboard = [[
                    InlineKeyboardButton(
                        "Open Splitwise \U0001f4b0",
                        web_app=WebAppInfo(url=f"{webapp_url}?chat_id={chat.id}"),
                    )
                ]]
                await bot.send_message(
                    chat_id=chat.id,
                    text=f"Splitwise for *{chat.title}*\nTrack and split expenses with your group!",
                    parse_mode="Markdown",
                    reply_markup=InlineKeyboardMarkup(keyboard),
                )

    return {"ok": True}


@router.post("/setup-webhook")
async def setup_webhook(request: Request):
    """Call this once after deploying to register the webhook with Telegram."""
    # Basic auth: require bot token in header
    auth = request.headers.get("X-Bot-Token", "")
    if not settings.bot_token or not hmac.compare_digest(auth, settings.bot_token):
        raise HTTPException(status_code=403, detail="Forbidden")

    if not settings.webapp_url:
        raise HTTPException(status_code=400, detail="WEBAPP_URL not configured")

    webhook_url = f"{settings.webapp_url}/api/bot/webhook/{settings.bot_token}"

    bot = Bot(token=settings.bot_token)
    result = await bot.set_webhook(url=webhook_url)

    return {"ok": result, "webhook_url": webhook_url}
