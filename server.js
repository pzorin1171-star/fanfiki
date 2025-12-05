const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Раздаем статические файлы из корня

// Импорт модулей
const { initDatabase, getFanfics, addFanfic, updateFanficStatus, getFanficById, likeFanfic } = require('./database');
const { initTelegramBot, notifyNewFanfic } = require('./telegram-bot');

// Инициализация
let db;
initDatabase().then(database => {
    db = database;
    console.log('✅ База данных инициализирована');
}).catch(err => {
    console.error('❌ Ошибка инициализации БД:', err);
});

initTelegramBot();

// API Routes

// Получить все фанфики (с фильтрами)
app.get('/api/fanfics', async (req, res) => {
    try {
        const { genre, age, search, status = 'approved' } = req.query;
        const fanfics = await getFanfics({ genre, age, search, status });
        res.json(fanfics);
    } catch (error) {
        console.error('Ошибка получения фанфиков:', error);
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
        res.json(fanfic);
    } catch (error) {
        console.error('Ошибка получения фанфика:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Отправить новый фанфик на модерацию
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
            createdAt: new Date().toISOString(),
            views: 0,
            likes: 0
        });
        
        // Уведомляем в Telegram
        notifyNewFanfic(fanfic);
        
        res.json({
            success: true,
            submissionId: fanfic.submissionId,
            message: 'Фанфик отправлен на модерацию'
        });
    } catch (error) {
        console.error('Ошибка создания фанфика:', error);
        res.status(500).json({ error: 'Ошибка создания фанфика' });
    }
});

// Лайкнуть фанфик
app.post('/api/fanfics/:id/like', async (req, res) => {
    try {
        const result = await likeFanfic(req.params.id);
        res.json({ success: true, likes: result.likes });
    } catch (error) {
        console.error('Ошибка лайка:', error);
        res.status(500).json({ error: 'Ошибка лайка' });
    }
});

// Админ-роут: получить фанфики на модерации
app.get('/api/admin/pending', async (req, res) => {
    const adminToken = req.headers['x-admin-token'];
    
    if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    try {
        const fanfics = await getFanfics({ status: 'pending' });
        res.json(fanfics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Админ-роут: изменить статус фанфика
app.post('/api/admin/moderate/:id', async (req, res) => {
    const adminToken = req.headers['x-admin-token'];
    
    if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    try {
        const { status } = req.body;
        await updateFanficStatus(req.params.id, status);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Обслуживать фронтенд для всех остальных маршрутов
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Что-то пошло не так!' });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📚 База данных: fanfics.db`);
    console.log(`🌐 Сайт: http://localhost:${PORT}`);
    console.log(`🤖 Telegram бот: ${process.env.TELEGRAM_BOT_TOKEN ? 'Активирован' : 'Не настроен'}`);
});
