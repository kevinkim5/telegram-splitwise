import asyncio
import os
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://example.com")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat = update.effective_chat
    if chat.type == "private":
        await update.message.reply_text(
            "Add me to a group chat to start splitting expenses with your friends!"
        )
        return

    keyboard = [[
        InlineKeyboardButton(
            "Open Splitwise 💰",
            web_app=WebAppInfo(url=f"{WEBAPP_URL}?chat_id={chat.id}")
        )
    ]]
    await update.message.reply_text(
        f"Splitwise for *{chat.title}*\nTrack and split expenses with your group!",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

async def handle_web_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Mini App can send data back via Telegram.WebApp.sendData()
    # We can use this for notifications, but the main flow uses the REST API directly
    data = update.message.web_app_data.data
    await update.message.reply_text(f"✅ Action recorded: {data}")

def main():
    if not BOT_TOKEN:
        logger.error("BOT_TOKEN environment variable not set")
        return

    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_web_app_data))

    logger.info("Bot started (polling)")
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
