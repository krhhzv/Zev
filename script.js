// --- State Management ---
const STORAGE_KEY = 'zev_state_v3';

const defaultState = {
    xp: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,
    logs: [],
    history: {}, 
    hasSeenOnboarding: false 
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;

if (!localStorage.getItem(STORAGE_KEY)) {
    // Migration logic for old versions
    const oldState = JSON.parse(localStorage.getItem('zev_state_v2')) || JSON.parse(localStorage.getItem('zev_state'));
    if (oldState) state = { ...state, ...oldState };
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Utilities ---
function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDaysDifference(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return Infinity;
    const d1 = new Date(dateStr1).setHours(0,0,0,0);
    const d2 = new Date(dateStr2).setHours(0,0,0,0);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function triggerHaptic(type = 'light') {
    if (typeof navigator.vibrate === 'function') {
        const pattern = type === 'light' ? 8 : type === 'medium' ? 15 : [10, 40, 10];
        navigator.vibrate(pattern);
    }
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag])
    );
}

// --- Core Mechanics ---
function checkAndResetDailies() {
    const today = getTodayString();
    if (state.lastActiveDate && state.lastActiveDate !== today) {
        state.logs = []; 
        const diff = getDaysDifference(state.lastActiveDate, today);
        if (diff > 1) state.streak = 0; 
    }
    saveState();
}

function addAction(name, points) {
    const today = getTodayString();
    const isNewDayAction = state.lastActiveDate !== today;

    if (isNewDayAction) {
        const diff = getDaysDifference(state.lastActiveDate, today);
        state.streak = (diff === 1 || !state.lastActiveDate) ? state.streak + 1 : 1;
        state.lastActiveDate = today;
    }

    state.xp += points;
    state.history[today] = (state.history[today] || 0) + points;
    
    let targetXp = state.level * 100;
    while (state.xp >= targetXp) {
        state.xp -= targetXp;
        state.level += 1;
        targetXp = state.level * 100;
        triggerHaptic('heavy');
    }

    const newLog = { 
        id: Date.now().toString(), 
        name, 
        points,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    };
    state.logs.unshift(newLog);
    state.hasSeenOnboarding = true;
    
    triggerHaptic('light');
    saveState();
    renderUI();
}

function deleteAction(id) {
    const index = state.logs.findIndex(l => l.id === id);
    if (index === -1) return;
    const log = state.logs[index];

    state.xp -= log.points;
    while (state.xp < 0 && state.level > 1) {
        state.level -= 1;
        state.xp += state.level * 100;
    }
    if (state.xp < 0) state.xp = 0; 

    const today = getTodayString();
    if (state.history[today]) {
        state.history[today] -= log.points;
        if (state.history[today] <= 0) delete state.history[today];
    }

    state.logs.splice(index, 1);
    triggerHaptic('medium');
    saveState();
    renderUI();
}

// --- UI Rendering ---
function renderUI() {
    // Stats
    document.getElementById('level-display').textContent = state.level;
    document.getElementById('streak-display').textContent = state.streak;
    document.getElementById('xp-current').textContent = state.xp;
    const targetXp = state.level * 100;
    document.getElementById('xp-target').textContent = targetXp;
    const progressPercent = Math.min((state.xp / targetXp) * 100, 100);
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;

    // Grid
    const gridEl = document.getElementById('progress-grid');
    gridEl.innerHTML = '';
    const d = new Date();
    for (let i = 29; i >= 0; i--) {
        const checkDate = new Date(d);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        
        const unit = document.createElement('div');
        unit.className = 'grid-unit';
        const dayXp = state.history[dateStr] || 0;
        if (dayXp > 0) {
            if (dayXp < 25) unit.classList.add('intensity-1');
            else if (dayXp < 50) unit.classList.add('intensity-2');
            else if (dayXp < 125) unit.classList.add('intensity-3');
            else unit.classList.add('intensity-4');
        }
        gridEl.appendChild(unit);
    }

    // Logs
    const logListEl = document.getElementById('log-list');
    logListEl.innerHTML = '';
    if (state.logs.length === 0) {
        logListEl.innerHTML = `
            <div class="void-state">
                ${state.hasSeenOnboarding ? 'NO ACTIVITY RECORDED FOR CURRENT CYCLE' : 'AWAITING INITIAL LOG ENTRY'}
            </div>
        `;
    } else {
        state.logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'log-item-minimal';
            item.dataset.id = log.id; 
            item.innerHTML = `
                <div class="log-content">
                    <span class="log-title">${escapeHTML(log.name)}</span>
                    <span class="log-meta">${log.timestamp} // UTC</span>
                </div>
                <span class="log-points-badge">+${log.points} XP</span>
            `;
            logListEl.appendChild(item);
        });
    }
}

// --- PWA Interface ---
let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'block';
});

installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBtn.style.display = 'none';
    deferredPrompt = null;
});

// --- Controls ---
function setupControls() {
    const points = document.getElementById('action-points');
    document.getElementById('step-up').addEventListener('click', () => {
        let val = parseInt(points.value);
        if (val < 999) { points.value = val + 5; triggerHaptic('light'); }
    });
    document.getElementById('step-down').addEventListener('click', () => {
        let val = parseInt(points.value);
        if (val > 5) { points.value = val - 5; triggerHaptic('light'); }
    });

    const logList = document.getElementById('log-list');
    let startX = 0;
    let activeItem = null;

    logList.addEventListener('touchstart', e => {
        const item = e.target.closest('.log-item-minimal');
        if (!item) return;
        activeItem = item;
        startX = e.touches[0].clientX;
        activeItem.style.transition = 'none'; 
    }, { passive: true });

    logList.addEventListener('touchmove', e => {
        if (!activeItem) return;
        const deltaX = e.touches[0].clientX - startX;
        if (deltaX < 0) { 
            activeItem.style.transform = `translateX(${deltaX}px)`;
            activeItem.style.opacity = 1 - (Math.abs(deltaX) / 100);
        }
    }, { passive: true });

    logList.addEventListener('touchend', e => {
        if (!activeItem) return;
        const deltaX = e.changedTouches[0].clientX - startX;
        activeItem.style.transition = `transform 0.4s var(--easing), opacity 0.4s ease`;

        if (deltaX < -65) { 
            activeItem.style.transform = `translateX(-100%)`;
            activeItem.style.opacity = '0';
            const id = activeItem.dataset.id;
            setTimeout(() => deleteAction(id), 250);
        } else { 
            activeItem.style.transform = `translateX(0)`;
            activeItem.style.opacity = '1';
        }
        activeItem = null;
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    checkAndResetDailies();
    renderUI();
    setupControls();

    const form = document.getElementById('action-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('action-name');
        const pointsInput = document.getElementById('action-points');
        const name = nameInput.value.trim();
        const points = parseInt(pointsInput.value, 10);
        if (name && points > 0) {
            addAction(name, points);
            nameInput.value = '';
            pointsInput.value = '10';
            nameInput.focus({ preventScroll: true }); 
        }
    });
});
