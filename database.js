const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

let db;

const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(path.join(__dirname, 'fanfics.db'), (err) => {
      if (err) {
        console.error('❌ Ошибка подключения к БД:', err);
        reject(err);
      } else {
        console.log('✅ Подключено к SQLite базе данных');
        
        // Создаем таблицу пользователей
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            password_hash TEXT,
            telegram_id TEXT,
            is_admin INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_login TEXT
          )
        `, (err) => {
          if (err) console.error('❌ Ошибка создания таблицы users:', err);
          else console.log('✅ Таблица users готова');
        });
        
        // Создаем таблицу фанфиков
        db.run(`
          CREATE TABLE IF NOT EXISTS fanfics (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            user_id INTEGER,
            genre TEXT,
            age_rating TEXT DEFAULT '0+',
            tags TEXT,
            chapters TEXT,
            content TEXT,
            status TEXT DEFAULT 'pending',
            submissionId TEXT,
            views INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            bookmarks INTEGER DEFAULT 0,
            word_count INTEGER DEFAULT 0,
            chapter_count INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT,
            approved_at TEXT,
            approved_by TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `, (err) => {
          if (err) {
            console.error('❌ Ошибка создания таблицы fanfics:', err);
            reject(err);
          } else {
            console.log('✅ Таблица fanfics готова');
            
            // Создаем таблицу лайков
            db.run(`
              CREATE TABLE IF NOT EXISTS likes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                fanfic_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, fanfic_id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (fanfic_id) REFERENCES fanfics(id)
              )
            `, (err) => {
              if (err) console.error('❌ Ошибка создания таблицы likes:', err);
              else console.log('✅ Таблица likes готова');
              
              // Создаем таблицу закладок
              db.run(`
                CREATE TABLE IF NOT EXISTS bookmarks (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  fanfic_id TEXT,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE(user_id, fanfic_id),
                  FOREIGN KEY (user_id) REFERENCES users(id),
                  FOREIGN KEY (fanfic_id) REFERENCES fanfics(id)
                )
              `, (err) => {
                if (err) console.error('❌ Ошибка создания таблицы bookmarks:', err);
                else {
                  console.log('✅ Таблица bookmarks готова');
                  resolve(db);
                }
              });
            });
          }
        });
      }
    });
  });
};

// ===== ПОЛЬЗОВАТЕЛИ =====
const createUser = async (username, password, email = null) => {
  return new Promise(async (resolve, reject) => {
    const passwordHash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();
    
    db.run(
      `INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)`,
      [username, email, passwordHash, createdAt],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, username, email });
      }
    );
  });
};

const findUserByUsername = (username) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const findUserById = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, username, email, is_admin, created_at FROM users WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const verifyUser = async (username, password) => {
  const user = await findUserByUsername(username);
  if (!user) return null;
  
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return null;
  
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: user.is_admin
  };
};

// ===== ФАНФИКИ =====
const getFanfics = ({ genre, age, search, status, userId = null }) => {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT f.*, 
             u.username as author_username,
             COUNT(DISTINCT l.id) as likes_count,
             COUNT(DISTINCT b.id) as bookmarks_count
      FROM fanfics f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN likes l ON f.id = l.fanfic_id
      LEFT JOIN bookmarks b ON f.id = b.fanfic_id
      WHERE 1=1
    `;
    const params = [];
    
    if (status) {
      query += ' AND f.status = ?';
      params.push(status);
    }
    
    if (genre && genre !== 'Все жанры') {
      query += ' AND f.genre = ?';
      params.push(genre);
    }
    
    if (age && age !== 'Все возраста') {
      query += ' AND f.age_rating = ?';
      params.push(age);
    }
    
    if (search) {
      query += ' AND (f.title LIKE ? OR f.author LIKE ? OR u.username LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (userId) {
      query += ' AND f.user_id = ?';
      params.push(userId);
    }
    
    query += ' GROUP BY f.id ORDER BY f.created_at DESC';
    
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const fanfics = rows.map(row => ({
          ...row,
          tags: row.tags ? JSON.parse(row.tags) : [],
          chapters: row.chapters ? JSON.parse(row.chapters) : [],
          likes: row.likes_count || 0,
          bookmarks: row.bookmarks_count || 0
        }));
        resolve(fanfics);
      }
    });
  });
};

