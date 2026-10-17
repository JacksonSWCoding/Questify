document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const categorySelect = document.getElementById('task-category');
    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');
    const resetBtn = document.getElementById('reset-progress-btn');
    const baseAvatar = document.getElementById('base-avatar');
    const outfitLayer = document.getElementById('outfit-layer');

    let currentGender = 'male';
    let pendingGender = currentGender;

    function updateAvatarSprite(gender) {
        if (baseAvatar) {
            baseAvatar.classList.remove('sprite-male', 'sprite-female');
            baseAvatar.classList.add(`sprite-${gender}`);
        }

        if (outfitLayer) {
            outfitLayer.classList.remove(
                'sprite-outfit-male',
                'sprite-outfit-female'
            );
            outfitLayer.classList.add(`sprite-outfit-${gender}`);
        }
    }

    updateAvatarSprite(currentGender);

    let tasks = [];
    let addingTask = false;
    let resetting = false;
    const pendingTasks = new Set();

    const rig = document.querySelector('.character-rig');
    const stage = document.querySelector('.character-stage');
    let cheerTimer = null;
    let gearResetTimer = null;

    if (rig && stage) {
        new MutationObserver(records => {
            records.forEach(record => {
                const target = record.target;
                const oldValues = (record.oldValue || '').split(/\s+/);

                if (
                    target.classList.contains('gear-layer') &&
                    target.classList.contains('just-unlocked') &&
                    !oldValues.includes('just-unlocked')
                ) {
                    const newlyUnlockedItem = target;

                    document.querySelectorAll('.gear-layer').forEach(gear => {
                        if (gear !== newlyUnlockedItem) {
                            gear.classList.remove('just-unlocked');
                        }
                    });

                    if (rig.classList.contains('item-get')) return;

                    rig.classList.remove('item-get');
                    void rig.offsetWidth;
                    rig.classList.add('item-get');

                    const allGears = document.querySelectorAll('.gear-layer');

                    allGears.forEach(gear => {
                        if (gear !== newlyUnlockedItem) {
                            gear.style.setProperty('opacity', '0', 'important');
                            gear.style.setProperty(
                                'visibility',
                                'hidden',
                                'important'
                            );
                        }
                    });

                    clearTimeout(cheerTimer);
                    clearTimeout(gearResetTimer);

                    cheerTimer = setTimeout(() => {
                        rig.classList.remove('item-get');
                    }, 2700);

                    gearResetTimer = setTimeout(() => {
                        allGears.forEach(gear => {
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
            attributeOldValue: true
        });
    }

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
            'Tasks, coins, purchases, and character choice will stay. ' +
            'Completed tasks remain completed.'
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

    const customizeBtn = document.getElementById('customize-btn');
    const customizerModal = document.getElementById('customizer-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const saveCustomizationBtn = document.getElementById(
        'save-customization-btn'
    );
    const genderBtns = document.querySelectorAll('.gender-btn');

    let loadingCustomization = false;
    let savingCustomization = false;
    let customizationLoaded = false;

    function updateCustomizationControls() {
        const busy = loadingCustomization || savingCustomization;

        if (customizeBtn) customizeBtn.disabled = busy;
        if (closeModalBtn) closeModalBtn.disabled = busy;

        if (saveCustomizationBtn) {
            saveCustomizationBtn.disabled = busy || !customizationLoaded;
        }

        genderBtns.forEach(btn => {
            btn.disabled = busy || !customizationLoaded;
            btn.classList.toggle(
                'active',
                btn.dataset.gender === pendingGender
            );
        });
    }

    async function loadCustomization() {
        if (loadingCustomization || savingCustomization) return false;

        loadingCustomization = true;
        customizationLoaded = false;
        updateCustomizationControls();

        try {
            const player = await apiRequest('/api/player');

            if (!['male', 'female'].includes(player.character_model)) {
                throw new Error(
                    'The server returned an invalid character model'
                );
            }

            currentGender = player.character_model;
            pendingGender = currentGender;
            updateAvatarSprite(currentGender);
            customizationLoaded = true;

            return true;
        } catch (error) {
            alert(`Could not load character choice: ${error.message}`);
            return false;
        } finally {
            loadingCustomization = false;
            updateCustomizationControls();
        }
    }

    customizeBtn?.addEventListener('click', async () => {
        const loaded = await loadCustomization();

        if (loaded) {
            customizerModal?.classList.remove('hidden');
        }
    });

    closeModalBtn?.addEventListener('click', () => {
        if (loadingCustomization || savingCustomization) return;

        pendingGender = currentGender;
        updateCustomizationControls();
        customizerModal?.classList.add('hidden');
    });

    genderBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (
                loadingCustomization ||
                savingCustomization ||
                !customizationLoaded
            ) return;

            pendingGender = btn.dataset.gender;
            updateCustomizationControls();
        });
    });

    saveCustomizationBtn?.addEventListener('click', async () => {
        if (
            loadingCustomization ||
            savingCustomization ||
            !customizationLoaded
        ) return;

        savingCustomization = true;
        updateCustomizationControls();

        try {
            const result = await apiRequest('/api/player/customization', {
                method: 'PATCH',
                body: JSON.stringify({
                    character_model: pendingGender
                })
            });

            currentGender = result.character_model;
            pendingGender = currentGender;
            updateAvatarSprite(currentGender);
            customizerModal?.classList.add('hidden');
        } catch (error) {
            alert(`Could not save character choice: ${error.message}`);
        } finally {
            savingCustomization = false;
            updateCustomizationControls();
        }
    });

    loadTasks();
    loadCustomization();
});