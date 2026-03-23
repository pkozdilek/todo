const SUPABASE_URL = 'https://hbitsxaeonshucmvidkv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiaXRzeGFlb25zaHVjbXZpZGt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNTIxMTMsImV4cCI6MjA4OTgyODExM30.f03W2uuKWuOV4dWQbhnClzjXIyqp_U5N3lx7vTwaa8U';

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

const input = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const list = document.getElementById('todoList');

async function loadTodos() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/todos?order=created_at.asc`, { headers });
    const todos = await res.json();
    list.innerHTML = '';
    todos.forEach(todo => addTodoToDOM(todo.id, todo.text, todo.done));
}

async function addTodo() {
    const text = input.value.trim();
    if (!text) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/todos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, done: false })
    });
    const [todo] = await res.json();
    addTodoToDOM(todo.id, todo.text, todo.done);
    input.value = '';
    input.focus();
}

async function updateTodo(id, data) {
    await fetch(`${SUPABASE_URL}/rest/v1/todos?id=eq.${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data)
    });
}

async function deleteTodo(id) {
    await fetch(`${SUPABASE_URL}/rest/v1/todos?id=eq.${id}`, {
        method: 'DELETE',
        headers
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

addBtn.addEventListener('click', addTodo);
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodo();
});

loadTodos();