const getFanficById = (id, incrementViews = true) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT f.*, 
             u.username as author_username,
             u.id as author_id,
             (SELECT COUNT(*) FROM likes WHERE fanfic_id = f.id) as likes_count,
             (SELECT COUNT(*) FROM bookmarks WHERE fanfic_id = f.id) as bookmarks_count
      FROM fanfics f
      LEFT JOIN users u ON f.user_id = u.id
      WHERE f.id = ?
    `;
    
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
          chapters: row.chapters ? JSON.parse(row.chapters) : [],
          likes: row.likes_count || 0,
          bookmarks: row.bookmarks_count || 0
        });
      }
    });
  });
};

const addFanfic = (fanficData) => {
  return new Promise((resolve, reject) => {
    const id = `fanfic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const chapters = fanficData.chapters || [];
    const wordCount = chapters.reduce((sum, ch) => sum + (ch.content?.length || 0), 0);
    
    const fanfic = {
      id,
      ...fanficData,
      tags: JSON.stringify(fanficData.tags || []),
      chapters: JSON.stringify(chapters),
      chapter_count: chapters.length,
      word_count: wordCount,
      content: fanficData.content || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const query = `
      INSERT INTO fanfics 
      (id, title, author, user_id, genre, age_rating, tags, chapters, content, 
       status, submissionId, views, likes, bookmarks, word_count, chapter_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      fanfic.id,
      fanfic.title,
      fanfic.author,
      fanfic.user_id || null,
      fanfic.genre,
      fanfic.age_rating,
      fanfic.tags,
      fanfic.chapters,
      fanfic.content,
      fanfic.status || 'pending',
      fanfic.submissionId,
      fanfic.views || 0,
      fanfic.likes || 0,
      fanfic.bookmarks || 0,
      fanfic.word_count,
      fanfic.chapter_count,
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

const getUserFanfics = (userId) => {
  return getFanfics({ userId, status: null });
};

const updateFanfic = (id, fanficData) => {
  return new Promise((resolve, reject) => {
    const chapters = fanficData.chapters || [];
    const wordCount = chapters.reduce((sum, ch) => sum + (ch.content?.length || 0), 0);
    
    const query = `
      UPDATE fanfics 
      SET title = ?, genre = ?, age_rating = ?, tags = ?, chapters = ?, 
          content = ?, chapter_count = ?, word_count = ?, updated_at = ?
      WHERE id = ? AND (user_id = ? OR ? = 1)
    `;
    
    const params = [
      fanficData.title,
      fanficData.genre,
      fanficData.age_rating,
      JSON.stringify(fanficData.tags || []),
      JSON.stringify(chapters),
      fanficData.content,
      chapters.length,
      wordCount,
      new Date().toISOString(),
      id,
      fanficData.user_id,
      fanficData.is_admin || 0
    ];
    
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
};

// ===== ЛАЙКИ =====
const toggleLike = (userId, fanficId) => {
  return new Promise((resolve, reject) => {
    // Проверяем, есть ли уже лайк
    db.get(
      'SELECT id FROM likes WHERE user_id = ? AND fanfic_id = ?',
      [userId, fanficId],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          // Удаляем лайк
          db.run(
            'DELETE FROM likes WHERE id = ?',
            [row.id],
            function(err) {
              if (err) reject(err);
              else resolve({ liked: false });
            }
          );
        } else {
          // Добавляем лайк
          db.run(
            'INSERT INTO likes (user_id, fanfic_id) VALUES (?, ?)',
            [userId, fanficId],
            function(err) {
              if (err) reject(err);
              else resolve({ liked: true });
            }
          );
        }
      }
    );
  });
};

const getUserLike = (userId, fanficId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM likes WHERE user_id = ? AND fanfic_id = ?',
      [userId, fanficId],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
};

// ===== ЗАКЛАДКИ =====
const toggleBookmark = (userId, fanficId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM bookmarks WHERE user_id = ? AND fanfic_id = ?',
      [userId, fanficId],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          db.run(
            'DELETE FROM bookmarks WHERE id = ?',
            [row.id],
            function(err) {
              if (err) reject(err);
              else resolve({ bookmarked: false });
            }
          );
        } else {
          db.run(
            'INSERT INTO bookmarks (user_id, fanfic_id) VALUES (?, ?)',
            [userId, fanficId],
            function(err) {
              if (err) reject(err);
              else resolve({ bookmarked: true });
            }
          );
        }
      }
    );
  });
};

const getUserBookmark = (userId, fanficId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM bookmarks WHERE user_id = ? AND fanfic_id = ?',
      [userId, fanficId],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
};

const getUserBookmarks = (userId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT f.*, 
             u.username as author_username,
             b.created_at as bookmarked_at
      FROM bookmarks b
      JOIN fanfics f ON b.fanfic_id = f.id
      LEFT JOIN users u ON f.user_id = u.id
      WHERE b.user_id = ? AND f.status = 'approved'
      ORDER BY b.created_at DESC
    `;
    
    db.all(query, [userId], (err, rows) => {
      if (err) reject(err);
      else {
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

// ===== СТАТИСТИКА =====
const getStats = () => {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT 
        COUNT(*) as total_fanfics,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_fanfics,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_fanfics,
        SUM(views) as total_views,
        SUM(likes) as total_likes,
        SUM(word_count) as total_words
      FROM fanfics
    `, [], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

module.exports = {
  initDatabase,
  // Пользователи
  createUser,
  findUserByUsername,
  findUserById,
  verifyUser,
  // Фанфики
  getFanfics,
  getFanficById,
  addFanfic,
  updateFanficStatus,
  updateFanfic,
  getUserFanfics,
  // Лайки
  toggleLike,
  getUserLike,
  // Закладки
  toggleBookmark,
  getUserBookmark,
  getUserBookmarks,
  // Статистика
  getStats
};
