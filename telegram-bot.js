const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

let bot;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

const initTelegramBot = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
        console.warn('⚠️ TELEGRAM_BOT_TOKEN не настроен. Бот отключен.');
        return;
    }
    
    if (!ADMIN_CHAT_ID) {
        console.warn('⚠️ TELEGRAM_ADMIN_CHAT_ID не настроен. Уведомления не будут отправляться.');
        return;
    }
    
    try {
        bot = new TelegramBot(token, { polling: true });
        console.log('🤖 Telegram бот запущен');
        
        setupBotCommands();
    } catch (error) {
        console.error('❌ Ошибка запуска бота:', error);
    }
};

const setupBotCommands = () => {
    // Команда /start
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const isAdmin = chatId.toString() === ADMIN_CHAT_ID;
        
        let message = `👋 Привет! Я бот для модерации фанфиков.\n\n`;
        
        if (isAdmin) {
            message += `Вы администратор. Доступные команды:\n`;
            message += `/moderate - Показать фанфики на модерации\n`;
            message += `/stats - Статистика сайта\n`;
            message += `/help - Помощь`;
        } else {
            message += `Я отправляю уведомления администратору о новых фанфиках.\n`;
            message += `Чтобы отправить фанфик, перейдите на сайт.`;
        }
        
        bot.sendMessage(chatId, message);
    });
    
    // Команда /moderate (только для админа)
    bot.onText(/\/moderate/, async (msg) => {
        const chatId = msg.chat.id;
        
        if (chatId.toString() !== ADMIN_CHAT_ID) {
            bot.sendMessage(chatId, '⛔ У вас нет прав для модерации');
            return;
        }
        
        try {
            // Здесь можно добавить запрос к API для получения фанфиков на модерации
            // Пока просто отправляем сообщение
            bot.sendMessage(chatId, 'Функция модерации будет доступна после настройки API.', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Перейти на сайт', url: process.env.SITE_URL || 'http://localhost:3000' }
                    ]]
                }
            });
        } catch (error) {
            bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
        }
    });
    
    // Команда /help
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        const helpText = `
📚 *Помощь по боту*

*Для администраторов:*
/moderate - Фанфики на проверке
/stats - Статистика сайта

*Ссылки:*
Сайт: ${process.env.SITE_URL || 'Не настроено'}
        `.trim();
        
        bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });
    
    // Обработка ошибок
    bot.on('polling_error', (error) => {
        console.error('Ошибка polling:', error);
    });
};

// Отправить уведомление о новом фанфике
const notifyNewFanfic = (fanfic) => {
    if (!bot || !ADMIN_CHAT_ID) {
        console.warn('Бот не инициализирован для отправки уведомлений');
        return;
    }
    
    try {
        const message = `
📬 *Новый фанфик на модерацию!*

*Название:* ${fanfic.title}
*Автор:* ${fanfic.author}
*Жанр:* ${fanfic.genre}
*Рейтинг:* ${fanfic.age_rating}
*ID:* \`${fanfic.submissionId}\`

*Первые 200 символов:*
${fanfic.content.substring(0, 200)}${fanfic.content.length > 200 ? '...' : ''}

*Используйте команду:* /moderate
        `.trim();
        
        bot.sendMessage(ADMIN_CHAT_ID, message, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: 'Одобрить', callback_data: `approve_${fanfic.submissionId}` },
                    { text: 'Отклонить', callback_data: `reject_${fanfic.submissionId}` }
                ]]
            }
        });
        
        console.log(`📤 Уведомление отправлено администратору о фанфике: ${fanfic.title}`);
    } catch (error) {
        console.error('Ошибка отправки уведомления:', error);
    }
};

module.exports = {
    initTelegramBot,
    notifyNewFanfic
};
