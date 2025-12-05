const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Импорт модулей
const { 
  initDatabase, 
  getFanfics, 
  addFanfic, 
  updateFanficStatus, 
  getFanficById, 
  likeFanfic 
} = require('./database');

const { 
  initTelegramBot, 
  notifyNewFanfic 
} = require('./telegram-bot');

// Инициализация базы данных
let db;
initDatabase().then(database => {
  db = database;
  console.log('✅ База данных инициализирована');
}).catch(err => {
  console.error('❌ Ошибка инициализации БД:', err);
});

// Инициализация Telegram бота
initTelegramBot();

// ========== API ROUTES ==========

// 1. Получить все фанфики (с фильтрами)
app.get('/api/fanfics', async (req, res) => {
  try {
    const { genre, age, search, status = 'approved' } = req.query;
    const fanfics = await getFanfics({ genre, age, search, status });
    res.json(fanfics);
  } catch (error) {
    console.error('❌ Ошибка получения фанфиков:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// 2. Получить фанфик по ID
app.get('/api/fanfics/:id', async (req, res) => {
  try {
    const fanfic = await getFanficById(req.params.id);
    
    if (!fanfic) {
      return res.status(404).json({ error: 'Фанфик не найден' });
    }
    
    // Проверяем статус - только одобренные или админ
    if (fanfic.status !== 'approved') {
      const authHeader = req.headers['authorization'];
      if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(403).json({ error: 'Фанфик находится на модерации' });
      }
    }
    
    res.json(fanfic);
  } catch (error) {
    console.error('❌ Ошибка получения фанфика:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// 3. Отправить новый фанфик на модерацию
app.post('/api/fanfics', async (req, res) => {
  try {
    const fanficData = req.body;
    
    // Валидация
    if (!fanficData.title || !fanficData.author) {
      return res.status(400).json({ 
        error: 'Заполните название и имя автора' 
      });
    }
    
    if (!fanficData.content && (!fanficData.chapters || fanficData.chapters.length === 0)) {
      return res.status(400).json({ 
        error: 'Добавьте содержание фанфика' 
      });
    }
    
    // Генерируем уникальный ID
    const submissionId = `FANFIC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fanficId = `fanfic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Подготавливаем данные
    const chapters = fanficData.chapters || [{
      title: 'Глава 1',
      content: fanficData.content || '',
      createdAt: new Date().toISOString()
    }];
    
    const newFanfic = {
      id: fanficId,
      title: fanficData.title,
      author: fanficData.author,
      genre: fanficData.genre || 'Другое',
      age_rating: fanficData.age_rating || '0+',
      tags: fanficData.tags || [],
      chapters: chapters,
      content: chapters[0]?.content || '',
      status: 'pending',
      submissionId: submissionId,
      views: 0,
      likes: 0,
      createdAt: new Date().toISOString()
    };
    
    // Сохраняем в базу
    const savedFanfic = await addFanfic(newFanfic);
    
    // Отправляем уведомление в Telegram
    await notifyNewFanfic(savedFanfic);
    
    res.json({
      success: true,
      fanficId: savedFanfic.id,
      submissionId: savedFanfic.submissionId,
      message: 'Фанфик отправлен на модерацию'
    });
    
  } catch (error) {
    console.error('❌ Ошибка создания фанфика:', error);
    res.status(500).json({ error: 'Ошибка создания фанфика' });
  }
});

// 4. Лайкнуть фанфик
app.post('/api/fanfics/:id/like', async (req, res) => {
  try {
    const result = await likeFanfic(req.params.id);
    res.json({ 
      success: true, 
      likes: result.likes 
    });
  } catch (error) {
    console.error('❌ Ошибка лайка:', error);
    res.status(500).json({ error: 'Ошибка лайка' });
  }
});

// ========== МОДЕРАЦИЯ (ADMIN API) ==========

// 5. Получить фанфики на модерации (требуется авторизация)
app.get('/api/admin/pending', async (req, res) => {
  try {
    // Проверка токена администратора
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(403).json({ 
        error: 'Доступ запрещен. Неверный токен администратора.' 
      });
    }
    
    const fanfics = await getFanfics({ status: 'pending' });
    res.json(fanfics);
    
  } catch (error) {
    console.error('❌ Ошибка получения фанфиков на модерации:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// 6. Изменить статус фанфика (ОДОБРЕНИЕ/ОТКЛОНЕНИЕ)
app.post('/api/moderate/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, action } = req.body;
    
    // Проверяем токен администратора
    const authHeader = req.headers['authorization'];
    const tokenFromBody = req.body.adminToken;
    
    const isValidToken = 
      (authHeader && authHeader === `Bearer ${process.env.ADMIN_TOKEN}`) ||
      (tokenFromBody && tokenFromBody === process.env.ADMIN_TOKEN);
    
    if (!isValidToken) {
      console.log('❌ Попытка несанкционированной модерации');
      return res.status(403).json({ 
        error: 'Доступ запрещен. Требуется токен администратора.' 
      });
    }
    
    // Определяем статус из action, если status не указан
    let finalStatus = status;
    if (!finalStatus && action) {
      finalStatus = action === 'approve' ? 'approved' : 'rejected';
    }
    
    // Валидация статуса
    const validStatuses = ['approved', 'rejected', 'pending'];
    if (!finalStatus || !validStatuses.includes(finalStatus)) {
      return res.status(400).json({ 
        error: 'Некорректный статус. Допустимые значения: approved, rejected, pending' 
      });
    }
    
    // Проверяем существование фанфика
    const fanfic = await getFanficById(id);
    if (!fanfic) {
      return res.status(404).json({ error: 'Фанфик не найден' });
    }
    
    // Обновляем статус
    await updateFanficStatus(id, finalStatus);
    
    console.log(`✅ Статус фанфика "${fanfic.title}" изменен на: ${finalStatus}`);
    
    res.json({ 
      success: true, 
      message: `Статус фанфика успешно изменен на: ${finalStatus}`,
      fanfic: {
        id: fanfic.id,
        title: fanfic.title,
        author: fanfic.author,
        status: finalStatus
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка модерации:', error);
    res.status(500).json({ error: 'Ошибка сервера при модерации' });
  }
});

// 7. Упрощенный эндпоинт для модерации из Telegram (для кнопок)
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
    const fanfic = await getFanficById(id);
    
    if (!fanfic) {
      return res.status(404).json({ error: 'Фанфик не найден' });
    }
    
    await updateFanficStatus(id, finalStatus);
    
    res.json({ 
      success: true,
      status: finalStatus,
      message: action === 'approve' ? 'Фанфик одобрен' : 'Фанфик отклонен',
      fanfic: {
        id: fanfic.id,
        title: fanfic.title,
        viewUrl: `${process.env.SITE_URL || 'http://localhost:3000'}/?view=${fanfic.id}`
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка телеграм модерации:', error);
    res.status(500).json({ error: 'Ошибка модерации' });
  }
});

// ========== УТИЛИТЫ ==========

// 8. Статистика сайта
app.get('/api/stats', async (req, res) => {
  try {
    const db = await initDatabase();
    
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(views) as totalViews,
          SUM(likes) as totalLikes
        FROM fanfics
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    res.json({
      success: true,
      stats: {
        ...stats,
        approved: stats.approved || 0,
        pending: stats.pending || 0,
        rejected: stats.rejected || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// 9. Проверка здоровья сервера
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: db ? 'connected' : 'disconnected',
    telegram: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'not configured'
  });
});

// ========== ОБСЛУЖИВАНИЕ ФРОНТЕНДА ==========

// Все остальные запросы направляем на index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== ОБРАБОТКА ОШИБОК ==========

app.use((err, req, res, next) => {
  console.error('🚨 Необработанная ошибка:', err.stack);
  
  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ========== ЗАПУСК СЕРВЕРА ==========

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📚 База данных: ${db ? '✅ подключена' : '❌ не подключена'}`);
  console.log(`🌐 Сайт: http://localhost:${PORT}`);
  console.log(`🤖 Telegram бот: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ настроен' : '❌ не настроен'}`);
  console.log(`🔑 Админ токен: ${process.env.ADMIN_TOKEN ? '✅ установлен' : '❌ отсутствует'}`);
  console.log(`📊 API доступны:`);
  console.log(`   GET  /api/fanfics - список фанфиков`);
  console.log(`   GET  /api/fanfics/:id - получить фанфик`);
  console.log(`   POST /api/fanfics - создать фанфик`);
  console.log(`   POST /api/moderate/:id - модерация (требуется токен)`);
});
