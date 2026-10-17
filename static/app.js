document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const categorySelect = document.getElementById('task-category');
    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');
    const resetBtn = document.getElementById('reset-xp-btn');
    const xpTag = document.createElement('span');
    xpTag.className = 'xp-badge';
    xpTag.textContent = '+20 XP'; // You can tie this dynamically to categories later!

    // Load tasks from localStorage on startup
    let tasks = JSON.parse(localStorage.getItem('taskQuest_tasks')) || [];
    renderTasks();

    // Event Listeners
    addBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    // Reset the hero's XP and unlocked gear. XP lives on the Flask server
    // (not localStorage), so this calls the existing reset endpoint.
    // Your quest list is left alone.
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const sure = confirm("Reset your hero's XP and unlocked gear? Your quests will stay.");
            if (!sure) return;

            const result = await resetEvolutionState('reset');
            if (result === null) {
                alert('Could not reach the server. Is `py app.py` still running?');
            }
        });
    }

    
    // "Item get!" reaction, base pose switching, and safe state restoration
    const rig = document.querySelector('.character-rig');
    const stage = document.querySelector('.character-stage');
    const baseAvatar = document.getElementById('base-avatar');
    let cheerTimer = null;
    let poseResetTimer = null;
    let previousAvatarSrc = '';

    if (rig && stage) {
        new MutationObserver((records) => {
            records.forEach((record) => {
                const target = record.target;
                const oldValues = (record.oldValue || '').split(/\s+/);
                
                // Check if this specific gear layer just received 'just-unlocked'
                if (
                    target.classList.contains('gear-layer') &&
                    target.classList.contains('just-unlocked') &&
                    !oldValues.includes('just-unlocked')
                ) {
                    const newlyUnlockedItem = target;

                    // Clean up 'just-unlocked' from all OTHER gear layers so they don't get stuck
                    document.querySelectorAll('.gear-layer').forEach((gear) => {
                        if (gear !== newlyUnlockedItem) {
                            gear.classList.remove('just-unlocked');
                        }
                    });

                    // If already cheering, ignore overlapping triggers so timers don't break
                    if (rig.classList.contains('item-get')) return;

                    rig.classList.remove('item-get');
                    void rig.offsetWidth; // force reflow so the animation restarts
                    rig.classList.add('item-get');

                    // Switch to base_pose.jpg safely during the item-get celebration
                    if (baseAvatar && baseAvatar.dataset.poseSrc) {
                        const poseSrc = baseAvatar.dataset.poseSrc;
                        
                        // Only update previousAvatarSrc if we aren't currently looking at the cheer pose
                        if (!baseAvatar.src.includes(poseSrc)) {
                            previousAvatarSrc = baseAvatar.src;
                        }
                        // Fallback safety net if previousAvatarSrc is somehow blank or corrupted
                        if (!previousAvatarSrc || previousAvatarSrc.includes(poseSrc)) {
                            previousAvatarSrc = baseAvatar.dataset.baseSrc || '/static/images/base.png';
                        }

                        baseAvatar.src = poseSrc;
                    }

                    // Forcefully hide all OTHER gear layers during the cheer
                    const allGears = document.querySelectorAll('.gear-layer');
                    allGears.forEach((gear) => {
                        if (gear !== newlyUnlockedItem) {
                            gear.style.setProperty('opacity', '0', 'important');
                            gear.style.setProperty('visibility', 'hidden', 'important');
                        }
                    });

                    clearTimeout(cheerTimer);
                    clearTimeout(poseResetTimer);

                    cheerTimer = setTimeout(() => {
                        rig.classList.remove('item-get');
                    }, 2700);
                    
                    // Switch back to the regular base image and restore old gear at 2.2s
                    poseResetTimer = setTimeout(() => {
                        if (baseAvatar && previousAvatarSrc) {
                            baseAvatar.src = previousAvatarSrc;
                        }
                        allGears.forEach((gear) => {
                            gear.style.removeProperty('opacity');
                            gear.style.removeProperty('visibility');
                        });
                    }, 2200);
                }
            });
        }).observe(stage, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
            attributeOldValue: true,
        });
    }

    function addTask() {
        const text = taskInput.value.trim();
        const category = categorySelect.value;

        if (text === '') return;

        const newTask = {
            id: Date.now(),
            text: text,
            category: category,
        };

        tasks.push(newTask);
        saveAndRender();
        taskInput.value = '';
    }

    function completeTask(id, event) {
        const task = tasks.find((t) => t.id === id);
        if (task) {
            completeEvolutionTask(task.category, task.text);
        }

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
            disableForReducedMotion: true,
        });

        // Filter out the completed task so it disappears from the list
        tasks = tasks.filter((task) => task.id !== id);

        // Slight delay so the user sees the circle fill before the element disappears
        setTimeout(() => {
            saveAndRender();
        }, 200);
    }

    function saveAndRender() {
        localStorage.setItem('taskQuest_tasks', JSON.stringify(tasks));
        renderTasks();
    }

    function formatCategory(category) {
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    function renderTasks() {
        taskList.innerHTML = '';

        tasks.forEach((task) => {
            const li = document.createElement('li');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.addEventListener('change', (e) => completeTask(task.id, e));

            const textSpan = document.createElement('span');
            textSpan.textContent = task.text;

            const tag = document.createElement('span');
            tag.className = `badge badge-${task.category.toLowerCase()}`;
            tag.textContent = formatCategory(task.category);

            li.appendChild(checkbox);
            li.appendChild(textSpan);
            li.appendChild(tag);
            taskList.appendChild(li);
        });
    }
});