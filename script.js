// ===== КОНФИГУРАЦИЯ =====
const API_URL = window.location.origin;
let currentPage = 1;
let isLoading = false;
let hasMore = true;

// ===== ЭЛЕМЕНТЫ DOM =====
const mainPage = document.getElementById('main-page');
const createPage = document.getElementById('create-page');
const createBtn = document.getElementById('create-btn');
const backBtn = document.getElementById('back-btn');
const fanficsContainer = document.getElementById('fanfics-container');
const searchInput = document.getElementById('search-input');
const genreFilter = document.getElementById('genre-filter');
const ageFilter = document.getElementById('age-filter');
const submitBtn = document.getElementById('submit-btn');
const submitModal = document.getElementById('submit-modal');
const modalOkBtn = document.getElementById('modal-ok-btn');
const viewModal = document.getElementById('view-modal');
const closeModalBtn = document.querySelector('.close-modal');

// ===== ПЕРЕМЕННЫЕ =====
let selectedTags = [];
let chapters = [
    {
        title: "Глава 1",
        content: "",
        createdAt: new Date().toISOString()
    }
];
let currentChapterIndex = 0;

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', () => {
    loadFanfics();
    setupEventListeners();
    updateStats();
    
    // Проверяем параметры URL для открытия фанфика
    const urlParams = new URLSearchParams(window.location.search);
    const fanficId = urlParams.get('view');
    if (fanficId) {
        setTimeout(() => openFanfic(fanficId), 500);
    }
});

// ===== НАСТРОЙКА ОБРАБОТЧИКОВ =====
function setupEventListeners() {
    // Навигация
    createBtn.addEventListener('click', () => {
        mainPage.classList.remove('active');
        createPage.classList.add('active');
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    });
    
    backBtn.addEventListener('click', () => {
        if (confirm('Вы уверены? Все несохраненные изменения будут потеряны.')) {
            createPage.classList.remove('active');
            mainPage.classList.add('active');
            resetForm();
        }
    });
    
    // Фильтры
    searchInput.addEventListener('input', debounce(loadFanfics, 300));
    genreFilter.addEventListener('change', loadFanfics);
    ageFilter.addEventListener('change', loadFanfics);
    
    // Теги
    document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            toggleTag(tag);
        });
    });
    
    // Отправка фанфика
    submitBtn.addEventListener('click', submitFanfic);
    
    // Главы
    document.getElementById('add-chapter-btn').addEventListener('click', addChapter);
    document.getElementById('content-editor').addEventListener('input', updateStats);
    document.getElementById('chapter-title').addEventListener('input', updateChapterTitle);
    
    // Модальные окна
    modalOkBtn.addEventListener('click', () => {
        submitModal.style.display = 'none';
        mainPage.classList.add('active');
        createPage.classList.remove('active');
        resetForm();
        loadFanfics();
    });
    
    closeModalBtn.addEventListener('click', () => {
        viewModal.style.display = 'none';
        // Очищаем параметр view из URL
        const url = new URL(window.location);
        url.searchParams.delete('view');
        window.history.replaceState({}, '', url);
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === submitModal) submitModal.style.display = 'none';
        if (e.target === viewModal) viewModal.style.display = 'none';
    });
    
    // Закрытие по ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            submitModal.style.display = 'none';
            viewModal.style.display = 'none';
        }
    });
    
    // Загрузка по прокрутке
    window.addEventListener('scroll', handleScroll);
}

