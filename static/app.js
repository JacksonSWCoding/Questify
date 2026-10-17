document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const categorySelect = document.getElementById('task-category');
    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');
    const baseAvatar = document.getElementById('base-avatar');
    const outfitLayer = document.getElementById('outfit-layer');

    let currentGender = localStorage.getItem('char_gender') || 'male';

    function updateAvatarSprite(gender) {
        if (baseAvatar) {
            baseAvatar.classList.remove('sprite-male', 'sprite-female');
            baseAvatar.classList.add(`sprite-${gender}`);
        }
        if (outfitLayer) {
            outfitLayer.classList.remove('sprite-outfit-male', 'sprite-outfit-female');
            outfitLayer.classList.add(`sprite-outfit-${gender}`);
        }
    }
    updateAvatarSprite(currentGender);

    // Load tasks from localStorage on startup
    let tasks = JSON.parse(localStorage.getItem('taskQuest_tasks')) || [];
    renderTasks();

    // Event Listeners
    addBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    // Reset the hero's XP and unlocked gear via modal reset button
    const resetProgressBtn = document.getElementById('reset-progress-btn');
    if (resetProgressBtn) {
        resetProgressBtn.addEventListener('click', async () => {
            const sure = confirm("Reset your hero's XP and unlocked gear? Your quests will stay.");
            if (!sure) return;

            const result = await resetEvolutionState('reset');
            if (result === null) {
                alert('Could not reach the server. Is `py app.py` still running?');
            } else {
                localStorage.clear();
                location.reload();
            }
        });
    }
    
    // "Item get!" reaction & gear hiding using sprite sheets
    const rig = document.querySelector('.character-rig');
    const stage = document.querySelector('.character-stage');
    let cheerTimer = null;
    let gearResetTimer = null;

    if (rig && stage) {
        new MutationObserver((records) => {
            records.forEach((record) => {
                const target = record.target;
                const oldValues = (record.oldValue || '').split(/\s+/);
                
                if (
                    target.classList.contains('gear-layer') &&
                    target.classList.contains('just-unlocked') &&
                    !oldValues.includes('just-unlocked')
                ) {
                    const newlyUnlockedItem = target;

                    document.querySelectorAll('.gear-layer').forEach((gear) => {
                        if (gear !== newlyUnlockedItem) {
                            gear.classList.remove('just-unlocked');
                        }
                    });

                    if (rig.classList.contains('item-get')) return;

                    rig.classList.remove('item-get');
                    void rig.offsetWidth;
                    rig.classList.add('item-get');

                    // Forcefully hide all OTHER gear layers except the newly unlocked item during cheer animation
                    const allGears = document.querySelectorAll('.gear-layer');
                    allGears.forEach((gear) => {
                        if (gear !== newlyUnlockedItem && !gear.classList.contains('equipped')) {
                            gear.style.setProperty('opacity', '0', 'important');
                            gear.style.setProperty('visibility', 'hidden', 'important');
                        }
                    });

                    clearTimeout(cheerTimer);
                    clearTimeout(gearResetTimer);

                    // Hold the new item up overhead
                    const itemIcon = document.getElementById('item-get-icon');
                    if (itemIcon) {
                        const itemId = newlyUnlockedItem.id.replace('item-', '');
                        itemIcon.innerHTML = (typeof GEAR_ICONS !== 'undefined' && GEAR_ICONS[itemId]) || '✨';
                        itemIcon.classList.remove('show');
                        void itemIcon.offsetWidth;
                        itemIcon.classList.add('show');
                    }

                    cheerTimer = setTimeout(() => {
                        rig.classList.remove('item-get');
                        itemIcon?.classList.remove('show');
                    }, 2700);
                    
                    gearResetTimer = setTimeout(() => {
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

        const rect = event.target.getBoundingClientRect();
        const x = (rect.left + rect.width / 2) / window.innerWidth;
        const y = (rect.top + rect.height / 2) / window.innerHeight;

        confetti({
            particleCount: 35,
            spread: 60,
            origin: { x: x, y: y },
            scalar: 0.8,
            disableForReducedMotion: true,
        });

        tasks = tasks.filter((task) => task.id !== id);

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

    // Character Customization Logic
    const customizeBtn = document.getElementById('customize-btn');
    const customizerModal = document.getElementById('customizer-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const saveCustomizationBtn = document.getElementById('save-customization-btn');
    const genderBtns = document.querySelectorAll('.gender-btn');

    genderBtns.forEach(btn => {
        if (btn.dataset.gender === currentGender) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Snapshot taken when the modal opens so Cancel can put everything back
    let modalSnapshot = null;

    function syncGenderButtons() {
        genderBtns.forEach((b) => b.classList.toggle('active', b.dataset.gender === currentGender));
    }

    customizeBtn?.addEventListener('click', () => {
        modalSnapshot = {
            gender: currentGender,
            equipped: snapshotEquipped(),
        };
        customizerModal?.classList.remove('hidden');
    });

    closeModalBtn?.addEventListener('click', () => {
        if (modalSnapshot) {
            currentGender = modalSnapshot.gender;
            syncGenderButtons();
            restoreEquipped(modalSnapshot.equipped);
            modalSnapshot = null;
        }
        customizerModal?.classList.add('hidden');
    });

    genderBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            genderBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentGender = btn.dataset.gender;
        });
    });

    saveCustomizationBtn?.addEventListener('click', () => {
        localStorage.setItem('char_gender', currentGender);
        saveEquipped();
        updateAvatarSprite(currentGender);
        modalSnapshot = null;
        customizerModal?.classList.add('hidden');
    });
});