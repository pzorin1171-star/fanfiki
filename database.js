const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

let db;

const initDatabase = () => {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(__dirname, 'fanfics.db');
        
        // Проверяем, существует ли файл базы данных
        const dbExists = fs.existsSync(dbPath);
        
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ Ошибка подключения к БД:', err);
                reject(err);
            } else {
                console.log('✅ Подключено к SQLite базе данных');
                
                // Создаем таблицы, если они не существуют
                db.serialize(() => {
                    db.run(`
                        CREATE TABLE IF NOT EXISTS fanfics (
                            id TEXT PRIMARY KEY,
                            title TEXT NOT NULL,
                            author TEXT NOT NULL,
                            genre TEXT,
                            age_rating TEXT DEFAULT '0+',
                            tags TEXT DEFAULT '[]',
                            chapters TEXT DEFAULT '[]',
                            content TEXT,
                            status TEXT DEFAULT 'pending',
                            submissionId TEXT,
                            views INTEGER DEFAULT 0,
                            likes INTEGER DEFAULT 0,
                            createdAt TEXT
                        )
                    `, (err) => {
                        if (err) {
                            console.error('❌ Ошибка создания таблицы fanfics:', err);
                            reject(err);
                        } else {
                            console.log('✅ Таблица fanfics готова');
                            
                            // Если база данных только что создана, добавляем тестовые данные
                            if (!dbExists) {
                                addSampleData().then(() => {
                                    console.log('✅ Тестовые данные добавлены');
                                    resolve(db);
                                }).catch(reject);
                            } else {
                                resolve(db);
                            }
                        }
                    });
                });
            }
        });
    });
};

// Добавление тестовых данных
const addSampleData = () => {
    return new Promise((resolve, reject) => {
        const sampleFanfics = [
            {
                id: 'sample1',
                title: 'История любви в Хогвартсе',
                author: 'Мария Поттер',
                genre: 'Романтика',
                age_rating: '12+',
                tags: JSON.stringify(['Хороший фанфик', 'Драматичный']),
                chapters: JSON.stringify([{
                    title: 'Глава 1: Знакомство',
                    content: 'Это была обычная осень в Хогвартсе. Листья желтели, ученики спешили на занятия, а в воздухе витала магия новых встреч...\n\nГарри и Гермиона сидели в библиотеке, готовясь к экзаменам. Вдруг дверь открылась, и вошел Драко Малфой.',
                    createdAt: new Date().toISOString()
                }]),
                content: 'Это была обычная осень в Хогвартсе...',
                status: 'approved',
                submissionId: 'SAMPLE_001',
                views: 150,
                likes: 42,
                createdAt: new Date('2024-01-15').toISOString()
            },
            {
                id: 'sample2',
                title: 'Приключения в космосе',
                author: 'Алексей Звездный',
                genre: 'Научная фантастика',
                age_rating: '16+',
                tags: JSON.stringify(['Приключения', '18+']),
                chapters: JSON.stringify([{
                    title: 'Пролог: Начало пути',
                    content: 'Космический корабль "Звездный странник" мчался сквозь гиперпространство. На борту находилась команда из пяти человек, каждый со своей историей и секретами.\n\nКапитан Орлов смотрел на звездную карту, прокладывая курс к неизведанной планете.',
                    createdAt: new Date().toISOString()
                }]),
                content: 'Космический корабль "Звездный странник" мчался сквозь гиперпространство...',
                status: 'approved',
                submissionId: 'SAMPLE_002',
                views: 89,
                likes: 23,
                createdAt: new Date('2024-02-10').toISOString()
            }
        ];
        
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO fanfics 
            (id, title, author, genre, age_rating, tags, chapters, content, status, submissionId, views, likes, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        sampleFanfics.forEach(fanfic => {
            stmt.run(
                fanfic.id,
                fanfic.title,
                fanfic.author,
                fanfic.genre,
                fanfic.age_rating,
                fanfic.tags,
                fanfic.chapters,
                fanfic.content,
                fanfic.status,
                fanfic.submissionId,
                fanfic.views,
                fanfic.likes,
                fanfic.createdAt
            );
        });
        
        stmt.finalize((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

// Получить фанфики с фильтрами
const getFanfics = ({ genre, age, search, status }) => {
    return new Promise((resolve, reject) => {
        let query = 'SELECT * FROM fanfics WHERE 1=1';
        const params = [];
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        if (genre) {
            query += ' AND genre = ?';
            params.push(genre);
        }
        
        if (age) {
            query += ' AND age_rating = ?';
            params.push(age);
        }
        
        if (search) {
            query += ' AND (title LIKE ? OR author LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }
        
        query += ' ORDER BY createdAt DESC';
        
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                // Парсим JSON поля
                const fanfics = rows.map(row => ({
                    ...row,
                    tags: safeParseJSON(row.tags),
                    chapters: safeParseJSON(row.chapters)
                }));
                resolve(fanfics);
            }
        });
    });
};

// Получить фанфик по ID
const getFanficById = (id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM fanfics WHERE id = ?', [id], (err, row) => {
            if (err) {
                reject(err);
            } else if (row) {
                // Увеличиваем счетчик просмотров
                db.run('UPDATE fanfics SET views = views + 1 WHERE id = ?', [id]);
                
                // Парсим JSON поля
                resolve({
                    ...row,
                    tags: safeParseJSON(row.tags),
                    chapters: safeParseJSON(row.chapters)
                });
            } else {
                resolve(null);
            }
        });
    });
};

// Добавить новый фанфик
const addFanfic = (fanficData) => {
    return new Promise((resolve, reject) => {
        const id = `fanfic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fanfic = {
            id,
            ...fanficData,
            tags: JSON.stringify(fanficData.tags || []),
            chapters: JSON.stringify(fanficData.chapters || []),
            content: fanficData.content || ''
        };
        
        const query = `
            INSERT INTO fanfics 
            (id, title, author, genre, age_rating, tags, chapters, content, status, submissionId, views, likes, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            fanfic.id,
            fanfic.title,
            fanfic.author,
            fanfic.genre,
            fanfic.age_rating,
            fanfic.tags,
            fanfic.chapters,
            fanfic.content,
            fanfic.status,
            fanfic.submissionId,
            fanfic.views,
            fanfic.likes,
            fanfic.createdAt
        ];
        
        db.run(query, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ id, ...fanficData });
            }
        });
    });
};

// Обновить статус фанфика
const updateFanficStatus = (id, status) => {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE fanfics SET status = ? WHERE id = ?',
            [status, id],
            function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            }
        );
    });
};

// Лайкнуть фанфик
const likeFanfic = (id) => {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE fanfics SET likes = likes + 1 WHERE id = ?',
            [id],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    // Получаем обновленное количество лайков
                    db.get('SELECT likes FROM fanfics WHERE id = ?', [id], (err, row) => {
                        if (err) reject(err);
                        else resolve({ likes: row.likes });
                    });
                }
            }
        );
    });
};

// Безопасный парсинг JSON
const safeParseJSON = (str) => {
    try {
        return JSON.parse(str);
    } catch {
        return [];
    }
};

module.exports = {
    initDatabase,
    getFanfics,
    getFanficById,
    addFanfic,
    updateFanficStatus,
    likeFanfic
};
