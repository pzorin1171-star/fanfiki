const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Сессии
app.use(session({
  secret: process.env.SESSION_SECRET || 'fanfic-hub-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 дней
  }
}));

// Middleware для проверки аутентификации
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.userId || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Требуются права администратора' });
  }
  next();
};

// Импорт модулей
const { 
  initDatabase, 
  createUser,
  findUserByUsername,
  findUserById,
  verifyUser,
  getFanfics, 
  getFanficById, 
  addFanfic, 
  updateFanficStatus,
  updateFanfic,
  getUserFanfics,
  toggleLike,
  getUserLike,
  toggleBookmark,
  getUserBookmark,
  getUserBookmarks,
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

// ===== API ПОЛЬЗОВАТЕЛЕЙ =====

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }
    
    // Проверяем, существует ли пользователь
    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
    }
    
    // Создаем пользователя
    const user = await createUser(username, password, email);
    
    // Автоматически логиним пользователя
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = false;
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    const user = await verifyUser(username, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }
    
    // Сохраняем в сессии
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.is_admin === 1;
    
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.is_admin === 1
      }
    });
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// Выход
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Получить текущего пользователя
app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  
  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username,
      isAdmin: req.session.isAdmin
    }
  });
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

// Получить фанфик по ID
app.get('/api/fanfics/:id', async (req, res) => {
  try {
    const fanfic = await getFanficById(req.params.id);
    if (!fanfic) {
      return res.status(404).json({ error: 'Фанфик не найден' });
    }
    
    // Проверяем лайк и закладку для текущего пользователя
    if (req.session.userId) {
      fanfic.liked = await getUserLike(req.session.userId, fanfic.id);
      fanfic.bookmarked = await getUserBookmark(req.session.userId, fanfic.id);
    } else {
      fanfic.liked = false;
      fanfic.bookmarked = false;
    }
    
    res.json(fanfic);
  } catch (error) {
    console.error('❌ Ошибка получения фанфика:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Отправить новый фанфик
app.post('/api/fanfics', requireAuth, async (req, res) => {
  try {
    const fanficData = req.body;
    const userId = req.session.userId;
    const username = req.session.username;
    
    // Валидация
    if (!fanficData.title || !fanficData.content) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }
    
    // Если автор не указан, используем имя пользователя
    const author = fanficData.author || username;
    
    // Генерируем уникальный ID
    const submissionId = `FANFIC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Сохраняем с статусом "на модерации"
    const fanfic = await addFanfic({
      ...fanficData,
      author,
      user_id: userId,
      status: 'pending',
      submissionId,
      views: 0,
      likes: 0,
      bookmarks: 0
    });
    
    // Уведомляем в Telegram
    notifyNewFanfic({
      ...fanfic,
      username: username
    });
    
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

// Получить мои фанфики
app.get('/api/my/fanfics', requireAuth, async (req, res) => {
  try {
    const fanfics = await getUserFanfics(req.session.userId);
    res.json(fanfics);
  } catch (error) {
    console.error('❌ Ошибка получения фанфиков:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обновить фанфик
app.put('/api/fanfics/:id', requireAuth, async (req, res) => {
  try {
    const fanficId = req.params.id;
    const fanficData = req.body;
    const userId = req.session.userId;
    
    // Добавляем ID пользователя в данные
    fanficData.user_id = userId;
    fanficData.is_admin = req.session.isAdmin ? 1 : 0;
    
    const result = await updateFanfic(fanficId, fanficData);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Фанфик не найден или нет прав для редактирования' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Ошибка обновления фанфика:', error);
    res.status(500).json({ error: 'Ошибка обновления фанфика' });
  }
});

// ===== ЛАЙКИ И ЗАКЛАДКИ =====

// Лайкнуть/снять лайк
app.post('/api/fanfics/:id/like', requireAuth, async (req, res) => {
  try {
    const result = await toggleLike(req.session.userId, req.params.id);
    res.json({ success: true, liked: result.liked });
  } catch (error) {
    console.error('❌ Ошибка лайка:', error);
    res.status(500).json({ error: 'Ошибка лайка' });
  }
});

// Добавить/удалить из закладок
app.post('/api/fanfics/:id/bookmark', requireAuth, async (req, res) => {
  try {
    const result = await toggleBookmark(req.session.userId, req.params.id);
    res.json({ success: true, bookmarked: result.bookmarked });
  } catch (error) {
    console.error('❌ Ошибка закладки:', error);
    res.status(500).json({ error: 'Ошибка закладки' });
  }
});

// Получить мои закладки
app.get('/api/my/bookmarks', requireAuth, async (req, res) => {
  try {
    const fanfics = await getUserBookmarks(req.session.userId);
    res.json(fanfics);
  } catch (error) {
    console.error('❌ Ошибка получения закладок:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ===== АДМИН-ПАНЕЛЬ =====

// Получить фанфики на модерации
app.get('/api/admin/pending', requireAdmin, async (req, res) => {
  try {
    const fanfics = await getFanfics({ status: 'pending' });
    res.json(fanfics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Одобрить/отклонить фанфик
app.post('/api/admin/moderate/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }
    
    await updateFanficStatus(req.params.id, status, req.session.username);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Эндпоинт для модерации из Telegram
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
