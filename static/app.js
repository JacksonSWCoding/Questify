document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const categorySelect = document.getElementById('task-category');
    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');

    let tasks = [];
    let addingTask = false;
    const pendingTasks = new Set();

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'The request failed');
        }

        return data;
    }

    async function loadTasks() {
        addBtn.disabled = true;

        try {
            const savedTasks = await apiRequest('/api/tasks');
            tasks = savedTasks.filter(task => !task.completed);
            renderTasks();
        } catch (error) {
            alert(`Could not load tasks: ${error.message}`);
        } finally {
            addBtn.disabled = false;
        }
    }

    async function addTask() {
        const title = taskInput.value.trim();
        const category = categorySelect.value;

        if (!title || addingTask || addBtn.disabled) return;

        addingTask = true;
        addBtn.disabled = true;
        taskInput.disabled = true;
        categorySelect.disabled = true;

        try {
            const task = await apiRequest('/api/tasks', {
                method: 'POST',
                body: JSON.stringify({ title, category })
            });

            tasks.push(task);
            taskInput.value = '';
            renderTasks();
        } catch (error) {
            alert(`Could not add task: ${error.message}`);
        } finally {
            addingTask = false;
            addBtn.disabled = false;
            taskInput.disabled = false;
            categorySelect.disabled = false;
            taskInput.focus();
        }
    }

    async function completeTask(id, event) {
        if (pendingTasks.has(id)) return;

        const checkbox = event.target;
        const rect = checkbox.getBoundingClientRect();
        const origin = {
            x: (rect.left + rect.width / 2) / window.innerWidth,
            y: (rect.top + rect.height / 2) / window.innerHeight
        };

        pendingTasks.add(id);
        checkbox.disabled = true;

        let result;

        try {
            result = await apiRequest(`/api/tasks/${id}/complete`, {
                method: 'POST'
            });
        } catch (error) {
            pendingTasks.delete(id);
            renderTasks();
            alert(`Could not complete task: ${error.message}`);
            return;
        }

        pendingTasks.delete(id);
        tasks = tasks.filter(task => task.id !== id);
        renderTasks();
        await loadCharacterState();

        if (result.xp_awarded > 0 && typeof window.confetti === 'function') {
            window.confetti({
                particleCount: 35,
                spread: 60,
                origin,
                scalar: 0.8,
                disableForReducedMotion: true
            });
        }
    }

    function formatCategory(category) {
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    function renderTasks() {
        taskList.replaceChildren();

        tasks.forEach(task => {
            const li = document.createElement('li');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = pendingTasks.has(task.id);
            checkbox.disabled = pendingTasks.has(task.id);
            checkbox.setAttribute('aria-label', `Complete ${task.title}`);
            checkbox.addEventListener('change', event => {
                completeTask(task.id, event);
            });

            const textSpan = document.createElement('span');
            textSpan.textContent = task.title;

            const tag = document.createElement('span');
            tag.className = `badge badge-${task.category}`;
            tag.textContent = formatCategory(task.category);

            li.appendChild(checkbox);
            li.appendChild(textSpan);
            li.appendChild(tag);
            taskList.appendChild(li);
        });
    }

    addBtn.addEventListener('click', addTask);

    taskInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addTask();
        }
    });

    loadTasks();
});