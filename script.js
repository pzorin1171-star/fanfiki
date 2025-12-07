// ===== КОНФИГУРАЦИЯ =====
const API_URL = window.location.origin;
let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentUser = null;
let currentView = 'all'; // 'all', 'my', 'bookmarks'

// ===== ЭЛЕМЕНТЫ DOM =====
const mainPage = document.getElementById('main-page');
const createPage = document.getElementById('create-page');
const viewModal = document.getElementById('view-modal');
const submitModal = document.getElementById('submit-modal');
const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');

// Кнопки навигации
const createBtn = document.getElementById('create-btn');
const backBtn = document.getElementById('back-btn');
const closeModalBtn = document.querySelector('.close-modal');
const modalOkBtn = document.getElementById('modal-ok-btn');

// Элементы аутентификации
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const authButtons = document.getElementById('auth-buttons');
const userMenu = document.getElementById('user-menu');
const usernameDisplay = document.getElementById('username-display');

// Формы
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// Элементы вкладок
const tabAll = document.getElementById('tab-all');
const tabMy = document.getElementById('tab-my');
const tabBookmarks = document.getElementById('tab-bookmarks');

// Фильтры
const searchInput = document.getElementById('search-input');
const genreFilter = document.getElementById('genre-filter');
const ageFilter = document.getElementById('age-filter');

// Контейнеры
const fanficsContainer = document.getElementById('fanfics-container');

// Форма создания фанфика
const submitBtn = document.getElementById('submit-btn');
const fanficTitleInput = document.getElementById('fanfic-title');
const authorNameInput = document.getElementById('author-name');
const contentEditor = document.getElementById('content-editor');
const chapterTitleInput = document.getElementById('chapter-title');

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadCurrentUser();
    updateAuthUI();
    loadFanfics();
    updateStats();
    
    // Проверяем параметры URL
    const urlParams = new URLSearchParams(window.location.search);
    const fanficId = urlParams.get('view');
    if (fanficId) {
        setTimeout(() => openFanfic(fanficId), 500);
    }
});

// ===== СИСТЕМА АУТЕНТИФИКАЦИИ =====
async function loadCurrentUser() {
    try {
        const response = await fetch(`${API_URL}/api/auth/me`);
        const data = await response.json();
        currentUser = data.user;
    } catch (error) {
        console.error('Ошибка загрузки пользователя:', error);
        currentUser = null;
    }
}

async function login(username, password) {
    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateAuthUI();
            hideModal(loginModal);
            showNotification('✅ Вы успешно вошли!');
            loadFanfics();
            return true;
        } else {
            showNotification(data.error || 'Ошибка входа', 'error');
            return false;
        }
    } catch (error) {
        console.error('Ошибка входа:', error);
        showNotification('Ошибка сети', 'error');
        return false;
    }
}

async function register(username, password, email) {
    try {
        const response = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email })
        });
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateAuthUI();
            hideModal(registerModal);
            showNotification('✅ Регистрация успешна!');
            loadFanfics();
            return true;
        } else {
            showNotification(data.error || 'Ошибка регистрации', 'error');
            return false;
        }
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        showNotification('Ошибка сети', 'error');
        return false;
    }
}

