const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

class FanficModBot {
    constructor() {
        this.bot = null;
        this.siteUrl = process.env.SITE_URL || 'http://localhost:3000';
        this.adminToken = process.env.ADMIN_TOKEN;
        
        // Пароль администратора для Telegram бота
        this.adminPassword = process.env.ADMIN_PASSWORD || 'Згешт2024*';
        
        // Хранилище авторизованных сессий (в памяти, для продакшена лучше использовать Redis или БД)
        this.authorizedAdmins = new Map(); // chatId -> { username, authorizedAt, expiresAt }
        this.adminSessions = new Map(); // chatId -> { state: 'awaiting_password', tempData: {} }
        
        this.isReady = false;
        console.log('🔐 Пароль администратора установлен для Telegram бота');
    }

    async init() {
        try {
            if (!process.env.TELEGRAM_BOT_TOKEN) {
                console.warn('⚠️ TELEGRAM_BOT_TOKEN не настроен. Бот отключен.');
                return;
            }

            // Создаем бота с polling
            this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
                polling: {
                    interval: 300,
                    autoStart: true,
                    params: {
                        timeout: 10
                    }
                }
            });

            this.setupEventHandlers();
            this.isReady = true;

            console.log('🤖 Telegram бот успешно запущен');
            console.log('🔐 Требуется пароль для доступа к командам модерации');
            console.log(`🌐 Сайт: ${this.siteUrl}`);

        } catch (error) {
            console.error('❌ Ошибка запуска бота:', error.message);
            if (error.response) {
                console.error('Детали ошибки:', error.response.data);
            }
        }
    }

    setupEventHandlers() {
        // Команда /start
        this.bot.onText(/\/start/, async (msg) => {
            await this.handleStartCommand(msg);
        });

        // Команда /login - вход в систему
        this.bot.onText(/\/login/, async (msg) => {
            await this.handleLoginCommand(msg);
        });

        // Команда /logout - выход из системы
        this.bot.onText(/\/logout/, async (msg) => {
            await this.handleLogoutCommand(msg);
        });

        // Команда /help
        this.bot.onText(/\/help/, async (msg) => {
            await this.handleHelpCommand(msg);
        });

        // Команда /moderate - показать фанфики на модерации
        this.bot.onText(/\/moderate/, async (msg) => {
            await this.handleModerateCommand(msg);
        });

        // Команда /stats - статистика сайта
        this.bot.onText(/\/stats/, async (msg) => {
            await this.handleStatsCommand(msg);
        });

        // Команда /view <id> - посмотреть фанфик
        this.bot.onText(/\/view (.+)/, async (msg, match) => {
            await this.handleViewCommand(msg, match[1]);
        });

        // Команда /status - статус авторизации
        this.bot.onText(/\/status/, async (msg) => {
            await this.handleStatusCommand(msg);
        });

        // Команда /admin - админ-меню
        this.bot.onText(/\/admin/, async (msg) => {
            await this.handleAdminCommand(msg);
        });

        // Обработка нажатий на inline-кнопки
        this.bot.on('callback_query', async (callbackQuery) => {
            await this.handleCallbackQuery(callbackQuery);
        });

        // Обработка текстовых сообщений (для пароля)
        this.bot.on('message', async (msg) => {
            await this.handleMessage(msg);
        });

        // Обработка ошибок polling
        this.bot.on('polling_error', (error) => {
            console.error('📡 Ошибка polling:', error.message);
            if (error.code === 'EFATAL') {
                console.log('🔄 Перезапуск бота из-за фатальной ошибки...');
                setTimeout(() => this.init(), 5000);
            }
        });
    }

    // ========== АУТЕНТИФИКАЦИЯ ==========

    isAuthorized(chatId) {
        const session = this.authorizedAdmins.get(chatId.toString());
        if (!session) return false;
        
        // Проверяем не истекла ли сессия (24 часа)
        if (session.expiresAt < Date.now()) {
            this.authorizedAdmins.delete(chatId.toString());
            return false;
        }
        
        return true;
    }

    authorizeAdmin(chatId, username = 'admin') {
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 часа
        
        this.authorizedAdmins.set(chatId.toString(), {
            username: username,
            authorizedAt: new Date().toISOString(),
            expiresAt: expiresAt,
            chatId: chatId.toString()
        });
        
        console.log(`✅ Авторизован администратор ${username} (chatId: ${chatId})`);
        
        // Удаляем состояние ожидания пароля
        this.adminSessions.delete(chatId.toString());
        
        return true;
    }

    logoutAdmin(chatId) {
        const wasAuthorized = this.authorizedAdmins.has(chatId.toString());
        this.authorizedAdmins.delete(chatId.toString());
        this.adminSessions.delete(chatId.toString());
        
        if (wasAuthorized) {
            console.log(`👋 Администратор вышел из системы (chatId: ${chatId})`);
        }
        
        return wasAuthorized;
    }

    getAdminSession(chatId) {
        return this.authorizedAdmins.get(chatId.toString()) || null;
    }

    // ========== ОБРАБОТКА КОМАНД ==========

    async handleStartCommand(msg) {
        const chatId = msg.chat.id;
        const isAuthorized = this.isAuthorized(chatId);
        
        let message = `👋 *Добро пожаловать в бот ФанфикХаб!*\n\n`;
        
        if (isAuthorized) {
            const session = this.getAdminSession(chatId);
            message += `✅ Вы авторизованы как администратор\n`;
            message += `👤 Имя: ${session.username}\n`;
            message += `⏱️ Сессия до: ${new Date(session.expiresAt).toLocaleString('ru-RU')}\n\n`;
            message += `*Доступные команды:*\n`;
            message += `/moderate - Фанфики на модерации\n`;
            message += `/stats - Статистика сайта\n`;
            message += `/view <id> - Посмотреть фанфик\n`;
            message += `/admin - Админ-меню\n`;
            message += `/logout - Выйти из системы\n`;
            message += `/help - Помощь\n\n`;
            message += `🌐 Сайт: ${this.siteUrl}`;
        } else {
            message += `🔐 Для доступа к функциям модерации требуется авторизация.\n\n`;
            message += `Используйте команду /login для входа в систему.\n`;
            message += `Или /help для получения справки.`;
        }
        
        await this.bot.sendMessage(chatId, message, { 
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: isAuthorized ? [
                    [{ text: '📋 Фанфики на модерации' }],
                    [{ text: '📊 Статистика' }, { text: '👤 Мой профиль' }],
                    [{ text: '🚪 Выйти' }]
                ] : [
                    [{ text: '🔐 Войти в систему' }],
                    [{ text: '❓ Помощь' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    }

    async handleLoginCommand(msg) {
        const chatId = msg.chat.id;
        
        if (this.isAuthorized(chatId)) {
            await this.bot.sendMessage(chatId, 
                '✅ Вы уже авторизованы в системе.\n' +
                'Используйте /logout для выхода.',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        // Устанавливаем состояние ожидания пароля
        this.adminSessions.set(chatId.toString(), {
            state: 'awaiting_password',
            tempData: {}
        });
        
        const message = `🔐 *Вход в систему администратора*\n\n` +
            `Для доступа к функциям модерации введите пароль администратора.\n\n` +
            `*Инструкция:*\n` +
            `1. Отправьте пароль в ответ на это сообщение\n` +
            `2. Пароль будет проверен локально в боте\n` +
            `3. После успешного входа вы получите доступ ко всем командам\n\n` +
            `⚠️ *Внимание:*\n` +
            `• Пароль чувствителен к регистру\n` +
            `• Не передавайте пароль третьим лицам\n` +
            `• Сессия длится 24 часа\n\n` +
            `*Чтобы отменить ввод, используйте команду /cancel*`;
        
        await this.bot.sendMessage(chatId, message, { 
            parse_mode: 'Markdown',
            reply_markup: {
                force_reply: true,
                selective: true
            }
        });
    }

    async handleLogoutCommand(msg) {
        const chatId = msg.chat.id;
        
        if (this.logoutAdmin(chatId)) {
            await this.bot.sendMessage(chatId, 
                '✅ Вы успешно вышли из системы.\n' +
                'Для доступа к функциям модерации снова используйте /login.',
                { parse_mode: 'Markdown' }
            );
        } else {
            await this.bot.sendMessage(chatId, 
                'ℹ️ Вы не были авторизованы в системе.',
                { parse_mode: 'Markdown' }
            );
        }
    }

    async handleStatusCommand(msg) {
        const chatId = msg.chat.id;
        const isAuthorized = this.isAuthorized(chatId);
        
        let message = `📊 *Статус вашей сессии*\n\n`;
        
        if (isAuthorized) {
            const session = this.getAdminSession(chatId);
            const expiresIn = Math.round((session.expiresAt - Date.now()) / (60 * 60 * 1000));
            
            message += `✅ *Авторизован*\n`;
            message += `👤 Имя: ${session.username}\n`;
            message += `🕒 Авторизован: ${new Date(session.authorizedAt).toLocaleString('ru-RU')}\n`;
            message += `⏳ Истекает через: ${expiresIn} часов\n`;
            message += `🆔 Chat ID: ${session.chatId}\n\n`;
            message += `🌐 Сайт: ${this.siteUrl}`;
        } else {
            message += `❌ *Не авторизован*\n\n`;
            message += `Для доступа к функциям модерации используйте команду /login`;
        }
        
        await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }

    async handleAdminCommand(msg) {
        const chatId = msg.chat.id;
        
        if (!await this.requireAuthorization(chatId)) {
            return;
        }
        
        const message = `⚙️ *Админ-меню ФанфикХаб*\n\n` +
            `*Быстрые действия:*\n\n` +
            `📋 Просмотр фанфиков на модерации\n` +
            `📊 Статистика сайта\n` +
            `👤 Управление сессией\n\n` +
            `*Команды:*\n` +
            `/moderate - Список фанфиков на проверке\n` +
            `/stats - Детальная статистика\n` +
            `/view <ID> - Просмотр фанфика\n` +
            `/status - Статус сессии\n` +
            `/logout - Выйти из системы\n\n` +
            `🌐 Сайт: ${this.siteUrl}`;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📋 Фанфики на модерации', callback_data: 'admin_moderate' },
                    { text: '📊 Статистика', callback_data: 'admin_stats' }
                ],
                [
                    { text: '👤 Мой профиль', callback_data: 'admin_profile' },
                    { text: '🚪 Выйти', callback_data: 'admin_logout' }
                ],
                [
                    { text: '🌐 Открыть сайт', url: this.siteUrl }
                ]
            ]
        };
        
        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleModerateCommand(msg) {
        const chatId = msg.chat.id;
        
        if (!await this.requireAuthorization(chatId)) {
            return;
        }
        
        try {
            await this.bot.sendChatAction(chatId, 'typing');
            
            const pendingFanfics = await this.fetchPendingFanfics();
            
            if (!pendingFanfics || pendingFanfics.length === 0) {
                await this.bot.sendMessage(
                    chatId,
                    '✅ На данный момент нет фанфиков, ожидающих модерации.',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            await this.bot.sendMessage(
                chatId,
                `📋 *Найдено фанфиков на модерации: ${pendingFanfics.length}*\n\n` +
                `Используйте кнопки для быстрой модерации.`,
                { parse_mode: 'Markdown' }
            );
            
            for (const fanfic of pendingFanfics) {
                await this.sendFanficNotification(fanfic, false);
            }
            
        } catch (error) {
            console.error('Ошибка при получении фанфиков:', error);
            await this.bot.sendMessage(
                chatId,
                `❌ Ошибка при получении списка фанфиков: ${error.message}`
            );
        }
    }

    async handleStatsCommand(msg) {
        const chatId = msg.chat.id;
        
        if (!await this.requireAuthorization(chatId)) {
            return;
        }
        
        try {
            await this.bot.sendChatAction(chatId, 'typing');
            
            const stats = await this.fetchStats();
            
            const message = `📊 *Статистика сайта ФанфикХаб*\n\n` +
                `*Всего фанфиков:* ${stats.total || 0}\n` +
                `• ✅ Одобрено: ${stats.approved || 0}\n` +
                `• ⏳ На модерации: ${stats.pending || 0}\n` +
                `• ❌ Отклонено: ${stats.rejected || 0}\n\n` +
                `*Активность:*\n` +
                `👁️ Всего просмотров: ${stats.totalViews || 0}\n` +
                `❤️ Всего лайков: ${stats.totalLikes || 0}\n\n` +
                `*Сессии админов:* ${this.authorizedAdmins.size}\n` +
                `🌐 Сайт: ${this.siteUrl}`;
            
            await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            
        } catch (error) {
            console.error('Ошибка при получении статистики:', error);
            await this.bot.sendMessage(
                chatId,
                `❌ Не удалось получить статистику: ${error.message}`
            );
        }
    }

    async handleHelpCommand(msg) {
        const chatId = msg.chat.id;
        
        const isAuthorized = this.isAuthorized(chatId);
        
        let message = `📚 *Помощь по боту ФанфикХаб*\n\n`;
        
        if (isAuthorized) {
            message += `*Команды администратора:*\n`;
            message += `/moderate - Фанфики на модерации\n`;
            message += `/stats - Статистика сайта\n`;
            message += `/view <ID> - Посмотреть фанфик\n`;
            message += `/admin - Админ-меню\n`;
            message += `/status - Статус сессии\n`;
            message += `/logout - Выйти из системы\n`;
            message += `/help - Эта справка\n\n`;
            
            message += `*Автоматические уведомления:*\n`;
            message += `При поступлении нового фанфика бот пришлет уведомление с кнопками.\n\n`;
        } else {
            message += `*Общие команды:*\n`;
            message += `/login - Вход в систему администратора\n`;
            message += `/help - Эта справка\n`;
            message += `/start - Главное меню\n\n`;
            
            message += `🔐 *Для доступа к функциям модерации:*\n`;
            message += `1. Используйте команду /login\n`;
            message += `2. Введите пароль администратора\n`;
            message += `3. Получите доступ ко всем функциям\n\n`;
            
            message += `⚠️ *Безопасность:*\n`;
            message += `• Пароль проверяется локально в боте\n`;
            message += `• Сессия длится 24 часа\n`;
            message += `• Не передавайте пароль другим\n`;
        }
        
        message += `🌐 Сайт: ${this.siteUrl}\n`;
        message += `📧 Поддержка: администратор сайта`;
        
        await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }

    // ========== ОБРАБОТКА СООБЩЕНИЙ (для пароля) ==========

    async handleMessage(msg) {
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        
        if (!text) return;
        
        // Проверяем, ожидаем ли мы пароль от этого пользователя
        const session = this.adminSessions.get(chatId.toString());
        
        if (session && session.state === 'awaiting_password') {
            await this.processPasswordInput(chatId, text);
            return;
        }
        
        // Обработка текстовых команд из кастомной клавиатуры
        if (this.isAuthorized(chatId)) {
            switch(text) {
                case '📋 Фанфики на модерации':
                    await this.handleModerateCommand(msg);
                    break;
                case '📊 Статистика':
                    await this.handleStatsCommand(msg);
                    break;
                case '👤 Мой профиль':
                    await this.handleStatusCommand(msg);
                    break;
                case '🚪 Выйти':
                    await this.handleLogoutCommand(msg);
                    break;
            }
        } else {
            switch(text) {
                case '🔐 Войти в систему':
                    await this.handleLoginCommand(msg);
                    break;
                case '❓ Помощь':
                    await this.handleHelpCommand(msg);
                    break;
            }
        }
    }

    async processPasswordInput(chatId, password) {
        // Проверяем пароль
        if (password === this.adminPassword) {
            // Авторизуем пользователя
            this.authorizeAdmin(chatId, 'admin');
            
            await this.bot.sendMessage(chatId, 
                `✅ *Пароль верный!*\n\n` +
                `Вы успешно авторизованы как администратор.\n` +
                `Теперь вам доступны все функции модерации.\n\n` +
                `*Срок действия сессии:* 24 часа\n` +
                `*Для выхода используйте:* /logout\n\n` +
                `Используйте /admin для доступа к админ-меню.`,
                { parse_mode: 'Markdown' }
            );
            
            // Отправляем приветственное сообщение с кнопками
            await this.handleAdminCommand({ chatId: chatId });
            
        } else {
            // Неверный пароль
            this.adminSessions.delete(chatId.toString());
            
            await this.bot.sendMessage(chatId, 
                `❌ *Неверный пароль!*\n\n` +
                `Попробуйте снова или обратитесь к администратору сайта.\n\n` +
                `Для повторной попытки используйте /login`,
                { parse_mode: 'Markdown' }
            );
            
            console.log(`❌ Неудачная попытка входа с паролем: "${password}" (chatId: ${chatId})`);
        }
    }

    // ========== ОБРАБОТКА CALLBACK QUERY ==========

    async handleCallbackQuery(callbackQuery) {
        const message = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = message.chat.id;
        
        // Проверяем авторизацию для всех действий, кроме входа
        if (!data.startsWith('admin_') && !await this.requireAuthorization(chatId, callbackQuery.id)) {
            return;
        }
        
        try {
            // Обработка админ-меню
            if (data.startsWith('admin_')) {
                await this.handleAdminCallback(chatId, data, callbackQuery.id, message.message_id);
                return;
            }
            
            // Обработка модерации фанфиков
            const [action, fanficId] = data.split('_');
            
            if (!['approve', 'reject'].includes(action) || !fanficId) {
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Некорректное действие'
                });
                return;
            }
            
            await this.bot.sendChatAction(chatId, 'typing');
            
            const result = await this.moderateFanfic(fanficId, action);
            
            if (result.success) {
                const statusEmoji = action === 'approve' ? '✅' : '❌';
                const statusText = action === 'approve' ? 'одобрен' : 'отклонен';
                
                const originalText = message.text.split('\n\n')[0];
                const newText = `${originalText}\n\n${statusEmoji} *Статус модерации:* ${statusText}\n` +
                    `*Результат:* ${result.message}\n` +
                    `*Ссылка:* ${result.fanfic?.viewUrl || `${this.siteUrl}/?view=${fanficId}`}`;
                
                await this.bot.editMessageText(newText, {
                    chat_id: chatId,
                    message_id: message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [] }
                });
                
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: `Фанфик ${statusText}`
                });
                
                console.log(`✅ Фанфик ${fanficId} ${statusText} администратором ${chatId}`);
                
            } else {
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: `❌ Ошибка: ${result.error || 'Неизвестная ошибка'}`
                });
            }
            
        } catch (error) {
            console.error('Ошибка обработки callback:', error);
            
            await this.bot.answerCallbackQuery(callbackQuery.id, {
                text: `❌ Ошибка сервера: ${error.message}`
            });
        }
    }

    async handleAdminCallback(chatId, action, callbackQueryId, messageId) {
        switch(action) {
            case 'admin_moderate':
                await this.bot.answerCallbackQuery(callbackQueryId, { text: 'Загружаю фанфики...' });
                await this.handleModerateCommand({ chatId: chatId });
                break;
                
            case 'admin_stats':
                await this.bot.answerCallbackQuery(callbackQueryId, { text: 'Загружаю статистику...' });
                await this.handleStatsCommand({ chatId: chatId });
                break;
                
            case 'admin_profile':
                await this.bot.answerCallbackQuery(callbackQueryId, { text: 'Загружаю профиль...' });
                await this.handleStatusCommand({ chatId: chatId });
                break;
                
            case 'admin_logout':
                if (this.logoutAdmin(chatId)) {
                    await this.bot.answerCallbackQuery(callbackQueryId, { text: 'Выход из системы...' });
                    await this.bot.sendMessage(chatId, '✅ Вы успешно вышли из системы.');
                } else {
                    await this.bot.answerCallbackQuery(callbackQueryId, { text: 'Вы не авторизованы' });
                }
                break;
        }
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

    async requireAuthorization(chatId, callbackQueryId = null) {
        if (this.isAuthorized(chatId)) {
            return true;
        }
        
        const message = `🔐 *Требуется авторизация*\n\n` +
            `Для выполнения этой команды необходимо войти в систему.\n` +
            `Используйте команду /login для входа.`;
        
        if (callbackQueryId) {
            await this.bot.answerCallbackQuery(callbackQueryId, {
                text: 'Требуется авторизация. Используйте /login',
                show_alert: true
            });
        } else {
            await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        }
        
        return false;
    }

    // ========== API ВЗАИМОДЕЙСТВИЕ (как в предыдущей версии) ==========

    async fetchPendingFanfics() {
        try {
            const response = await axios.get(`${this.siteUrl}/api/admin/pending`, {
                headers: {
                    'Authorization': `Bearer ${this.adminToken}`
                },
                timeout: 10000
            });

            return response.data || [];

        } catch (error) {
            console.error('Ошибка получения фанфиков на модерации:', error.message);
            
            if (error.response?.status === 403) {
                throw new Error('Неверный токен администратора. Проверьте ADMIN_TOKEN.');
            }
            
            if (error.response?.status === 404) {
                throw new Error('Сервер не отвечает. Убедитесь, что сайт запущен.');
            }
            
            throw new Error(`API ошибка: ${error.message}`);
        }
    }

    async fetchStats() {
        try {
            const response = await axios.get(`${this.siteUrl}/api/stats`, {
                timeout: 10000
            });

            return response.data.stats || {};

        } catch (error) {
            console.error('Ошибка получения статистики:', error.message);
            throw new Error(`Не удалось получить статистику: ${error.message}`);
        }
    }

    async fetchFanficById(fanficId) {
        try {
            const response = await axios.get(`${this.siteUrl}/api/fanfics/${fanficId}`, {
                headers: this.adminToken ? {
                    'Authorization': `Bearer ${this.adminToken}`
                } : {},
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            if (error.response?.status === 404) {
                return null;
            }
            throw error;
        }
    }

    async moderateFanfic(fanficId, action) {
        try {
            if (!this.adminToken) {
                throw new Error('ADMIN_TOKEN не настроен. Настройте переменную окружения.');
            }

            const response = await axios.post(
                `${this.siteUrl}/api/telegram/moderate/${fanficId}`,
                {
                    action: action,
                    adminToken: this.adminToken
                },
                {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data;

        } catch (error) {
            console.error('Ошибка модерации фанфика:', error.message);
            
            if (error.response?.data?.error) {
                throw new Error(error.response.data.error);
            }
            
            throw new Error(`Ошибка соединения с сервером: ${error.message}`);
        }
    }

    // ========== УВЕДОМЛЕНИЯ ==========

    async notifyNewFanfic(fanfic) {
        if (!this.isReady) {
            console.warn('Бот не готов для отправки уведомлений');
            return;
        }

        try {
            // Отправляем уведомления всем авторизованным администраторам
            for (const [chatId, session] of this.authorizedAdmins) {
                try {
                    await this.sendFanficNotificationToAdmin(chatId, fanfic);
                } catch (error) {
                    console.error(`Ошибка отправки уведомления администратору ${chatId}:`, error.message);
                }
            }
            
            console.log(`📤 Уведомление о новом фанфике отправлено ${this.authorizedAdmins.size} администраторам: "${fanfic.title}"`);
            
        } catch (error) {
            console.error('Ошибка отправки уведомления:', error);
        }
    }

    async sendFanficNotificationToAdmin(chatId, fanfic) {
        const message = `📬 *НОВЫЙ ФАНФИК НА МОДЕРАЦИЮ!*\n\n` +
            `*Название:* ${fanfic.title}\n` +
            `*Автор:* ${fanfic.author}\n` +
            `*Жанр:* ${fanfic.genre || 'Не указан'}\n` +
            `*Рейтинг:* ${fanfic.age_rating || '0+'}\n` +
            `*ID:* \`${fanfic.id}\`\n\n` +
            `*Для быстрой модерации используйте кнопки ниже:*`;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Одобрить', callback_data: `approve_${fanfic.id}` },
                    { text: '❌ Отклонить', callback_data: `reject_${fanfic.id}` }
                ],
                [
                    { 
                        text: '📖 Посмотреть полностью', 
                        url: `${this.siteUrl}/?view=${fanfic.id}` 
                    }
                ]
            ]
        };
        
        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
            disable_web_page_preview: true
        });
    }

    async sendFanficNotification(fanfic, isNew = true) {
        // Эта функция теперь просто вызывает sendFanficNotificationToAdmin для текущего чата
        // Используется в handleModerateCommand
        return this.sendFanficNotificationToAdmin(fanfic._tempChatId, fanfic);
    }

    // ========== УТИЛИТЫ ==========

    getStatusEmoji(status) {
        switch (status) {
            case 'approved': return '✅';
            case 'pending': return '⏳';
            case 'rejected': return '❌';
            default: return '❓';
        }
    }

    async stop() {
        if (this.bot) {
            await this.bot.stopPolling();
            this.isReady = false;
            console.log('🤖 Бот остановлен');
        }
    }
}

// Создаем и экспортируем экземпляр бота
const fanficBot = new FanficModBot();

// Инициализируем бота при запуске модуля
fanficBot.init().catch(error => {
    console.error('❌ Критическая ошибка инициализации бота:', error);
});

// Экспортируем для использования в server.js
module.exports = {
    notifyNewFanfic: (fanfic) => fanficBot.notifyNewFanfic(fanfic),
    initTelegramBot: () => {}, // Заглушка
    fanficBot
};

// Обработка завершения процесса
process.on('SIGINT', async () => {
    console.log('\n🛑 Получен SIGINT. Останавливаем бота...');
    await fanficBot.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен SIGTERM. Останавливаем бота...');
    await fanficBot.stop();
    process.exit(0);
});
