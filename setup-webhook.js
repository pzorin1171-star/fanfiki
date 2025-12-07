// setup-webhook.js
const axios = require('axios');
require('dotenv').config();

async function setupWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.SITE_URL + '/bot' + token;
  
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN не установлен');
    return;
  }
  
  if (!process.env.SITE_URL) {
    console.error('❌ SITE_URL не установлен');
    return;
  }
  
  console.log('⚙️ Настраиваю webhook для Telegram бота...');
  console.log('Токен бота:', token.substring(0, 10) + '...');
  console.log('Webhook URL:', webhookUrl);
  
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`
    );
    
    console.log('✅ Webhook установлен:', response.data);
    
    // Проверяем webhook
    const webhookInfo = await axios.get(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    );
    
    console.log('📊 Информация о webhook:');
    console.log('- URL:', webhookInfo.data.result.url);
    console.log('- Ошибок:', webhookInfo.data.result.last_error_message || 'Нет');
    
  } catch (error) {
    console.error('❌ Ошибка установки webhook:', error.message);
    if (error.response) {
      console.error('Детали ошибки:', error.response.data);
    }
  }
}

setupWebhook();