// ===== ЗАГРУЗКА ФАНФИКОВ =====
async function loadFanfics(reset = true) {
    if (isLoading) return;
    
    if (reset) {
        currentPage = 1;
        hasMore = true;
        fanficsContainer.innerHTML = '<div class="loading">Загрузка фанфиков...</div>';
    }
    
    if (!hasMore) return;
    
    isLoading = true;
    
    try {
        const params = new URLSearchParams({
            genre: genreFilter.value,
            age: ageFilter.value,
            search: searchInput.value,
            page: currentPage
        });
        
        const response = await fetch(`${API_URL}/api/fanfics?${params}`);
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

function handleScroll() {
    const scrollTop = document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    
    if (scrollTop + clientHeight >= scrollHeight - 100 && !isLoading && hasMore) {
        loadFanfics(false);
    }
}

// ===== ОТОБРАЖЕНИЕ ФАНФИКОВ =====
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
        
        card.innerHTML = `
            <div class="fanfic-header">
                <span class="age-badge">${fanfic.age_rating || '0+'}</span>
                <span class="genre-badge">${fanfic.genre || 'Не указан'}</span>
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
                <span>${(fanfic.chapters || []).length || 1} гл.</span>
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
        
        // Парсим данные
        const tags = fanfic.tags || [];
        const fanficChapters = fanfic.chapters || [];
        
        let chaptersHTML = '';
        if (fanficChapters.length > 1) {
            chaptersHTML = `
                <div class="chapters-list">
                    <h3><i class="fas fa-list"></i> Содержание (${fanficChapters.length} глав)</h3>
                    ${fanficChapters.map((chapter, index) => `
                        <div class="chapter-item" onclick="showChapterInModal(${index})">
                            ${chapter.title}
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        document.getElementById('fanfic-content').innerHTML = `
            <div class="view-fanfic">
                <h2>${fanfic.title}</h2>
                <div class="fanfic-meta">
                    <span><strong>Автор:</strong> ${fanfic.author}</span>
                    <span><strong>Жанр:</strong> ${fanfic.genre || 'Не указан'}</span>
                    <span><strong>Рейтинг:</strong> ${fanfic.age_rating || '0+'}</span>
                    <span><strong>Дата публикации:</strong> ${new Date(fanfic.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
                
                <div class="fanfic-tags">
                    ${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
                
                ${chaptersHTML}
                
                <div class="chapter-content" id="current-chapter">
                    <h3>${fanficChapters[0]?.title || 'Глава 1'}</h3>
                    <div class="content-text">
                        ${formatContent(fanficChapters[0]?.content || fanfic.content || 'Содержание отсутствует')}
                    </div>
                </div>
                
                <div class="fanfic-footer">
                    <span><i class="fas fa-eye"></i> ${fanfic.views || 0} просмотров</span>
                    <button class="like-btn" onclick="likeFanfic('${fanfic.id}')">
                        <i class="fas fa-heart"></i> Мне нравится (${fanfic.likes || 0})
                    </button>
                </div>
            </div>
        `;
        
        // Сохраняем главы для навигации
        window.currentFanficChapters = fanficChapters;
        
        viewModal.style.display = 'block';
        
        // Обновляем URL для возможности поделиться ссылкой
        const url = new URL(window.location);
        url.searchParams.set('view', id);
        window.history.replaceState({}, '', url);
        
    } catch (error) {
        console.error('Ошибка загрузки фанфика:', error);
        alert('Фанфик не найден или еще не одобрен.');
    }
}

window.openFanfic = openFanfic;

// ===== ПОКАЗ ГЛАВЫ =====
window.showChapterInModal = function(index) {
    const chapters = window.currentFanficChapters || [];
    if (chapters[index]) {
        document.querySelector('#current-chapter h3').textContent = chapters[index].title;
        document.querySelector('#current-chapter .content-text').innerHTML = formatContent(chapters[index].content);
        
        // Подсвечиваем активную главу
        document.querySelectorAll('.chapters-list .chapter-item').forEach((item, i) => {
            item.classList.toggle('active', i === index);
        });
    }
};

// ===== ОТПРАВКА ФАНФИКА =====
async function submitFanfic() {
    const title = document.getElementById('fanfic-title').value.trim();
    const author = document.getElementById('author-name').value.trim();
    const genre = document.getElementById('genre').value;
    const ageRating = document.getElementById('age-rating').value;
    const chapterTitle = document.getElementById('chapter-title').value;
    const content = document.getElementById('content-editor').value.trim();
    
    // Валидация
    if (!title) {
        alert('Введите название фанфика');
        return;
    }
    if (!author) {
        alert('Введите имя автора');
        return;
    }
    if (!content) {
        alert('Напишите содержание главы');
        return;
    }
    if (content.length < 100) {
        alert('Содержание главы должно быть не менее 100 символов');
        return;
    }
    
    // Обновляем текущую главу
    chapters[currentChapterIndex] = {
        title: chapterTitle,
        content: content,
        createdAt: new Date().toISOString()
    };
    
    const fanficData = {
        title,
        author,
        genre,
        age_rating: ageRating,
        tags: selectedTags,
        chapters: chapters,
        content: content
    };
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';
    
    try {
        const response = await fetch(`${API_URL}/api/fanfics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fanficData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('submission-id-value').textContent = result.fanficId;
            submitModal.style.display = 'block';
        } else {
            throw new Error(result.error || 'Ошибка отправки');
        }
    } catch (error) {
        alert('Ошибка отправки: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить на рассмотрение';
    }
}

// ===== ЛАЙК =====
async function likeFanfic(fanficId) {
    try {
        const response = await fetch(`${API_URL}/api/fanfics/${fanficId}/like`, {
            method: 'POST'
        });
        
        if (response.ok) {
            const result = await response.json();
            const likeBtn = document.querySelector('.like-btn');
            likeBtn.innerHTML = `<i class="fas fa-heart"></i> Мне нравится (${result.likes})`;
            likeBtn.disabled = true;
            likeBtn.style.opacity = '0.7';
            alert('Спасибо за лайк!');
        }
    } catch (error) {
        console.error('Ошибка лайка:', error);
    }
}

window.likeFanfic = likeFanfic;

// ===== ТЕГИ =====
function toggleTag(tag) {
    const index = selectedTags.indexOf(tag);
    if (index === -1) {
        if (selectedTags.length >= 3) {
            alert('Можно выбрать не более 3 тегов');
            return;
        }
        selectedTags.push(tag);
    } else {
        selectedTags.splice(index, 1);
    }
    updateSelectedTags();
}

function updateSelectedTags() {
    const container = document.getElementById('selected-tags');
    container.innerHTML = selectedTags.map(tag => `
        <span class="selected-tag">
            ${tag} 
            <i class="fas fa-times" onclick="toggleTag('${tag}')"></i>
        </span>
    `).join('');
    
    // Обновляем классы кнопок
    document.querySelectorAll('.tag-btn').forEach(btn => {
        const tag = btn.getAttribute('data-tag');
        if (selectedTags.includes(tag)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

window.toggleTag = toggleTag;

// ===== ГЛАВЫ =====
function addChapter() {
    const chapterCount = chapters.length + 1;
    const chapterTitle = `Глава ${chapterCount}`;
    
    // Сохраняем текущую главу
    chapters[currentChapterIndex].content = document.getElementById('content-editor').value;
    
    // Добавляем новую главу
    chapters.push({
        title: chapterTitle,
        content: "",
        createdAt: new Date().toISOString()
    });
    
    // Обновляем UI
    updateChaptersList();
    
    // Переключаемся на новую главу
    switchChapter(chapters.length - 1);
}

function updateChaptersList() {
    const chaptersList = document.getElementById('chapters-list');
    chaptersList.innerHTML = chapters.map((chapter, index) => `
        <div class="chapter-item ${index === currentChapterIndex ? 'active' : ''}" 
             data-index="${index}"
             onclick="switchChapter(${index})">
            <span>${chapter.title}</span>
            <button type="button" class="delete-chapter-btn" onclick="deleteChapter(event, ${index})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

window.switchChapter = function(index) {
    if (index < 0 || index >= chapters.length) return;
    
    // Сохраняем текущую главу
    chapters[currentChapterIndex].content = document.getElementById('content-editor').value;
    
    // Переключаемся
    currentChapterIndex = index;
    document.getElementById('chapter-title').value = chapters[index].title;
    document.getElementById('content-editor').value = chapters[index].content;
    
    // Обновляем UI
    updateChaptersList();
    updateStats();
};

window.deleteChapter = function(event, index) {
    event.stopPropagation();
    
    if (chapters.length <= 1) {
        alert('Должна остаться хотя бы одна глава');
        return;
    }
    
    if (!confirm('Удалить эту главу?')) return;
    
    chapters.splice(index, 1);
    
    // Если удалили текущую главу, переключаемся на предыдущую
    if (currentChapterIndex >= index && currentChapterIndex > 0) {
        currentChapterIndex--;
    }
    
    // Обновляем UI
    updateChaptersList();
    switchChapter(currentChapterIndex);
};

function updateChapterTitle() {
    chapters[currentChapterIndex].title = document.getElementById('chapter-title').value;
    updateChaptersList();
}

// ===== СТАТИСТИКА =====
function updateStats() {
    const content = document.getElementById('content-editor').value;
    const charCount = content.length;
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    
    document.getElementById('char-count').textContent = `${charCount} символов`;
    document.getElementById('word-count').textContent = `${wordCount} слов`;
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function resetForm() {
    document.getElementById('fanfic-title').value = '';
    document.getElementById('author-name').value = '';
    document.getElementById('content-editor').value = '';
    document.getElementById('chapter-title').value = 'Глава 1';
    selectedTags = [];
    chapters = [{
        title: "Глава 1",
        content: "",
        createdAt: new Date().toISOString()
    }];
    currentChapterIndex = 0;
    
    updateSelectedTags();
    updateChaptersList();
    updateStats();
}

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
