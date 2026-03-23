const SUPABASE_URL = 'https://hbitsxaeonshucmvidkv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiaXRzeGFlb25zaHVjbXZpZGt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTIxMTMsImV4cCI6MjA4OTgyODExM30.f03W2uuKWuOV4dWQbhnClzjXIyqp_U5N3lx7vTwaa8U';

const PRIORITY_MAP = {
    1: { label: 'Dusuk', class: 'low' },
    2: { label: 'Orta', class: 'medium' },
    3: { label: 'Yuksek', class: 'high' }
};

const MONTHS_TR = [
    'Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran',
    'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'
];

// --- State ---
let accessToken = null;
let currentUser = null;
let userTags = [];
let activeTodosData = [];
let notifiedIds = new Set();
let notifInterval = null;

// Settings (persisted in localStorage)
let settings = {
    reminderMinutes: 15,
    defaultPriority: 2,
    notificationsEnabled: false
};

function loadSettings() {
    const stored = localStorage.getItem('todo_settings');
    if (stored) {
        try { Object.assign(settings, JSON.parse(stored)); } catch {}
    }
}

function saveSettings() {
    localStorage.setItem('todo_settings', JSON.stringify(settings));
}

loadSettings();

// --- DOM ---
const authSection = document.getElementById('authSection');
const appSection = document.getElementById('appSection');
const userEmailEl = document.getElementById('userEmail');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginMsg = document.getElementById('loginMsg');
const registerMsg = document.getElementById('registerMsg');
const logoutBtn = document.getElementById('logoutBtn');
const todoInput = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const dueDateInput = document.getElementById('dueDateInput');
const priorityInput = document.getElementById('priorityInput');
const tagsInput = document.getElementById('tagsInput');
const activeTodosEl = document.getElementById('activeTodos');
const completedTodosEl = document.getElementById('completedTodos');
const notifBtn = document.getElementById('notifBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const topBarLeft = document.querySelector('.top-bar-left');
const topBarRight = document.querySelector('.top-bar-right');
const newTagName = document.getElementById('newTagName');
const newTagColor = document.getElementById('newTagColor');
const addTagBtn = document.getElementById('addTagBtn');
const tagList = document.getElementById('tagList');

// --- Auth helpers ---
function authHeaders() {
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };
}

function showMsg(el, text, type) {
    el.textContent = text;
    el.className = 'auth-msg ' + type;
}

function showApp(user) {
    currentUser = user;
    accessToken = user.access_token || accessToken;
    userEmailEl.textContent = user.email;
    authSection.style.display = 'none';
    appSection.style.display = 'block';
    topBarLeft.style.display = 'flex';
    topBarRight.style.display = 'flex';
    priorityInput.value = settings.defaultPriority;
    if (settings.notificationsEnabled && Notification.permission === 'granted') {
        notifBtn.classList.add('active');
    }
    loadUserTags();
    loadTodos();
    startNotificationChecker();
}

function showAuth() {
    currentUser = null;
    accessToken = null;
    localStorage.removeItem('sb_session');
    authSection.style.display = 'block';
    appSection.style.display = 'none';
    topBarLeft.style.display = 'none';
    topBarRight.style.display = 'none';
    activeTodosEl.innerHTML = '';
    completedTodosEl.innerHTML = '';
    activeTodosData = [];
    notifiedIds.clear();
    if (notifInterval) {
        clearInterval(notifInterval);
        notifInterval = null;
    }
}

// Hide top bar buttons initially
topBarLeft.style.display = 'none';
topBarRight.style.display = 'none';

// --- Auth tabs ---
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        loginForm.style.display = target === 'login' ? 'flex' : 'none';
        registerForm.style.display = target === 'register' ? 'flex' : 'none';
        loginMsg.textContent = '';
        registerMsg.textContent = '';
    });
});

