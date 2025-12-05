// Конфигурация API
const API_URL = window.location.origin;

// Элементы DOM
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

// Текущие данные
let currentFanfics = [];
let selectedTags = [];
let chapters = [
    {
        title: "Глава 1",
        content: "",
        createdAt: new Date().toISOString()
    }
];
let currentChapterIndex = 0;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadFanfics();
    setupEventListeners();
    updateStats();
});

// Настройка обработчиков событий
function setupEventListeners() {
    createBtn.addEventListener('click', () => {
        mainPage.classList.remove('active');
        createPage.classList.add('active');
    });
    
    backBtn.addEventListener('click', () => {
        if (confirm('Вы уверены? Все несохраненные изменения будут потеряны.')) {
            createPage.classList.remove('active');
            mainPage.classList.add('active');
            resetForm();
        }
    });
    
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
}

// Загрузка фанфиков
async function loadFanfics() {
    try {
        fanficsContainer.innerHTML = '<div class="loading">Загрузка фанфиков...</div>';
        
        const params = new URLSearchParams({
            genre: genreFilter.value,
            age: ageFilter.value,
            search: searchInput.value,
            status: 'approved'
        });
        
        const response = await fetch(`${API_URL}/api/fanfics?${params}`);
        if (!response.ok) throw new Error('Ошибка сервера');
        
        currentFanfics = await response.json();
        displayFanfics(currentFanfics);
    } catch (error) {
        console.error('Ошибка загрузки фанфиков:', error);
        fanficsContainer.innerHTML = '<div class="error">Ошибка загрузки фанфиков. Проверьте подключение к серверу.</div>';
    }
}

// Отображение фанфиков
function displayFanfics(fanfics) {
    if (!fanfics || fanfics.length === 0) {
        fanficsContainer.innerHTML = '<div class="no-results">Фанфиков не найдено</div>';
        return;
    }
    
    fanficsContainer.innerHTML = fanfics.map(fanfic => `
        <div class="fanfic-card">
            <div class="fanfic-header">
                <span class="age-badge">${fanfic.age_rating || '0+'}</span>
                <span class="genre-badge">${fanfic.genre || 'Не указан'}</span>
            </div>
            <h3 class="fanfic-title">${fanfic.title}</h3>
            <p class="fanfic-author">👤 ${fanfic.author || 'Аноним'}</p>
            <div class="fanfic-tags">
                ${(fanfic.tags || []).slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
            <div class="fanfic-stats">
                <span><i class="fas fa-eye"></i> ${fanfic.views || 0}</span>
                <span><i class="fas fa-heart"></i> ${fanfic.likes || 0}</span>
                <span>${(fanfic.chapters || []).length || 1} гл.</span>
            </div>
            <button class="read-btn" onclick="openFanfic('${fanfic.id}')">
                <i class="fas fa-book-open"></i> Читать
            </button>
        </div>
    `).join('');
}

// Открыть фанфик
async function openFanfic(id) {
    try {
        const response = await fetch(`${API_URL}/api/fanfics/${id}`);
        if (!response.ok) throw new Error('Фанфик не найден');
        
        const fanfic = await response.json();
        
        // Парсим данные
        const tags = typeof fanfic.tags === 'string' ? JSON.parse(fanfic.tags) : fanfic.tags || [];
        const fanficChapters = typeof fanfic.chapters === 'string' ? JSON.parse(fanfic.chapters) : fanfic.chapters || [];
        
        document.getElementById('fanfic-content').innerHTML = `
            <div class="view-fanfic">
                <h2>${fanfic.title}</h2>
                <div class="fanfic-meta">
                    <span><strong>Автор:</strong> ${fanfic.author}</span>
                    <span><strong>Жанр:</strong> ${fanfic.genre}</span>
                    <span><strong>Рейтинг:</strong> ${fanfic.age_rating}</span>
                    <span><strong>Дата:</strong> ${new Date(fanfic.createdAt).toLocaleDateString('ru-RU')}</span>
                </div>
                
                <div class="fanfic-tags">
                    ${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
                
                ${fanficChapters.length > 1 ? `
                <div class="chapters-list">
                    <h3><i class="fas fa-list"></i> Содержание</h3>
                    ${fanficChapters.map((chapter, index) => `
                        <div class="chapter-item" onclick="showChapter(this, ${index})">
                            ${chapter.title}
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                
                <div class="chapter-content">
                    <h3>${fanficChapters[0]?.title || 'Глава 1'}</h3>
                    <div class="content-text">
                        ${formatContent(fanficChapters[0]?.content || '')}
                    </div>
                </div>
                
                <div class="fanfic-footer">
                    <span><i class="fas fa-eye"></i> ${fanfic.views || 0} просмотров</span>
                    <button class="like-btn" onclick="likeFanfic('${fanfic.id}')">
                        <i class="fas fa-heart"></i> Нравится (${fanfic.likes || 0})
                    </button>
                </div>
            </div>
        `;
        
        viewModal.style.display = 'block';
    } catch (error) {
        alert('Ошибка загрузки фанфика: ' + error.message);
    }
}

window.openFanfic = openFanfic;

// Показать главу
window.showChapter = (element, index) => {
    document.querySelectorAll('.chapters-list .chapter-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
    
    const fanfic = currentFanfics.find(f => f.id === element.dataset.id);
    if (fanfic && fanfic.chapters[index]) {
        document.querySelector('.chapter-content h3').textContent = fanfic.chapters[index].title;
        document.querySelector('.chapter-content .content-text').innerHTML = formatContent(fanfic.chapters[index].content);
    }
};

// Отправить фанфик
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
            document.getElementById('submission-id-value').textContent = result.submissionId;
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

// Вспомогательные функции
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

function updateStats() {
    const content = document.getElementById('content-editor').value;
    const charCount = content.length;
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    
    document.getElementById('char-count').textContent = `${charCount} символов`;
    document.getElementById('word-count').textContent = `${wordCount} слов`;
}

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

async function likeFanfic(fanficId) {
    try {
        const response = await fetch(`${API_URL}/api/fanfics/${fanficId}/like`, {
            method: 'POST'
        });
        if (response.ok) {
            const result = await response.json();
            document.querySelector('.like-btn').innerHTML = 
                `<i class="fas fa-heart"></i> Нравится (${result.likes})`;
        }
    } catch (error) {
        console.error('Ошибка лайка:', error);
    }
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

// Экспортируем функции для использования в HTML
window.showChapter = showChapter;
window.deleteChapter = deleteChapter;
window.switchChapter = switchChapter;
window.likeFanfic = likeFanfic;
