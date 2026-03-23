const SUPABASE_URL = 'https://hbitsxaeonshucmvidkv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiaXRzeGFlb25zaHVjbXZpZGt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTIxMTMsImV4cCI6MjA4OTgyODExM30.f03W2uuKWuOV4dWQbhnClzjXIyqp_U5N3lx7vTwaa8U';

// --- State ---
let accessToken = null;
let currentUser = null;

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
const list = document.getElementById('todoList');

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
    loadTodos();
}

function showAuth() {
    currentUser = null;
    accessToken = null;
    localStorage.removeItem('sb_session');
    authSection.style.display = 'block';
    appSection.style.display = 'none';
    list.innerHTML = '';
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
        body: JSON.stringify({ email, password })
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

    // Try using stored access token
    accessToken = session.access_token;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.ok) {
        showApp({ email: session.email, access_token: session.access_token });
        return;
    }

    // Token expired, try refresh
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
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    // Handle token-based confirmation (query param from custom email template)
    const confirmationToken = params.get('confirmation_token');
    const type = params.get('type');
    if (confirmationToken && type === 'signup') {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: confirmationToken, type: 'signup' })
        });
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
        if (res.ok) {
            const data = await res.json();
            accessToken = data.access_token;
            localStorage.setItem('sb_session', JSON.stringify({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                email: data.user.email
            }));
            showApp({ email: data.user.email, access_token: data.access_token });
        } else {
            showMsg(loginMsg, 'Onay linki gecersiz veya suresi dolmus. Tekrar kayit ol.', 'error');
        }
        return true;
    }

    // Handle hash-based redirect (default Supabase flow)
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

    return false;
}

// --- Todo CRUD ---
async function loadTodos() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/todos?order=created_at.asc`, { headers: authHeaders() });
    const todos = await res.json();
    list.innerHTML = '';
    if (Array.isArray(todos)) {
        todos.forEach(todo => addTodoToDOM(todo.id, todo.text, todo.done));
    }
}

async function addTodoFn() {
    const text = todoInput.value.trim();
    if (!text) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/todos`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text, done: false, user_id: currentUser.id || undefined })
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
        addTodoToDOM(data[0].id, data[0].text, data[0].done);
    }
    todoInput.value = '';
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

function addTodoToDOM(id, text, done = false) {
    const li = document.createElement('li');
    li.dataset.id = id;
    if (done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = done;
    checkbox.addEventListener('change', () => {
        li.classList.toggle('done');
        updateTodo(id, { done: checkbox.checked });
    });

    const span = document.createElement('span');
    span.textContent = text;

    const editBtn = document.createElement('button');
    editBtn.textContent = '\u270E';
    editBtn.classList.add('edit-btn');
    editBtn.addEventListener('click', () => {
        const editInput = document.createElement('input');
        editInput.type = 'text';
        editInput.classList.add('edit-input');
        editInput.value = span.textContent;

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '\u2713';
        saveBtn.classList.add('save-btn');

        function saveEdit() {
            const newText = editInput.value.trim();
            if (newText) {
                span.textContent = newText;
                updateTodo(id, { text: newText });
            }
            editInput.replaceWith(span);
            saveBtn.replaceWith(editBtn);
        }

        saveBtn.addEventListener('click', saveEdit);
        editInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') {
                editInput.replaceWith(span);
                saveBtn.replaceWith(editBtn);
            }
        });

        span.replaceWith(editInput);
        editBtn.replaceWith(saveBtn);
        editInput.focus();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '\u2715';
    deleteBtn.addEventListener('click', () => {
        li.remove();
        deleteTodo(id);
    });

    li.append(checkbox, span, editBtn, deleteBtn);
    list.appendChild(li);
}

addBtn.addEventListener('click', addTodoFn);
todoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodoFn();
});

// --- Init ---
(async () => {
    const handled = await handleAuthRedirect();
    if (!handled) restoreSession();
})();