// --- Register ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    registerMsg.textContent = '';

    submitBtn.disabled = true;
    submitBtn.textContent = 'Gonderiliyor...';

    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            password,
            options: { emailRedirectTo: 'https://pkozdilek.github.io/todo/' }
        })
    });
    const data = await res.json();

    if (res.ok) {
        if (data.identities && data.identities.length === 0) {
            showMsg(registerMsg, 'Bu e-posta zaten kayitli.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Kayit Ol';
        } else {
            showMsg(registerMsg, 'Kayit basarili! E-postani kontrol et ve onay linkine tikla.', 'success');
        }
    } else {
        showMsg(registerMsg, data.error_description || data.msg || 'Kayit hatasi.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Kayit Ol';
    }
});

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    loginMsg.textContent = '';

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok) {
        localStorage.setItem('sb_session', JSON.stringify({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            email: data.user.email
        }));
        accessToken = data.access_token;
        showApp({ email: data.user.email, access_token: data.access_token, refresh_token: data.refresh_token });
    } else {
        showMsg(loginMsg, data.error_description || 'Giris hatasi. E-postani onayladigindan emin ol.', 'error');
    }
});

// --- Logout ---
logoutBtn.addEventListener('click', () => {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${accessToken}` }
    });
    showAuth();
});

// --- Session restore ---
async function restoreSession() {
    const stored = localStorage.getItem('sb_session');
    if (!stored) return;
    const session = JSON.parse(stored);

    accessToken = session.access_token;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.ok) {
        showApp({ email: session.email, access_token: session.access_token });
        return;
    }

    if (session.refresh_token) {
        const refreshRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: session.refresh_token })
        });
        if (refreshRes.ok) {
            const data = await refreshRes.json();
            localStorage.setItem('sb_session', JSON.stringify({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                email: data.user.email
            }));
            accessToken = data.access_token;
            showApp({ email: data.user.email, access_token: data.access_token });
            return;
        }
    }

    showAuth();
}

// --- Handle email confirmation redirect ---
async function handleAuthRedirect() {
    const hash = window.location.hash;

    if (hash && hash.includes('access_token')) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token');
        if (access_token) {
            accessToken = access_token;
            const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${access_token}` }
            });
            const user = await userRes.json();
            localStorage.setItem('sb_session', JSON.stringify({
                access_token, refresh_token, email: user.email
            }));
            window.location.hash = '';
            showApp({ email: user.email, access_token });
            return true;
        }
    }

    if (hash && hash.includes('error')) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const errorDesc = hashParams.get('error_description');
        window.location.hash = '';
        if (errorDesc) {
            showMsg(loginMsg, errorDesc.replace(/\+/g, ' '), 'error');
        }
        return true;
    }

    return false;
}

// --- Todo CRUD ---
function getMonthKey(dateStr) {
    if (!dateStr) return 'Tarihsiz';
    const d = new Date(dateStr);
    return `${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`;
}

function groupByMonth(todos) {
    const groups = {};
    todos.forEach(todo => {
        const key = getMonthKey(todo.due_date);
        if (!groups[key]) groups[key] = [];
        groups[key].push(todo);
    });
    return groups;
}

function renderGroupedTodos(groups, container, isDoneList) {
    container.innerHTML = '';
    const keys = Object.keys(groups);
    const colCount = 8;
    // Sort: dated months chronologically, 'Tarihsiz' last
    keys.sort((a, b) => {
        if (a === 'Tarihsiz') return 1;
        if (b === 'Tarihsiz') return -1;
        const parse = k => {
            const parts = k.split(' ');
            return new Date(parseInt(parts[1]), MONTHS_TR.indexOf(parts[0]));
        };
        return parse(a) - parse(b);
    });

    keys.forEach(key => {
        const headerRow = document.createElement('tr');
        headerRow.className = 'month-header-row';
        const headerCell = document.createElement('td');
        headerCell.colSpan = colCount;
        headerCell.className = 'month-header';
        headerCell.textContent = key;
        headerRow.appendChild(headerCell);
        container.appendChild(headerRow);

        groups[key].forEach(todo => {
            addTodoToDOM(todo, container);
        });
    });
}

