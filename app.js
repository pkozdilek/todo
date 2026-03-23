const SUPABASE_URL = 'https://hbitsxaeonshucmvidkv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiaXRzeGFlb25zaHVjbXZpZGt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTIxMTMsImV4cCI6MjA4OTgyODExM30.f03W2uuKWuOV4dWQbhnClzjXIyqp_U5N3lx7vTwaa8U';

const PRIORITY_MAP = {
    1: { label: 'Dusuk', class: 'low' },
    2: { label: 'Orta', class: 'medium' },
    3: { label: 'Yuksek', class: 'high' }
};

// --- State ---
let accessToken = null;
let currentUser = null;
let userTags = [];
let activeTodosData = [];
let notifiedIds = new Set();
let notifInterval = null;

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
const activeTodosList = document.getElementById('activeTodos');
const completedTodosList = document.getElementById('completedTodos');
const notifBtn = document.getElementById('notifBtn');
const tagsBtn = document.getElementById('tagsBtn');
const tagModal = document.getElementById('tagModal');
const closeTagModal = document.getElementById('closeTagModal');
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
    activeTodosList.innerHTML = '';
    completedTodosList.innerHTML = '';
    activeTodosData = [];
    notifiedIds.clear();
    if (notifInterval) {
        clearInterval(notifInterval);
        notifInterval = null;
    }
}

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
async function loadTodos() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/todos?order=priority.desc,due_date.asc.nullslast,created_at.asc`,
        { headers: authHeaders() }
    );
    const todos = await res.json();
    activeTodosList.innerHTML = '';
    completedTodosList.innerHTML = '';
    activeTodosData = [];

    if (Array.isArray(todos)) {
        todos.forEach(todo => {
            const targetList = todo.done ? completedTodosList : activeTodosList;
            addTodoToDOM(todo, targetList);
            if (!todo.done) {
                activeTodosData.push(todo);
            }
        });
    }
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
        body: JSON.stringify({ text, done: false, due_date, priority, tags })
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
        addTodoToDOM(data[0], activeTodosList);
        activeTodosData.push(data[0]);
    }
    todoInput.value = '';
    dueDateInput.value = '';
    priorityInput.value = '2';
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

function formatDueDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d - now;
    const pad = n => String(n).padStart(2, '0');
    const dateFormatted = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    let className = 'due-date';
    if (diff < 0) {
        className += ' overdue';
    } else if (diff < 60 * 60 * 1000) {
        className += ' soon';
    }

    return { text: dateFormatted, className };
}

function addTodoToDOM(todo, targetList) {
    const { id, text, done, due_date, priority, tags } = todo;
    const pri = PRIORITY_MAP[priority] || PRIORITY_MAP[1];

    const li = document.createElement('li');
    li.dataset.id = id;
    li.classList.add(`priority-${pri.class}`);
    if (done) li.classList.add('done');

    // Main row
    const mainRow = document.createElement('div');
    mainRow.className = 'todo-main';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = done;
    checkbox.addEventListener('change', async () => {
        await updateTodo(id, { done: checkbox.checked });
        loadTodos();
    });

    const span = document.createElement('span');
    span.textContent = text;

    const priorityBadge = document.createElement('span');
    priorityBadge.className = `priority-badge ${pri.class}`;
    priorityBadge.textContent = pri.label;

    const editBtn = document.createElement('button');
    editBtn.textContent = '\u270E';
    editBtn.classList.add('edit-btn');
    editBtn.addEventListener('click', () => enterEditMode(li, todo));

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '\u2715';
    deleteBtn.addEventListener('click', () => {
        li.remove();
        deleteTodo(id);
        activeTodosData = activeTodosData.filter(t => t.id !== id);
    });

    mainRow.append(checkbox, span, priorityBadge, editBtn, deleteBtn);

    // Meta row
    const metaRow = document.createElement('div');
    metaRow.className = 'todo-meta';

    const dueDateInfo = formatDueDate(due_date);
    if (dueDateInfo) {
        const dateEl = document.createElement('span');
        dateEl.className = dueDateInfo.className;
        dateEl.textContent = dueDateInfo.text;
        metaRow.appendChild(dateEl);
    }

    if (Array.isArray(tags)) {
        tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.style.backgroundColor = tag.color || '#e94560';
            tagEl.textContent = tag.name;
            metaRow.appendChild(tagEl);
        });
    }

    li.append(mainRow);
    if (metaRow.children.length > 0) {
        li.append(metaRow);
    }
    targetList.appendChild(li);
}

function enterEditMode(li, todo) {
    const mainRow = li.querySelector('.todo-main');
    const span = mainRow.querySelector('span:not(.priority-badge)');
    const editBtn = mainRow.querySelector('.edit-btn');

    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.classList.add('edit-input');
    editInput.value = span.textContent;

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '\u2713';
    saveBtn.classList.add('save-btn');

    // Edit extras row
    const extrasRow = document.createElement('div');
    extrasRow.className = 'edit-extras';

    const editDate = document.createElement('input');
    editDate.type = 'datetime-local';
    if (todo.due_date) {
        const d = new Date(todo.due_date);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60000);
        editDate.value = local.toISOString().slice(0, 16);
    }

    const editPriority = document.createElement('select');
    [1, 2, 3].forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = PRIORITY_MAP[v].label;
        if (v === (todo.priority || 1)) opt.selected = true;
        editPriority.appendChild(opt);
    });

    const editTags = document.createElement('input');
    editTags.type = 'text';
    editTags.placeholder = 'Etiketler';
    editTags.value = Array.isArray(todo.tags) ? todo.tags.map(t => t.name).join(', ') : '';

    extrasRow.append(editDate, editPriority, editTags);

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

        // Reload to reflect changes properly
        loadTodos();
    }

    function cancelEdit() {
        editInput.replaceWith(span);
        saveBtn.replaceWith(editBtn);
        if (extrasRow.parentNode) extrasRow.remove();
    }

    saveBtn.addEventListener('click', saveEdit);
    editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEdit();
        if (e.key === 'Escape') cancelEdit();
    });

    span.replaceWith(editInput);
    editBtn.replaceWith(saveBtn);
    li.appendChild(extrasRow);
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

// Tag modal events
tagsBtn.addEventListener('click', () => {
    renderTagList();
    tagModal.classList.add('open');
});

closeTagModal.addEventListener('click', () => {
    tagModal.classList.remove('open');
});

tagModal.addEventListener('click', (e) => {
    if (e.target === tagModal) tagModal.classList.remove('open');
});

addTagBtn.addEventListener('click', () => {
    const name = newTagName.value.trim();
    if (!name) return;
    const color = newTagColor.value;
    createUserTag(name, color);
    newTagName.value = '';
});

// --- Notification System ---
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        alert('Bu tarayici bildirimleri desteklemiyor.');
        return;
    }
    Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
            notifBtn.classList.add('active');
        }
    });
}

function startNotificationChecker() {
    if (notifInterval) clearInterval(notifInterval);
    notifInterval = setInterval(checkUpcomingTodos, 60000);
}

function checkUpcomingTodos() {
    if (Notification.permission !== 'granted') return;
    const now = new Date();
    const fifteenMin = 15 * 60 * 1000;

    activeTodosData.forEach(todo => {
        if (!todo.due_date || notifiedIds.has(todo.id)) return;
        const due = new Date(todo.due_date);
        const diff = due - now;
        if (diff > 0 && diff <= fifteenMin) {
            new Notification('Yaklasan Gorev!', {
                body: todo.text,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📋</text></svg>'
            });
            notifiedIds.add(todo.id);
        }
    });
}

notifBtn.addEventListener('click', requestNotificationPermission);

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
