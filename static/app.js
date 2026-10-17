document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const categorySelect = document.getElementById('category-select');
    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');

    // Add task when clicking button
    addBtn.addEventListener('click', addTask);

    // Also add task if user presses "Enter" key inside input
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    function addTask() {
        const taskText = taskInput.value.trim();
        const category = categorySelect.value;

        if (taskText === '') return; // Don't add empty tasks

        // Create <li> element
        const li = document.createElement('li');

        // Create Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';

        // Task Text
        const textSpan = document.createElement('span');
        textSpan.textContent = taskText;

        // Category Tag Badge
        const tag = document.createElement('span');
        tag.className = 'badge';
        tag.textContent = category;

        // Checkbox event: Strike through text & signal completion
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                li.classList.add('completed');
                // You can fire an XP event here later for your teammate!
                console.log(`Task completed in category: ${category}`);
            } else {
                li.classList.remove('completed');
            }
        });

        // Assemble item & append to list
        li.appendChild(checkbox);
        li.appendChild(textSpan);
        li.appendChild(tag);
        taskList.appendChild(li);

        // Clear input box
        taskInput.value = '';
    }
});