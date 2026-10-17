document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const categorySelect = document.getElementById('task-category');
    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');
    const resetBtn = document.getElementById('reset-xp-btn');

    let tasks = [];
    let addingTask = false;
    let resetting = false;
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

        if (!title || addingTask || resetting || addBtn.disabled) return;

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
        if (pendingTasks.has(id) || resetting) return;

        const checkbox = event.target;
        const rect = checkbox.getBoundingClientRect();
        const origin = {
            x: (rect.left + rect.width / 2) / window.innerWidth,
            y: (rect.top + rect.height / 2) / window.innerHeight
        };

        pendingTasks.add(id);
        renderTasks();

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

        tasks = tasks.filter(task => task.id !== id);
        renderTasks();

        try {
            await loadCharacterState();
        } finally {
            pendingTasks.delete(id);
        }

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

    async function deleteTask(id) {
        if (resetting || pendingTasks.has(id)) return;

        if (!confirm('Delete this task without earning XP?')) return;

        pendingTasks.add(id);
        renderTasks();

        try {
            await apiRequest(`/api/tasks/${id}`, {
                method: 'DELETE'
            });

            tasks = tasks.filter(task => task.id !== id);
        } catch (error) {
            alert(`Could not delete task: ${error.message}`);
        } finally {
            pendingTasks.delete(id);
            renderTasks();
        }
    }

    async function resetProgress() {
        if (resetting) return;

        if (pendingTasks.size > 0 || addingTask) {
            alert('Wait for the current task update to finish.');
            return;
        }

        const confirmed = confirm(
            'Reset all hero XP and unlocked gear? ' +
            'Tasks will stay, and completed tasks will remain completed.'
        );

        if (!confirmed) return;

        resetting = true;
        resetBtn.disabled = true;
        addBtn.disabled = true;
        renderTasks();

        try {
            await apiRequest('/api/reset-state', {
                method: 'POST',
                body: JSON.stringify({ mode: 'reset' })
            });

            await loadCharacterState();
        } catch (error) {
            alert(`Could not reset progress: ${error.message}`);
        } finally {
            resetting = false;
            resetBtn.disabled = false;
            addBtn.disabled = false;
            renderTasks();
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
            checkbox.disabled = resetting || pendingTasks.has(task.id);
            checkbox.setAttribute('aria-label', `Complete ${task.title}`);
            checkbox.addEventListener('change', event => {
                completeTask(task.id, event);
            });

            const textSpan = document.createElement('span');
            textSpan.textContent = task.title;

            const tag = document.createElement('span');
            tag.className = `badge badge-${task.category}`;
            tag.textContent = formatCategory(task.category);

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = 'Delete';
            deleteBtn.setAttribute('aria-label', `Delete ${task.title}`);
            deleteBtn.disabled = resetting || pendingTasks.has(task.id);
            deleteBtn.addEventListener('click', () => deleteTask(task.id));

            li.appendChild(checkbox);
            li.appendChild(textSpan);
            li.appendChild(tag);
            li.appendChild(deleteBtn);
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

    if (resetBtn) {
        resetBtn.addEventListener('click', resetProgress);
    }

    loadTasks();
});