document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const categorySelect = document.getElementById('task-category');
    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');
    const completedTaskList = document.getElementById('completed-task-list');
    const completedQuests = document.getElementById('completed-quests');
    const completedCount = document.getElementById('completed-count');
    const taskStatus = document.getElementById('task-status');
    const appStatus = document.getElementById('app-status');
    const deployNotice = document.getElementById('deploy-notice');
    const resetBtn = document.getElementById('reset-progress-btn');
    const baseAvatar = document.getElementById('base-avatar');
    const outfitLayer = document.getElementById('outfit-layer');

    const TASK_CATEGORIES = ['general', 'fitness', 'coding', 'creative'];
    let statusDismissTimer = null;

    function showAppStatus(message, type = 'error', autoDismissMs = 8000) {
        if (!appStatus || !message) {
            return;
        }

        clearTimeout(statusDismissTimer);
        appStatus.textContent = message;
        appStatus.classList.remove('is-error', 'is-warning', 'is-info');
        appStatus.classList.add(
            type === 'warning' ? 'is-warning' : type === 'info' ? 'is-info' : 'is-error'
        );
        appStatus.hidden = false;

        if (autoDismissMs > 0) {
            statusDismissTimer = setTimeout(() => {
                appStatus.hidden = true;
                appStatus.textContent = '';
            }, autoDismissMs);
        }
    }

    function clearAppStatus() {
        clearTimeout(statusDismissTimer);
        if (appStatus) {
            appStatus.hidden = true;
            appStatus.textContent = '';
        }
    }

    function showTaskError(message) {
        if (taskStatus) {
            taskStatus.textContent = message;
        }
    }

    function clearTaskError() {
        if (taskStatus) {
            taskStatus.textContent = '';
        }
    }

    window.showAppStatus = showAppStatus;

    const isLocalHost =
        location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (deployNotice && !isLocalHost) {
        deployNotice.hidden = false;
    }

    let currentGender = 'male';
    let pendingGender = currentGender;
    let tasks = [];
    let completedTasks = [];
    let editingTaskId = null;
    let addingTask = false;
    let resetting = false;

    const pendingTasks = new Set();

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
                        newlyUnlockedItem.classList.remove('just-unlocked');
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

        const text = await response.text();
        let data = {};

        if (text) {
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                throw new Error(
                    `Something went wrong (${response.status}). Please refresh and try again.`
                );
            }
        }

        if (!response.ok) {
            throw new Error(
                data.error || `Something went wrong. Please try again (${response.status}).`
            );
        }

        return data;
    }

    async function loadTasks() {
        addBtn.disabled = true;

        try {
            const savedTasks = await apiRequest('/api/tasks');
            tasks = savedTasks.filter(task => !task.completed);
            completedTasks = savedTasks.filter(task => task.completed);
            clearTaskError();
            renderTasks();
            renderCompletedTasks();
        } catch (error) {
            showTaskError(`Could not load quests: ${error.message}`);
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
            clearTaskError();
            renderTasks();
        } catch (error) {
            showTaskError(`Could not add quest: ${error.message}`);
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

        const rect = event.target.getBoundingClientRect();

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
            showTaskError(`Could not complete quest: ${error.message}`);
            return;
        }

        const completed = result.task || tasks.find(task => task.id === id);
        if (completed) {
            completedTasks.unshift({ ...completed, completed: true });
        }

        tasks = tasks.filter(task => task.id !== id);
        clearTaskError();
        renderTasks();
        renderCompletedTasks();

        try {
            if (result && result.xp) {
                updateCharacterVisuals(result);
            } else {
                await loadCharacterState();
            }
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

    function startEditTask(id) {
        if (resetting || pendingTasks.has(id)) {
            return;
        }

        editingTaskId = id;
        renderTasks();
    }

    function cancelEditTask() {
        editingTaskId = null;
        renderTasks();
    }

    async function saveEditTask(id, title, category) {
        if (!title) {
            showTaskError('Quest title is required.');
            return;
        }

        if (!TASK_CATEGORIES.includes(category)) {
            showTaskError('Choose a valid category.');
            return;
        }

        pendingTasks.add(id);
        renderTasks();

        try {
            const updatedTask = await apiRequest(`/api/tasks/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ title, category })
            });

            tasks = tasks.map(task => {
                return task.id === id ? updatedTask : task;
            });
            editingTaskId = null;
            clearTaskError();
        } catch (error) {
            showTaskError(`Could not save quest: ${error.message}`);
        } finally {
            pendingTasks.delete(id);
            renderTasks();
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
            if (editingTaskId === id) {
                editingTaskId = null;
            }
            clearTaskError();
        } catch (error) {
            showTaskError(`Could not delete quest: ${error.message}`);
        } finally {
            pendingTasks.delete(id);
            renderTasks();
        }
    }

    async function resetProgress() {
        if (resetting || loadingCustomization || savingCustomization) return;

        if (pendingTasks.size > 0 || addingTask) {
            showAppStatus('Wait for the current quest update to finish.', 'info', 5000);
            return;
        }

        const confirmed = confirm(
            'Reset all hero XP, coins, and unlocked gear back to 0?'
        );

        if (!confirmed) return;

        resetting = true;
        addBtn.disabled = true;
        updateCustomizationControls();
        renderTasks();

        try {
            const resetState = await apiRequest('/api/reset-state', {
                method: 'POST',
                body: JSON.stringify({ mode: 'reset' })
            });

            localStorage.removeItem('questify_equipment');
            if (typeof window.resetShopCosmetics === 'function') {
                window.resetShopCosmetics();
            }
            updateCharacterVisuals(resetState);

            completedTasks = [];
            renderCompletedTasks();

            if (typeof window.refreshCustomizerInventory === 'function') {
                await window.refreshCustomizerInventory();
            }
            clearAppStatus();
            clearTaskError();
        } catch (error) {
            showAppStatus(`Could not reset progress: ${error.message}`, 'error');
        } finally {
            resetting = false;
            addBtn.disabled = false;
            updateCustomizationControls();
            renderTasks();
        }
    }

    function formatCategory(category) {
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    function renderCompletedTasks() {
        if (!completedTaskList || !completedQuests || !completedCount) {
            return;
        }

        completedTaskList.replaceChildren();
        completedCount.textContent = String(completedTasks.length);
        completedQuests.hidden = completedTasks.length === 0;

        completedTasks.forEach(task => {
            const li = document.createElement('li');

            const textSpan = document.createElement('span');
            textSpan.textContent = task.title;

            const tag = document.createElement('span');
            tag.className = `badge badge-${task.category}`;
            tag.textContent = formatCategory(task.category);

            li.append(textSpan, tag);
            completedTaskList.appendChild(li);
        });
    }

    function renderTasks() {
        taskList.replaceChildren();

        tasks.forEach(task => {
            const li = document.createElement('li');

            if (editingTaskId === task.id) {
                const row = document.createElement('div');
                row.className = 'task-edit-row';

                const titleInput = document.createElement('input');
                titleInput.type = 'text';
                titleInput.value = task.title;
                titleInput.setAttribute('aria-label', 'Edit quest title');

                const categoryInput = document.createElement('select');
                categoryInput.setAttribute('aria-label', 'Edit quest category');
                TASK_CATEGORIES.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = formatCategory(category);
                    if (category === task.category) {
                        option.selected = true;
                    }
                    categoryInput.appendChild(option);
                });

                const actions = document.createElement('div');
                actions.className = 'task-edit-actions';

                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.textContent = 'Save';
                saveBtn.addEventListener('click', () => {
                    saveEditTask(
                        task.id,
                        titleInput.value.trim(),
                        categoryInput.value
                    );
                });

                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', cancelEditTask);

                actions.append(saveBtn, cancelBtn);
                row.append(titleInput, categoryInput, actions);
                titleInput.addEventListener('keydown', event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        saveEditTask(
                            task.id,
                            titleInput.value.trim(),
                            categoryInput.value
                        );
                    }

                    if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelEditTask();
                    }
                });

                li.appendChild(row);
                taskList.appendChild(li);
                titleInput.focus();
                return;
            }

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

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.textContent = 'Edit';
            editBtn.setAttribute('aria-label', `Edit ${task.title}`);
            editBtn.disabled = resetting || pendingTasks.has(task.id);
            editBtn.addEventListener('click', () => startEditTask(task.id));

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.textContent = 'Delete';
            deleteBtn.setAttribute('aria-label', `Delete ${task.title}`);
            deleteBtn.disabled = resetting || pendingTasks.has(task.id);
            deleteBtn.addEventListener('click', () => deleteTask(task.id));

            li.append(checkbox, textSpan, tag, editBtn, deleteBtn);
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

    resetBtn?.addEventListener('click', resetProgress);

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
        const busy =
            loadingCustomization ||
            savingCustomization ||
            resetting;

        setEquipmentBusy(busy);

        if (resetBtn) resetBtn.disabled = busy;
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
        if (loadingCustomization || savingCustomization || resetting) {
            return false;
        }

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

            const equipmentState = await apiRequest('/api/character-state');

            updateCharacterVisuals(equipmentState);

            currentGender = player.character_model;
            pendingGender = currentGender;

            updateAvatarSprite(currentGender);
            customizationLoaded = true;

            return true;
        } catch (error) {
            showAppStatus(`Could not load character: ${error.message}`, 'error');
            return false;
        } finally {
            loadingCustomization = false;
            updateCustomizationControls();
        }
    }

    customizeBtn?.addEventListener('click', async () => {
        const loaded = await loadCustomization();

        if (loaded) {
            beginEquipmentEdit();
            customizerModal?.classList.remove('hidden');

            if (typeof window.refreshCustomizerInventory === 'function') {
                window.refreshCustomizerInventory();
            }
        }
    });

    closeModalBtn?.addEventListener('click', () => {
        if (loadingCustomization || savingCustomization || resetting) return;

        pendingGender = currentGender;
        updateAvatarSprite(currentGender);
        cancelEquipmentEdit();
        updateCustomizationControls();

        customizerModal?.classList.add('hidden');
    });

    genderBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (
                loadingCustomization ||
                savingCustomization ||
                resetting ||
                !customizationLoaded
            ) return;

            pendingGender = btn.dataset.gender;
            updateAvatarSprite(pendingGender);
            updateCustomizationControls();
        });
    });

    saveCustomizationBtn?.addEventListener('click', async () => {
        if (
            loadingCustomization ||
            savingCustomization ||
            resetting ||
            !customizationLoaded
        ) return;

        savingCustomization = true;
        updateCustomizationControls();

        try {
            const result = await apiRequest('/api/player/customization', {
                method: 'PATCH',
                body: JSON.stringify({
                    character_model: pendingGender,
                    equipped_items: selectedEquipment()
                })
            });

            acceptEquipment(result.equipped_items);

            currentGender = result.character_model;
            pendingGender = currentGender;

            updateAvatarSprite(currentGender);
            customizerModal?.classList.add('hidden');
        } catch (error) {
            showAppStatus(`Could not save character: ${error.message}`, 'error');
        } finally {
            savingCustomization = false;
            updateCustomizationControls();
        }
    });

    const card = customizerModal?.querySelector('.modal-card');

    if (customizerModal && card && stage) {
        const originalPosition = document.createComment('hero-position');
        stage.before(originalPosition);

        const layout = document.createElement('div');
        layout.className = 'customizer-layout';

        const preview = document.createElement('div');
        preview.className = 'customizer-preview';

        const heading = document.createElement('h3');
        heading.textContent = 'Your Hero';

        const hint = document.createElement('p');
        hint.textContent = 'Select equipment to preview it here.';

        preview.append(heading, hint);

        const controls = document.createElement('div');
        controls.className = 'customizer-controls';

        while (card.firstChild) {
            controls.appendChild(card.firstChild);
        }

        layout.append(preview, controls);
        card.appendChild(layout);

        function updatePreviewLocation() {
            const isOpen = !customizerModal.classList.contains('hidden');

            if (isOpen) {
                preview.insertBefore(stage, hint);
            } else {
                originalPosition.after(stage);
            }
        }

        new MutationObserver(updatePreviewLocation).observe(
            customizerModal,
            {
                attributes: true,
                attributeFilter: ['class']
            }
        );

        updatePreviewLocation();
    }

    loadTasks();
    loadCustomization();
});