async function loadTodos() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/todos?order=priority.desc,due_date.asc.nullslast,created_at.asc`,
        { headers: authHeaders() }
    );
    const todos = await res.json();
    activeTodosData = [];

    if (!Array.isArray(todos)) return;

    const activeTodos = [];
    const completedTodos = [];
    const now = new Date();

    for (const todo of todos) {
        // Mark overdue if due_date passed and not done and not already marked
        if (!todo.done && todo.due_date && new Date(todo.due_date) < now && !todo.overdue) {
            todo.overdue = true;
            // Fire-and-forget update
            updateTodo(todo.id, { overdue: true });
        }

        if (todo.done) {
            completedTodos.push(todo);
        } else {
            activeTodos.push(todo);
            activeTodosData.push(todo);
        }
    }

    const activeGroups = groupByMonth(activeTodos);
    const completedGroups = groupByMonth(completedTodos);

    renderGroupedTodos(activeGroups, activeTodosEl, false);
    renderGroupedTodos(completedGroups, completedTodosEl, true);
}

async function addTodoFn() {
    const text = todoInput.value.trim();
    if (!text) return;

    const due_date = dueDateInput.value ? new Date(dueDateInput.value).toISOString() : null;
    const priority = parseInt(priorityInput.value);
    const tagNames = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
    const tags = tagNames.map(name => {
        const found = userTags.find(ut => ut.name.toLowerCase() === name.toLowerCase());
        return { name, color: found ? found.color : '#e94560' };
    });

    const res = await fetch(`${SUPABASE_URL}/rest/v1/todos`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text, done: false, due_date, priority, tags, overdue: false })
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
        loadTodos();
    }
    todoInput.value = '';
    dueDateInput.value = '';
    priorityInput.value = settings.defaultPriority;
    tagsInput.value = '';
    todoInput.focus();
}

async function updateTodo(id, data) {
    await fetch(`${SUPABASE_URL}/rest/v1/todos?id=eq.${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
}

