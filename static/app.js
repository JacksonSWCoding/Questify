document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const categorySelect = document.getElementById('category-select');
    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');

    // Load tasks from localStorage on startup
    let tasks = JSON.parse(localStorage.getItem('taskQuest_tasks')) || [];
    renderTasks();

    // Event Listeners
    addBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    function addTask() {
        const text = taskInput.value.trim();
        const category = categorySelect.value;

        if (text === '') return;

        const newTask = {
            id: Date.now(),
            text: text,
            category: category
        };

        tasks.push(newTask);
        saveAndRender();
        taskInput.value = '';
    }

    function completeTask(id, event) {
        // Find the clicked checkbox's screen position
        const rect = event.target.getBoundingClientRect();
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;

        // Trigger confetti bursting outwards from the circle
        confetti({
            particleCount: 35,
            spread: 60,
            origin: { x: x, y: y },
            scalar: 0.8,
            disableForReducedMotion: true
        });

        // Filter out the completed task so it disappears from the list
        tasks = tasks.filter(task => task.id !== id);

        // Slight delay so the user sees the circle fill before the element disappears
        setTimeout(() => {
            saveAndRender();
        }, 200);
    }

    function saveAndRender() {
        localStorage.setItem('taskQuest_tasks', JSON.stringify(tasks));
        renderTasks();
    }

    function renderTasks() {
        taskList.innerHTML = ''; // Clear current display

        tasks.forEach(task => {
            const li = document.createElement('li');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.addEventListener('change', (e) => completeTask(task.id, e));

            const textSpan = document.createElement('span');
            textSpan.textContent = task.text;

            const tag = document.createElement('span');
            tag.className = `badge badge-${task.category.toLowerCase()}`;
            tag.textContent = task.category;

            li.appendChild(checkbox);
            li.appendChild(textSpan);
            li.appendChild(tag);
            taskList.appendChild(li);
        });
    }
});