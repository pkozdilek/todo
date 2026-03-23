const input = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const list = document.getElementById('todoList');

function loadTodos() {
    const todos = JSON.parse(localStorage.getItem('todos') || '[]');
    todos.forEach(todo => addTodoToDOM(todo.text, todo.done));
}

function saveTodos() {
    const todos = [];
    list.querySelectorAll('li').forEach(li => {
        const span = li.querySelector('span');
        const editInput = li.querySelector('.edit-input');
        const text = span ? span.textContent : editInput ? editInput.value : '';
        todos.push({ text, done: li.classList.contains('done') });
    });
    localStorage.setItem('todos', JSON.stringify(todos));
}

function addTodoToDOM(text, done = false) {
    const li = document.createElement('li');
    if (done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = done;
    checkbox.addEventListener('change', () => {
        li.classList.toggle('done');
        saveTodos();
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
                saveTodos();
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
        saveTodos();
    });

    li.append(checkbox, span, editBtn, deleteBtn);
    list.appendChild(li);
}

function addTodo() {
    const text = input.value.trim();
    if (!text) return;
    addTodoToDOM(text);
    saveTodos();
    input.value = '';
    input.focus();
}

addBtn.addEventListener('click', addTodo);
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodo();
});

loadTodos();