async function deleteTodo(id) {
    await fetch(`${SUPABASE_URL}/rest/v1/todos?id=eq.${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
}

function addTodoToDOM(todo, container) {
    const { id, text, done, due_date, priority, tags, overdue } = todo;
    const pri = PRIORITY_MAP[priority] || PRIORITY_MAP[1];

    const tr = document.createElement('tr');
    tr.className = `todo-row priority-${pri.class}`;
    tr.dataset.id = id;
    if (done) tr.classList.add('done');
    if (overdue && !done) tr.classList.add('is-overdue');

    // Checkbox cell
    const tdCheck = document.createElement('td');
    tdCheck.className = 'td-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = done;
    checkbox.addEventListener('change', async () => {
        const newDone = checkbox.checked;
        const patch = { done: newDone };
        if (newDone && overdue) patch.overdue = false;
        await updateTodo(id, patch);
        loadTodos();
    });
    tdCheck.appendChild(checkbox);

    // Text cell
    const tdText = document.createElement('td');
    tdText.className = 'td-text';
    const span = document.createElement('span');
    span.textContent = text;
    tdText.appendChild(span);

    // Date & Time cells
    const tdDate = document.createElement('td');
    tdDate.className = 'td-date';
    const tdTime = document.createElement('td');
    tdTime.className = 'td-time';
    if (due_date) {
        const d = new Date(due_date);
        const pad = n => String(n).padStart(2, '0');
        const diff = d - new Date();
        let cls = '';
        if (diff < 0) cls = ' overdue';
        else if (diff < 60 * 60 * 1000) cls = ' soon';
        tdDate.innerHTML = `<span class="due-date${cls}">${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}</span>`;
        tdTime.innerHTML = `<span class="due-date${cls}">${pad(d.getHours())}:${pad(d.getMinutes())}</span>`;
    } else {
        tdDate.textContent = '-';
        tdTime.textContent = '-';
    }

    // Priority cell
    const tdPriority = document.createElement('td');
    tdPriority.className = 'td-priority';
    const priorityBadge = document.createElement('span');
    priorityBadge.className = `priority-badge ${pri.class}`;
    priorityBadge.textContent = pri.label;
    tdPriority.appendChild(priorityBadge);

    // Tags cell
    const tdTags = document.createElement('td');
    tdTags.className = 'td-tags';
    if (Array.isArray(tags) && tags.length > 0) {
        tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.style.backgroundColor = tag.color || '#e94560';
            tagEl.textContent = tag.name;
            tdTags.appendChild(tagEl);
        });
    } else {
        tdTags.textContent = '-';
    }

    // Overdue/status cell
    const tdOverdue = document.createElement('td');
    tdOverdue.className = 'td-overdue';
    if (overdue && !done) {
        const overdueBadge = document.createElement('span');
        overdueBadge.className = 'overdue-badge';
        overdueBadge.textContent = 'GECiKTi';
        tdOverdue.appendChild(overdueBadge);
    } else if (done) {
        tdOverdue.innerHTML = '<span class="done-badge">Tamam</span>';
    } else {
        tdOverdue.innerHTML = '<span class="active-badge">Aktif</span>';
    }

    // Actions cell
    const tdActions = document.createElement('td');
    tdActions.className = 'td-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '\u270E';
    editBtn.classList.add('edit-btn');
    editBtn.addEventListener('click', () => enterEditMode(tr, todo));

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '\u2715';
    deleteBtn.classList.add('delete-btn');
    deleteBtn.addEventListener('click', () => {
        tr.remove();
        deleteTodo(id);
        activeTodosData = activeTodosData.filter(t => t.id !== id);
    });

    tdActions.append(editBtn, deleteBtn);

    tr.append(tdCheck, tdText, tdDate, tdTime, tdPriority, tdTags, tdOverdue, tdActions);
    container.appendChild(tr);
}

function enterEditMode(tr, todo) {
    const tdText = tr.querySelector('.td-text');
    const tdDate = tr.querySelector('.td-date');
    const tdTime = tr.querySelector('.td-time');
    const tdPriority = tr.querySelector('.td-priority');
    const tdTags = tr.querySelector('.td-tags');
    const editBtn = tr.querySelector('.edit-btn');

    // Save originals for cancel
    const origText = tdText.innerHTML;
    const origDate = tdDate.innerHTML;
    const origTime = tdTime.innerHTML;
    const origPriority = tdPriority.innerHTML;
    const origTags = tdTags.innerHTML;

    // Text edit
    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.classList.add('edit-input');
    editInput.value = todo.text;
    tdText.innerHTML = '';
    tdText.appendChild(editInput);

    // Date+Time edit (combined in date cell, time cell cleared)
    const editDate = document.createElement('input');
    editDate.type = 'datetime-local';
    editDate.classList.add('edit-input');
    if (todo.due_date) {
        const d = new Date(todo.due_date);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60000);
        editDate.value = local.toISOString().slice(0, 16);
    }
    tdDate.innerHTML = '';
    tdDate.appendChild(editDate);
    tdTime.innerHTML = '';

    // Priority edit
    const editPriority = document.createElement('select');
    editPriority.classList.add('edit-input');
    [1, 2, 3].forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = PRIORITY_MAP[v].label;
        if (v === (todo.priority || 1)) opt.selected = true;
        editPriority.appendChild(opt);
    });
    tdPriority.innerHTML = '';
    tdPriority.appendChild(editPriority);

    // Tags edit
    const editTags = document.createElement('input');
    editTags.type = 'text';
    editTags.classList.add('edit-input');
    editTags.placeholder = 'Etiketler';
    editTags.value = Array.isArray(todo.tags) ? todo.tags.map(t => t.name).join(', ') : '';
    tdTags.innerHTML = '';
    tdTags.appendChild(editTags);

    // Replace edit button with save button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '\u2713';
    saveBtn.classList.add('save-btn');
    editBtn.replaceWith(saveBtn);

    function saveEdit() {
        const newText = editInput.value.trim();
        if (!newText) return;

        const newDueDate = editDate.value ? new Date(editDate.value).toISOString() : null;
        const newPriority = parseInt(editPriority.value);
        const tagNames = editTags.value.split(',').map(t => t.trim()).filter(Boolean);
        const newTags = tagNames.map(name => {
            const found = userTags.find(ut => ut.name.toLowerCase() === name.toLowerCase());
            return { name, color: found ? found.color : '#e94560' };
        });

        updateTodo(todo.id, {
            text: newText,
            due_date: newDueDate,
            priority: newPriority,
            tags: newTags
        });
        loadTodos();
    }

    function cancelEdit() {
        tdText.innerHTML = origText;
        tdDate.innerHTML = origDate;
        tdTime.innerHTML = origTime;
        tdPriority.innerHTML = origPriority;
        tdTags.innerHTML = origTags;
        saveBtn.replaceWith(editBtn);
    }

    saveBtn.addEventListener('click', saveEdit);
    [editInput, editDate, editTags].forEach(el => {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
        });
    });

    editInput.focus();
}

// --- Tag Management ---
async function loadUserTags() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_tags?order=name.asc`, {
        headers: authHeaders()
    });
    const data = await res.json();
    if (Array.isArray(data)) {
        userTags = data;
    }
}

async function createUserTag(name, color) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_tags`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, color })
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
        userTags.push(data[0]);
        renderTagList();
    }
}

async function deleteUserTag(id) {
    await fetch(`${SUPABASE_URL}/rest/v1/user_tags?id=eq.${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    userTags = userTags.filter(t => t.id !== id);
    renderTagList();
}