async function logout() {
    try {
        await fetch(`${API_URL}/api/auth/logout`, { method: 'POST' });
        currentUser = null;
        updateAuthUI();
        showNotification('👋 Вы вышли из системы');
        if (currentView === 'my' || currentView === 'bookmarks') {
            switchTab('all');
        }
        loadFanfics();
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

function updateAuthUI() {
    if (currentUser) {
        authButtons.style.display = 'none';
        userMenu.style.display = 'flex';
        usernameDisplay.textContent = currentUser.username;
        
        // Обновляем поле автора в форме создания
        if (authorNameInput) {
            authorNameInput.value = currentUser.username;
            authorNameInput.readOnly = false;
        }
        
        // Включаем вкладки для авторизованных
        tabMy.style.display = 'block';
        tabBookmarks.style.display = 'block';
    } else {
        authButtons.style.display = 'flex';
        userMenu.style.display = 'none';
        
        // Сбрасываем поле автора
        if (authorNameInput) {
            authorNameInput.value = '';
            authorNameInput.placeholder = 'Ваше имя или псевдоним';
            authorNameInput.readOnly = false;
        }
        
        // Скрываем вкладки для неавторизованных
        tabMy.style.display = 'none';
        tabBookmarks.style.display = 'none';
    }
}

// ===== УПРАВЛЕНИЕ ВКЛАДКАМИ =====
function switchTab(tabName) {
    currentView = tabName;
    currentPage = 1;
    hasMore = true;
    
    // Обновляем активную вкладку
    [tabAll, tabMy, tabBookmarks].forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Загружаем соответствующие фанфики
    loadFanfics();
}

// ===== ЗАГРУЗКА ФАНФИКОВ =====
async function loadFanfics(reset = true) {
    if (isLoading) return;
    if (reset) {
        currentPage = 1;
        hasMore = true;
        fanficsContainer.innerHTML = '<div class="loading">Загрузка...</div>';
    }
    if (!hasMore) return;
    
    isLoading = true;
    
    try {
        let url = `${API_URL}/api/fanfics?`;
        const params = new URLSearchParams({
            genre: genreFilter.value,
            age: ageFilter.value,
            search: searchInput.value,
            page: currentPage,
            limit: 20
        });
        
        // В зависимости от активной вкладки
        if (currentView === 'my' && currentUser) {
            const response = await fetch(`${API_URL}/api/my/fanfics`, {
                credentials: 'include'
            });
            const fanfics = await response.json();
            displayFanfics(fanfics);
            hasMore = false;
            return;
        } else if (currentView === 'bookmarks' && currentUser) {
            const response = await fetch(`${API_URL}/api/my/bookmarks`, {
                credentials: 'include'
            });
            const fanfics = await response.json();
            displayFanfics(fanfics);
            hasMore = false;
            return;
        }
        
        const response = await fetch(url + params);
        if (!response.ok) throw new Error('Ошибка сервера');
        
        const data = await response.json();
        const newFanfics = data.fanfics || [];
        
        if (reset) {
            fanficsContainer.innerHTML = '';
            if (newFanfics.length === 0) {
                fanficsContainer.innerHTML = '<div class="no-results">Фанфиков не найдено</div>';
                return;
            }
        }
        
        displayFanfics(newFanfics);
        
        if (newFanfics.length < 20) {
            hasMore = false;
        }
        
        currentPage++;
        
    } catch (error) {
        console.error('Ошибка загрузки фанфиков:', error);
        fanficsContainer.innerHTML = '<div class="error">Ошибка загрузки. Попробуйте обновить страницу.</div>';
    } finally {
        isLoading = false;
    }
}

function displayFanfics(fanfics) {
    if (!fanfics || fanfics.length === 0) {
        if (currentPage === 1) {
            fanficsContainer.innerHTML = '<div class="no-results">Фанфиков не найдено</div>';
        }
        return;
    }
    
    const fragment = document.createDocumentFragment();
    
    fanfics.forEach(fanfic => {
        const card = document.createElement('div');
        card.className = 'fanfic-card';
        card.dataset.id = fanfic.id;
        
        const isApproved = fanfic.status === 'approved';
        const statusBadge = isApproved ? '' : '<span class="pending-badge">На модерации</span>';
        
        card.innerHTML = `
            <div class="fanfic-header">
                <span class="age-badge">${fanfic.age_rating || '0+'}</span>
                <span class="genre-badge">${fanfic.genre || 'Не указан'}</span>
                ${statusBadge}
            </div>
            <h3 class="fanfic-title">${fanfic.title}</h3>
            <p class="fanfic-author">👤 ${fanfic.author || 'Аноним'}</p>
            <div class="fanfic-tags">
                ${(fanfic.tags || []).slice(0, 3).map(tag => 
                    `<span class="tag">${tag}</span>`
                ).join('')}
            </div>
            <div class="fanfic-stats">
                <span><i class="fas fa-eye"></i> ${fanfic.views || 0}</span>
                <span><i class="fas fa-heart"></i> ${fanfic.likes || 0}</span>
                <span><i class="fas fa-bookmark"></i> ${fanfic.bookmarks || 0}</span>
                <span>${fanfic.chapter_count || 1} гл.</span>
            </div>
            <button class="read-btn" onclick="openFanfic('${fanfic.id}')">
                <i class="fas fa-book-open"></i> Читать
            </button>
        `;
        
        fragment.appendChild(card);
    });
    
    if (currentPage === 1) {
        fanficsContainer.innerHTML = '';
    }
    
    fanficsContainer.appendChild(fragment);
}

// ===== ОТКРЫТИЕ ФАНФИКА =====
async function openFanfic(id) {
    try {
        const response = await fetch(`${API_URL}/api/fanfics/${id}`);
        if (!response.ok) throw new Error('Фанфик не найден');
        
        const fanfic = await response.json();
        displayFanficModal(fanfic);
        
        // Обновляем URL для возможности поделиться ссылкой
        const url = new URL(window.location);
        url.searchParams.set('view', id);
        window.history.replaceState({}, '', url);
        
    } catch (error) {
        console.error('Ошибка загрузки фанфика:', error);
        showNotification('Фанфик не найден или еще не одобрен', 'error');
    }
}

function displayFanficModal(fanfic) {
    const chapters = fanfic.chapters || [];
    const tags = fanfic.tags || [];
    
    let chaptersHTML = '';
    if (chapters.length > 1) {
        chaptersHTML = `
            <div class="chapters-list">
                <h3><i class="fas fa-list"></i> Содержание (${chapters.length} глав)</h3>
                ${chapters.map((chapter, index) => `
                    <div class="chapter-item" onclick="showChapterInModal(${index})">
                        ${chapter.title}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    const likeBtnHTML = currentUser ? 
        `<button class="like-btn ${fanfic.liked ? 'active' : ''}" onclick="toggleLike('${fanfic.id}')">
            <i class="fas fa-heart"></i> ${fanfic.liked ? 'Убрать лайк' : 'Мне нравится'} (${fanfic.likes})
        </button>` : 
        `<button class="like-btn" onclick="showLoginModal()">
            <i class="fas fa-heart"></i> Мне нравится (${fanfic.likes})
        </button>`;
    
    const bookmarkBtnHTML = currentUser ?
        `<button class="bookmark-btn ${fanfic.bookmarked ? 'active' : ''}" onclick="toggleBookmark('${fanfic.id}')">
            <i class="fas fa-bookmark"></i> ${fanfic.bookmarked ? 'Удалить из закладок' : 'В закладки'} (${fanfic.bookmarks})
        </button>` :
        `<button class="bookmark-btn" onclick="showLoginModal()">
            <i class="fas fa-bookmark"></i> В закладки (${fanfic.bookmarks})
        </button>`;
    
    document.getElementById('fanfic-content').innerHTML = `
        <div class="view-fanfic">
            <h2>${fanfic.title}</h2>
            <div class="fanfic-meta">
                <span><strong>Автор:</strong> ${fanfic.author}</span>
                <span><strong>Жанр:</strong> ${fanfic.genre || 'Не указан'}</span>
                <span><strong>Рейтинг:</strong> ${fanfic.age_rating || '0+'}</span>
                <span><strong>Дата:</strong> ${new Date(fanfic.created_at).toLocaleDateString('ru-RU')}</span>
                ${fanfic.status !== 'approved' ? '<span class="pending-badge">На модерации</span>' : ''}
            </div>
            
            <div class="fanfic-tags">
                ${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
            
            ${chaptersHTML}
            
            <div class="chapter-content" id="current-chapter">
                <h3>${chapters[0]?.title || 'Глава 1'}</h3>
                <div class="content-text">
                    ${formatContent(chapters[0]?.content || fanfic.content || 'Содержание отсутствует')}
                </div>
            </div>
            
            <div class="fanfic-footer">
                <span><i class="fas fa-eye"></i> ${fanfic.views} просмотров</span>
                <div class="action-buttons">
                    ${likeBtnHTML}
                    ${bookmarkBtnHTML}
                </div>
            </div>
        </div>
    `;
    
    // Сохраняем данные фанфика для навигации по главам
    window.currentFanficChapters = chapters;
    
    viewModal.style.display = 'block';
}

function showChapterInModal(index) {
    const chapters = window.currentFanficChapters || [];
    if (chapters[index]) {
        document.querySelector('#current-chapter h3').textContent = chapters[index].title;
        document.querySelector('#current-chapter .content-text').innerHTML = formatContent(chapters[index].content);
        
        // Подсвечиваем активную главу
        document.querySelectorAll('.chapters-list .chapter-item').forEach((item, i) => {
            item.classList.toggle('active', i === index);
        });
    }
}

// ===== ЛАЙКИ И ЗАКЛАДКИ =====
async function toggleLike(fanficId) {
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/fanfics/${fanficId}/like`, {
            method: 'POST',
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success) {
            const likeBtn = document.querySelector('.like-btn');
            const currentLikes = parseInt(likeBtn.textContent.match(/\((\d+)\)/)?.[1] || 0);
            
            if (result.liked) {
                likeBtn.classList.add('active');
                likeBtn.innerHTML = `<i class="fas fa-heart"></i> Убрать лайк (${currentLikes + 1})`;
                showNotification('❤️ Вы поставили лайк');
            } else {
                likeBtn.classList.remove('active');
                likeBtn.innerHTML = `<i class="fas fa-heart"></i> Мне нравится (${currentLikes - 1})`;
                showNotification('💔 Вы убрали лайк');
            }
            
            // Обновляем счетчик в сетке фанфиков
            updateFanficCardCounter(fanficId, 'like', result.liked);
        }
    } catch (error) {
        console.error('Ошибка лайка:', error);
        showNotification('Ошибка при установке лайка', 'error');
    }
}

async function toggleBookmark(fanficId) {
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/fanfics/${fanficId}/bookmark`, {
            method: 'POST',
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success) {
            const bookmarkBtn = document.querySelector('.bookmark-btn');
            const currentBookmarks = parseInt(bookmarkBtn.textContent.match(/\((\d+)\)/)?.[1] || 0);
            
            if (result.bookmarked) {
                bookmarkBtn.classList.add('active');
                bookmarkBtn.innerHTML = `<i class="fas fa-bookmark"></i> Удалить из закладок (${currentBookmarks + 1})`;
                showNotification('🔖 Фанфик добавлен в закладки');
            } else {
                bookmarkBtn.classList.remove('active');
                bookmarkBtn.innerHTML = `<i class="fas fa-bookmark"></i> В закладки (${currentBookmarks - 1})`;
                showNotification('📌 Фанфик удален из закладок');
            }
            
            // Обновляем счетчик в сетке фанфиков
            updateFanficCardCounter(fanficId, 'bookmark', result.bookmarked);
        }
    } catch (error) {
        console.error('Ошибка закладки:', error);
        showNotification('Ошибка при добавлении в закладки', 'error');
    }
}

function updateFanficCardCounter(fanficId, type, increment) {
    const card = document.querySelector(`.fanfic-card[data-id="${fanficId}"]`);
    if (!card) return;
    
    const counterSpan = card.querySelector(`.fa-${type === 'like' ? 'heart' : 'bookmark'}`).parentElement;
    const currentCount = parseInt(counterSpan.textContent) || 0;
    counterSpan.textContent = increment ? currentCount + 1 : Math.max(0, currentCount - 1);
}

// ===== СОЗДАНИЕ ФАНФИКА =====
async function submitFanfic() {
    // Проверяем авторизацию
    if (!currentUser && !confirm('Вы не авторизованы. Отправить фанфик анонимно?')) {
        return;
    }
    
    const title = fanficTitleInput.value.trim();
    const author = authorNameInput.value.trim();
    const genre = document.getElementById('genre').value;
    const ageRating = document.getElementById('age-rating').value;
    const chapterTitle = chapterTitleInput.value;
    const content = contentEditor.value.trim();
    
    // Валидация
    if (!title) {
        showNotification('Введите название фанфика', 'error');
        return;
    }
    if (!author) {
        showNotification('Введите имя автора', 'error');
        return;
    }
    if (!content) {
        showNotification('Напишите содержание главы', 'error');
        return;
    }
    if (content.length < 100) {
        showNotification('Содержание должно быть не менее 100 символов', 'error');
        return;
    }
    
    // Подготавливаем данные
    const fanficData = {
        title,
        author,
        genre,
        age_rating: ageRating,
        tags: window.selectedTags || [],
        chapters: window.chapters || [],
        content: content
    };
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';
    
    try {
        const response = await fetch(`${API_URL}/api/fanfics`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(fanficData),
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('submission-id-value').textContent = result.fanficId;
            submitModal.style.display = 'block';
            resetForm();
            loadFanfics();
        } else {
            throw new Error(result.error || 'Ошибка отправки');
        }
    } catch (error) {
        console.error('Ошибка отправки:', error);
        showNotification('Ошибка отправки: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить на рассмотрение';
    }
}

function resetForm() {
    fanficTitleInput.value = '';
    authorNameInput.value = currentUser ? currentUser.username : '';
    contentEditor.value = '';
    chapterTitleInput.value = 'Глава 1';
    
    window.selectedTags = [];
    window.chapters = [{
        title: "Глава 1",
        content: "",
        createdAt: new Date().toISOString()
    }];
    window.currentChapterIndex = 0;
    
    updateSelectedTags();
    updateChaptersList();
    updateStats();
}

// ===== УПРАВЛЕНИЕ ГЛАВАМИ И ТЕГАМИ (из старого кода) =====
// Инициализация переменных для глав и тегов
window.selectedTags = [];
window.chapters = [{
    title: "Глава 1",
    content: "",
    createdAt: new Date().toISOString()
}];
window.currentChapterIndex = 0;

function toggleTag(tag) {
    const index = window.selectedTags.indexOf(tag);
    if (index === -1) {
        if (window.selectedTags.length >= 3) {
            showNotification('Можно выбрать не более 3 тегов', 'error');
            return;
        }
        window.selectedTags.push(tag);
    } else {
        window.selectedTags.splice(index, 1);
    }
    updateSelectedTags();
}

function updateSelectedTags() {
    const container = document.getElementById('selected-tags');
    if (!container) return;
    
    container.innerHTML = window.selectedTags.map(tag => `
        <span class="selected-tag">
            ${tag} 
            <i class="fas fa-times" onclick="toggleTag('${tag}')"></i>
        </span>
    `).join('');
    
    // Обновляем классы кнопок
    document.querySelectorAll('.tag-btn').forEach(btn => {
        const tag = btn.getAttribute('data-tag');
        if (window.selectedTags.includes(tag)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function addChapter() {
    const chapterCount = window.chapters.length + 1;
    const chapterTitle = `Глава ${chapterCount}`;
    
    // Сохраняем текущую главу
    window.chapters[window.currentChapterIndex].content = contentEditor.value;
    
    // Добавляем новую главу
    window.chapters.push({
        title: chapterTitle,
        content: "",
        createdAt: new Date().toISOString()
    });
    
    // Обновляем UI
    updateChaptersList();
    
    // Переключаемся на новую главу
    switchChapter(window.chapters.length - 1);
}

function updateChaptersList() {
    const chaptersList = document.getElementById('chapters-list');
    if (!chaptersList) return;
    
    chaptersList.innerHTML = window.chapters.map((chapter, index) => `
        <div class="chapter-item ${index === window.currentChapterIndex ? 'active' : ''}" 
             data-index="${index}"
             onclick="switchChapter(${index})">
            <span>${chapter.title}</span>
            <button type="button" class="delete-chapter-btn" onclick="deleteChapter(event, ${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function switchChapter(index) {
    if (index < 0 || index >= window.chapters.length) return;
    
    // Сохраняем текущую главу
    window.chapters[window.currentChapterIndex].content = contentEditor.value;
    
    // Переключаемся
    window.currentChapterIndex = index;
    chapterTitleInput.value = window.chapters[index].title;
    contentEditor.value = window.chapters[index].content;
    
    // Обновляем UI
    updateChaptersList();
    updateStats();
}

function deleteChapter(event, index) {
    event.stopPropagation();
    
    if (window.chapters.length <= 1) {
        showNotification('Должна остаться хотя бы одна глава', 'error');
        return;
    }
    
    if (!confirm('Удалить эту главу?')) return;
    
    window.chapters.splice(index, 1);
    
    // Если удалили текущую главу, переключаемся на предыдущую
    if (window.currentChapterIndex >= index && window.currentChapterIndex > 0) {
        window.currentChapterIndex--;
    }
    
    // Обновляем UI
    updateChaptersList();
    switchChapter(window.currentChapterIndex);
}

function updateStats() {
    const content = contentEditor.value;
    const charCount = content.length;
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    
    const charCountElement = document.getElementById('char-count');
    const wordCountElement = document.getElementById('word-count');
    
    if (charCountElement) charCountElement.textContent = `${charCount} символов`;
    if (wordCountElement) wordCountElement.textContent = `${wordCount} слов`;
}

// ===== УПРАВЛЕНИЕ МОДАЛЬНЫМИ ОКНАМИ =====
function showLoginModal() {
    loginModal.style.display = 'block';
}

function showRegisterModal() {
    registerModal.style.display = 'block';
}

function hideModal(modal) {
    modal.style.display = 'none';
}

// ===== УВЕДОМЛЕНИЯ =====
function showNotification(message, type = 'success') {
    // Удаляем старые уведомления
    const oldNotification = document.querySelector('.notification');
    if (oldNotification) oldNotification.remove();
    
    // Создаем новое уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;
    
    document.body.appendChild(notification);
    
    // Автоматическое удаление через 5 секунд
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function formatContent(content) {
    if (!content) return '<p>Содержание отсутствует</p>';
    return content
        .split('\n')
        .filter(p => p.trim())
        .map(p => `<p>${p}</p>`)
        .join('');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===== НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====
function setupEventListeners() {
    // Навигация
    createBtn?.addEventListener('click', () => {
        if (!currentUser && !confirm('Хотите создать фанфик анонимно?')) {
            showLoginModal();
            return;
        }
        mainPage.classList.remove('active');
        createPage.classList.add('active');
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    });
    
    backBtn?.addEventListener('click', () => {
        if (confirm('Вы уверены? Все несохраненные изменения будут потеряны.')) {
            createPage.classList.remove('active');
            mainPage.classList.add('active');
            resetForm();
        }
    });
    
    // Закрытие модальных окон
    closeModalBtn?.addEventListener('click', () => {
        viewModal.style.display = 'none';
        const url = new URL(window.location);
        url.searchParams.delete('view');
        window.history.replaceState({}, '', url);
    });
    
    modalOkBtn?.addEventListener('click', () => {
        submitModal.style.display = 'none';
        mainPage.classList.add('active');
        createPage.classList.remove('active');
        resetForm();
        loadFanfics();
    });
    
    // Клик вне модального окна
    window.addEventListener('click', (e) => {
        if (e.target === submitModal) submitModal.style.display = 'none';
        if (e.target === viewModal) viewModal.style.display = 'none';
        if (e.target === loginModal) loginModal.style.display = 'none';
        if (e.target === registerModal) registerModal.style.display = 'none';
    });
    
    // Закрытие по ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [submitModal, viewModal, loginModal, registerModal].forEach(modal => {
                if (modal) modal.style.display = 'none';
            });
        }
    });
    
    // Фильтры
    searchInput?.addEventListener('input', debounce(() => {
        currentPage = 1;
        loadFanfics(true);
    }, 300));
    
    genreFilter?.addEventListener('change', () => {
        currentPage = 1;
        loadFanfics(true);
    });
    
    ageFilter?.addEventListener('change', () => {
        currentPage = 1;
        loadFanfics(true);
    });
    
    // Аутентификация
    loginBtn?.addEventListener('click', showLoginModal);
    registerBtn?.addEventListener('click', showRegisterModal);
    logoutBtn?.addEventListener('click', logout);
    
    // Вкладки
    tabAll?.addEventListener('click', () => switchTab('all'));
    tabMy?.addEventListener('click', () => {
        if (!currentUser) {
            showLoginModal();
            return;
        }
        switchTab('my');
    });
    tabBookmarks?.addEventListener('click', () => {
        if (!currentUser) {
            showLoginModal();
            return;
        }
        switchTab('bookmarks');
    });
    
    // Формы
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        
        if (!username || !password) {
            showNotification('Заполните все поля', 'error');
            return;
        }
        
        await login(username, password);
    });
    
    registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('register-username').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value.trim();
        const confirmPassword = document.getElementById('register-confirm-password').value.trim();
        
        if (!username || !password || !confirmPassword) {
            showNotification('Заполните все обязательные поля', 'error');
            return;
        }
        
        if (password.length < 6) {
            showNotification('Пароль должен быть не менее 6 символов', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            showNotification('Пароли не совпадают', 'error');
            return;
        }
        
        await register(username, password, email || null);
    });
    
    // Теги
    document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            toggleTag(tag);
        });
    });
    
    // Главы
    document.getElementById('add-chapter-btn')?.addEventListener('click', addChapter);
    contentEditor?.addEventListener('input', updateStats);
    chapterTitleInput?.addEventListener('input', () => {
        if (window.chapters[window.currentChapterIndex]) {
            window.chapters[window.currentChapterIndex].title = chapterTitleInput.value;
            updateChaptersList();
        }
    });
    
    // Отправка фанфика
    submitBtn?.addEventListener('click', submitFanfic);
    
    // Бесконечная прокрутка
    window.addEventListener('scroll', handleScroll);
}

function handleScroll() {
    if (isLoading || !hasMore) return;
    
    const scrollTop = document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    
    if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadFanfics(false);
    }
}

// ===== ЭКСПОРТ ФУНКЦИЙ В ГЛОБАЛЬНУЮ ОБЛАСТЬ ВИДИМОСТИ =====
window.openFanfic = openFanfic;
window.showChapterInModal = showChapterInModal;
window.toggleTag = toggleTag;
window.switchChapter = switchChapter;
window.deleteChapter = deleteChapter;
window.toggleLike = toggleLike;
window.toggleBookmark = toggleBookmark;
window.showLoginModal = showLoginModal;
window.showRegisterModal = showRegisterModal;
if (window.location.hostname.includes('onrender.com')) {
  setInterval(() => {
    fetch('/ping').catch(() => {});
  }, 5 * 60 * 1000); // 5 минут
}
