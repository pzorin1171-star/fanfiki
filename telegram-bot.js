const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

let bot;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

const initTelegramBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token || !ADMIN_CHAT_ID) {
    console.warn('⚠️ Telegram бот не настроен. Уведомления не будут отправляться.');
    return;
  }
  
  try {
    bot = new TelegramBot(token, { polling: true });
    
    console.log('🤖 Telegram бот запущен');
    
    // Настройка команд
    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const isAdmin = chatId.toString() === ADMIN_CHAT_ID;
      
      let message = `👋 Привет! Я бот для модерации фанфиков.\n\n`;
      
      if (isAdmin) {
        message += `Вы администратор. Доступные команды:\n`;
        message += `/moderate - Показать фанфики на модерации\n`;
        message += `/help - Помощь`;
      } else {
        message += `Я отправляю уведомления администратору о новых фанфиках.\n`;
        message += `Чтобы отправить фанфик, перейдите на сайт: ${SITE_URL}`;
      }
      
      bot.sendMessage(chatId, message);
    });
    
    bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      const helpText = `
📚 *Помощь по боту*

*Для администраторов:*
/moderate - Показать фанфики на проверке

*Ссылки:*
Сайт: ${SITE_URL}
      `.trim();
      
      bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });
    
    // Обработка нажатий на кнопки (callback queries)
    bot.on('callback_query', async (callbackQuery) => {
      const message = callbackQuery.message;
      const data = callbackQuery.data;
      const chatId = message.chat.id;
      
      // Проверяем, что это админ
      if (chatId.toString() !== ADMIN_CHAT_ID) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '⛔ Нет доступа' });
        return;
      }
      
      const [action, fanficId] = data.split('_');
      
      try {
        // Отправляем запрос на модерацию
        const response = await axios.post(
          `${SITE_URL}/api/telegram/moderate/${fanficId}`,
          {
            action: action,
            adminToken: process.env.ADMIN_TOKEN
          }
        );
        
        const result = response.data;
        
        if (result.success) {
          const statusText = action === 'approve' ? 'одобрен ✅' : 'отклонен ❌';
          
          // Обновляем сообщение
          const originalText = message.text;
          const newText = originalText + `\n\n📋 *Статус:* ${statusText}`;
          
          bot.editMessageText(newText, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown'
          });
          
          // Убираем кнопки
          bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            {
              chat_id: chatId,
              message_id: callbackQuery.message.message_id
            }
          );
          
          bot.answerCallbackQuery(callbackQuery.id, { text: `Фанфик ${statusText}` });
        }
        
      } catch (error) {
        console.error('Ошибка модерации:', error);
        bot.answerCallbackQuery(callbackQuery.id, { 
          text: `Ошибка: ${error.message}` 
        });
      }
    });
    
    // Обработка ошибок polling
    bot.on('polling_error', (error) => {
      console.error('📡 Ошибка polling:', error.message);
    });
    
  } catch (error) {
    console.error('❌ Ошибка запуска бота:', error);
  }
};

// Уведомление о новом фанфике
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
*Жанр:* ${fanfic.genre || 'Не указан'}
*Рейтинг:* ${fanfic.age_rating || '0+'}
*ID:* \`${fanfic.id}\`

*Используйте кнопки для модерации:*
    `.trim();
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Одобрить', callback_data: `approve_${fanfic.id}` },
          { text: '❌ Отклонить', callback_data: `reject_${fanfic.id}` }
        ]
      ]
    };
    
    bot.sendMessage(ADMIN_CHAT_ID, message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
    console.log(`📤 Уведомление отправлено о фанфике: ${fanfic.title}`);
    
  } catch (error) {
    console.error('Ошибка отправки уведомления:', error);
  }
};

module.exports = {
  initTelegramBot,
  notifyNewFanfic
};