function renderTagList() {
    tagList.innerHTML = '';
    userTags.forEach(tag => {
        const li = document.createElement('li');

        const dot = document.createElement('span');
        dot.className = 'tag-color-dot';
        dot.style.backgroundColor = tag.color;

        const name = document.createElement('span');
        name.textContent = tag.name;

        const delBtn = document.createElement('button');
        delBtn.textContent = '\u2715';
        delBtn.addEventListener('click', () => deleteUserTag(tag.id));

        li.append(dot, name, delBtn);
        tagList.appendChild(li);
    });
}

// --- Settings Modal ---
settingsBtn.addEventListener('click', () => {
    document.getElementById('settingsEmail').textContent = currentUser?.email || '';
    document.getElementById('settingsReminderMin').value = settings.reminderMinutes;
    document.getElementById('settingsDefaultPriority').value = settings.defaultPriority;

    const notifToggle = document.getElementById('settingsNotifToggle');
    if (settings.notificationsEnabled && Notification.permission === 'granted') {
        notifToggle.textContent = 'Acik';
        notifToggle.classList.add('on');
    } else {
        notifToggle.textContent = 'Kapali';
        notifToggle.classList.remove('on');
    }

    renderTagList();
    settingsModal.classList.add('open');
});

document.getElementById('settingsNotifToggle').addEventListener('click', () => {
    const btn = document.getElementById('settingsNotifToggle');
    if (!settings.notificationsEnabled) {
        if (!('Notification' in window)) {
            alert('Bu tarayici bildirimleri desteklemiyor.');
            return;
        }
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                settings.notificationsEnabled = true;
                btn.textContent = 'Acik';
                btn.classList.add('on');
                notifBtn.classList.add('active');
            }
        });
    } else {
        settings.notificationsEnabled = false;
        btn.textContent = 'Kapali';
        btn.classList.remove('on');
        notifBtn.classList.remove('active');
    }
});

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    settings.reminderMinutes = parseInt(document.getElementById('settingsReminderMin').value) || 15;
    settings.defaultPriority = parseInt(document.getElementById('settingsDefaultPriority').value) || 2;
    saveSettings();
    priorityInput.value = settings.defaultPriority;
    settingsModal.classList.remove('open');
});

// Close modals
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        if (modalId) document.getElementById(modalId).classList.remove('open');
    });
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
    });
});

addTagBtn.addEventListener('click', () => {
    const name = newTagName.value.trim();
    if (!name) return;
    createUserTag(name, newTagColor.value);
    newTagName.value = '';
});

// --- Notification System ---
notifBtn.addEventListener('click', () => {
    if (!('Notification' in window)) {
        alert('Bu tarayici bildirimleri desteklemiyor.');
        return;
    }
    Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
            settings.notificationsEnabled = true;
            notifBtn.classList.add('active');
            saveSettings();
        }
    });
});

function startNotificationChecker() {
    if (notifInterval) clearInterval(notifInterval);
    notifInterval = setInterval(checkUpcomingTodos, 60000);
}

function checkUpcomingTodos() {
    if (!settings.notificationsEnabled || Notification.permission !== 'granted') return;
    const now = new Date();
    const reminderMs = settings.reminderMinutes * 60 * 1000;

    activeTodosData.forEach(todo => {
        if (!todo.due_date || notifiedIds.has(todo.id)) return;
        const due = new Date(todo.due_date);
        const diff = due - now;

        // Notify if within reminder window
        if (diff > 0 && diff <= reminderMs) {
            new Notification('Yaklasan Gorev!', {
                body: todo.text,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📋</text></svg>'
            });
            notifiedIds.add(todo.id);
        }

        // Notify and mark overdue if past due
        if (diff < 0 && !todo.overdue) {
            new Notification('Geciken Gorev!', {
                body: `"${todo.text}" gorevinin suresi doldu!`,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚠️</text></svg>'
            });
            notifiedIds.add(todo.id);
            todo.overdue = true;
            updateTodo(todo.id, { overdue: true });
        }
    });
}

// --- Add todo events ---
addBtn.addEventListener('click', addTodoFn);
todoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodoFn();
});

// --- Init ---
(async () => {
    const handled = await handleAuthRedirect();
    if (!handled) restoreSession();
})();
