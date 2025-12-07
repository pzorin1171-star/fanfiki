const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(path.join(__dirname, 'fanfics.db'), (err) => {
      if (err) {
        console.error('❌ Ошибка подключения к БД:', err);
        reject(err);
      } else {
        console.log('✅ Подключено к SQLite базе данных');
        
        // Создаем таблицу фанфиков
        db.run(`
          CREATE TABLE IF NOT EXISTS fanfics (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            genre TEXT,
            age_rating TEXT DEFAULT '0+',
            tags TEXT,
            chapters TEXT,
            content TEXT,
            status TEXT DEFAULT 'pending',
            submissionId TEXT,
            views INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT,
            approved_at TEXT,
            approved_by TEXT
          )
        `, (err) => {
          if (err) {
            console.error('❌ Ошибка создания таблицы:', err);
            reject(err);
          } else {
            console.log('✅ Таблица fanfics готова');
            resolve(db);
          }
        });
      }
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
    
    if (genre && genre !== 'Все жанры') {
      query += ' AND genre = ?';
      params.push(genre);
    }
    
    if (age && age !== 'Все возраста') {
      query += ' AND age_rating = ?';
      params.push(age);
    }
    
    if (search) {
      query += ' AND (title LIKE ? OR author LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    query += ' ORDER BY created_at DESC';
    
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Парсим JSON поля
        const fanfics = rows.map(row => ({
          ...row,
          tags: row.tags ? JSON.parse(row.tags) : [],
          chapters: row.chapters ? JSON.parse(row.chapters) : []
        }));
        resolve(fanfics);
      }
    });
  });
};

// Получить фанфик по ID
const getFanficById = (id, incrementViews = true) => {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM fanfics WHERE id = ?`;
    
    db.get(query, [id], (err, row) => {
      if (err) {
        reject(err);
      } else if (!row) {
        resolve(null);
      } else {
        // Увеличиваем счетчик просмотров
        if (incrementViews) {
          db.run('UPDATE fanfics SET views = views + 1 WHERE id = ?', [id]);
        }
        
        resolve({
          ...row,
          tags: row.tags ? JSON.parse(row.tags) : [],
          chapters: row.chapters ? JSON.parse(row.chapters) : []
        });
      }
    });
  });
};

// Добавить новый фанфик
const addFanfic = (fanficData) => {
  return new Promise((resolve, reject) => {
    const id = `fanfic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const chapters = fanficData.chapters || [];
    
    const fanfic = {
      id,
      ...fanficData,
      tags: JSON.stringify(fanficData.tags || []),
      chapters: JSON.stringify(chapters),
      content: fanficData.content || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const query = `
      INSERT INTO fanfics 
      (id, title, author, genre, age_rating, tags, chapters, content, 
       status, submissionId, views, likes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      fanfic.status || 'pending',
      fanfic.submissionId,
      fanfic.views || 0,
      fanfic.likes || 0,
      fanfic.created_at,
      fanfic.updated_at
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
const updateFanficStatus = (id, status, approvedBy = null) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE fanfics 
      SET status = ?, approved_at = ?, approved_by = ?, updated_at = ?
      WHERE id = ?
    `;
    
    const now = new Date().toISOString();
    
    db.run(query, [status, now, approvedBy, now, id], function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
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

// Статистика
const getStats = () => {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT 
        COUNT(*) as total_fanfics,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_fanfics,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_fanfics,
        SUM(views) as total_views,
        SUM(likes) as total_likes
      FROM fanfics
    `, [], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

module.exports = {
  initDatabase,
  getFanfics,
  getFanficById,
  addFanfic,
  updateFanficStatus,
  likeFanfic,
  getStats
};
