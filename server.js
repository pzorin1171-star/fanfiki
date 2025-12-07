const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Импорт модулей
const { 
  initDatabase, 
  getFanfics, 
  getFanficById, 
  addFanfic, 
  updateFanficStatus, 
  likeFanfic,
  getStats
} = require('./database');

const { 
  initTelegramBot, 
  notifyNewFanfic 
} = require('./telegram-bot');

// Инициализация
initDatabase();

// Health check для Render
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'fanfic-hub'
  });
});

// Статистика сайта
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// ===== API ФАНФИКОВ =====

// Получить все фанфики (публичные)
app.get('/api/fanfics', async (req, res) => {
  try {
    const { genre, age, search, page = 1, limit = 20 } = req.query;
    const status = 'approved'; // Только одобренные
    
    const fanfics = await getFanfics({ genre, age, search, status });
    
    // Пагинация
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedFanfics = fanfics.slice(startIndex, endIndex);
    
    res.json({
      fanfics: paginatedFanfics,
      total: fanfics.length,
      page: parseInt(page),
      totalPages: Math.ceil(fanfics.length / limit)
    });
  } catch (error) {
    console.error('❌ Ошибка получения фанфиков:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить фанфики на модерации (для админа)
app.get('/api/admin/pending', async (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  
  try {
    const fanfics = await getFanfics({ status: 'pending' });
    res.json(fanfics);
  } catch (error) {
    console.error('❌ Ошибка получения фанфиков на модерации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить фанфик по ID
app.get('/api/fanfics/:id', async (req, res) => {
  try {
    const fanfic = await getFanficById(req.params.id);
    if (!fanfic) {
      return res.status(404).json({ error: 'Фанфик не найден' });
    }
    res.json(fanfic);
  } catch (error) {
    console.error('❌ Ошибка получения фанфика:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Отправить новый фанфик (анонимно)
app.post('/api/fanfics', async (req, res) => {
  try {
    const fanficData = req.body;
    
    // Валидация
    if (!fanficData.title || !fanficData.author || !fanficData.content) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }
    
    // Генерируем уникальный ID
    const submissionId = `FANFIC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Сохраняем с статусом "на модерации"
    const fanfic = await addFanfic({
      ...fanficData,
      status: 'pending',
      submissionId,
      views: 0,
      likes: 0
    });
    
    // Уведомляем в Telegram
    notifyNewFanfic(fanfic);
    
    res.json({
      success: true,
      fanficId: fanfic.id,
      submissionId: fanfic.submissionId,
      message: 'Фанфик отправлен на модерацию'
    });
  } catch (error) {
    console.error('❌ Ошибка создания фанфика:', error);
    res.status(500).json({ error: 'Ошибка создания фанфика' });
  }
});

// Лайкнуть фанфик
app.post('/api/fanfics/:id/like', async (req, res) => {
  try {
    const result = await likeFanfic(req.params.id);
    res.json({ success: true, likes: result.likes });
  } catch (error) {
    console.error('❌ Ошибка лайка:', error);
    res.status(500).json({ error: 'Ошибка лайка' });
  }
});

// Одобрить/отклонить фанфик (админ)
app.post('/api/admin/moderate/:id', async (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  
  try {
    const { status } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }
    
    await updateFanficStatus(req.params.id, status, 'Admin');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Ошибка модерации:', error);
    res.status(500).json({ error: error.message });
  }
});

// Модерация из Telegram
app.post('/api/telegram/moderate/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, adminToken } = req.body;
    
    // Проверка токена
    if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ 
        error: 'Доступ запрещен' 
      });
    }
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ 
        error: 'Некорректное действие' 
      });
    }
    
    const finalStatus = action === 'approve' ? 'approved' : 'rejected';
    const fanfic = await getFanficById(id, false);
    
    if (!fanfic) {
      return res.status(404).json({ error: 'Фанфик не найден' });
    }
    
    await updateFanficStatus(id, finalStatus, 'Telegram Bot');
    
    res.json({ 
      success: true,
      status: finalStatus,
      message: action === 'approve' ? 'Фанфик одобрен' : 'Фанфик отклонен',
      fanfic: {
        id: fanfic.id,
        title: fanfic.title,
        author: fanfic.author,
        viewUrl: `${process.env.SITE_URL || 'http://localhost:3000'}/?view=${fanfic.id}`
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка телеграм модерации:', error);
    res.status(500).json({ error: 'Ошибка модерации' });
  }
});

// Пинг для поддержания активности
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    message: 'Сервер работает'
  });
});

// Обслуживать фронтенд
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Запускаем Telegram бот
setTimeout(() => {
  initTelegramBot();
}, 2000);

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📚 База данных: fanfics.db`);
  console.log(`🌐 Сайт: http://localhost:${PORT}`);
  console.log(`🤖 Telegram бот: ${process.env.TELEGRAM_BOT_TOKEN ? 'Активирован' : 'Не настроен'}`);
});
