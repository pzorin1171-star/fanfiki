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
            age_rating TEXT,
            tags TEXT,
            chapters TEXT,
            content TEXT,
            status TEXT DEFAULT 'pending',
            submissionId TEXT,
            views INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            createdAt TEXT
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
          tags: row.tags ? JSON.parse(row.tags) : [],
          chapters: row.chapters ? JSON.parse(row.chapters) : []
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
      } else {
        if (row) {
          // Увеличиваем счетчик просмотров
          db.run('UPDATE fanfics SET views = views + 1 WHERE id = ?', [id]);
          
          // Парсим JSON поля
          resolve({
            ...row,
            tags: row.tags ? JSON.parse(row.tags) : [],
            chapters: row.chapters ? JSON.parse(row.chapters) : []
          });
        } else {
          resolve(null);
        }
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

module.exports = {
  initDatabase,
  getFanfics,
  getFanficById,
  addFanfic,
  updateFanficStatus,
  likeFanfic
};
