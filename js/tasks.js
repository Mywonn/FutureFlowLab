const { ref, computed, reactive, watch, nextTick } = window.Vue;

// ==========================================
// ✅ tasks.js — 任务模块
// 依赖参数：{ selectedDate, currentTab, newTask, newDuration,
//            isFocusing, currentFocusTask, identities, activeIdentity,
//            swipeItemId, showSyncModal }
// ==========================================

export function useTasks({
    selectedDate, currentTab,
    newTask, newDuration,
    isFocusing, currentFocusTask,
    identities, activeIdentity,
    swipeItemId,
} = {}) {

    const tasks = ref([]);

    // ==========================================
    // 工具函数
    // ==========================================
    const formatDateKey = (date) =>
        `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    const getTodayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // ==========================================
    // 核心算法：判断任务完成状态 & 可见性
    // ==========================================
    const isTaskDone = (task, date) => {
        if (task.done) return true;
        if (task.duration > 0 && (task.accumulated || 0) >= task.duration) return true;
        if (task.repeat && task.repeat !== 'none') {
            const dateStr = formatDateKey(date);
            return task.completedDates && task.completedDates.includes(dateStr);
        }
        return false;
    };

    const checkTaskVisible = (task, targetDateObj) => {
        const target = new Date(targetDateObj);
        target.setHours(0, 0, 0, 0);
        const targetTime    = target.getTime();
        const targetDateStr = formatDateKey(target);

        if (task.skippedDates && task.skippedDates.includes(targetDateStr)) return false;

        if (!task.repeat || task.repeat === 'none') {
            if (!task.startDate) return false;
            const start = new Date(task.startDate);
            start.setHours(0, 0, 0, 0);
            if (targetTime < start.getTime()) return false;
            if (task.endDate) {
                const end = new Date(task.endDate);
                end.setHours(0, 0, 0, 0);
                if (targetTime > end.getTime()) return false;
            }
            return true;
        }

        if (!task.startDate) return true;
        const start = new Date(task.startDate);
        start.setHours(0, 0, 0, 0);
        const end = task.endDate ? new Date(task.endDate) : null;
        if (end) end.setHours(0, 0, 0, 0);
        const startTime = start.getTime();
        if (targetTime < startTime) return false;
        if (end && targetTime > end.getTime()) return false;

        const interval = parseInt(task.repeatInterval || 1);
        if (task.repeat === 'day') {
            return Math.floor((targetTime - startTime) / 86400000) % interval === 0;
        }
        if (task.repeat === 'week') {
            const diffWeeks = Math.floor((targetTime - startTime) / (7 * 86400000));
            return target.getDay() === start.getDay() && diffWeeks % interval === 0;
        }
        if (task.repeat === 'month') {
            const diffMonths = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
            return target.getDate() === start.getDate() && diffMonths % interval === 0;
        }
        if (task.repeat === 'year') {
            const diffYears = target.getFullYear() - start.getFullYear();
            return target.getMonth() === start.getMonth() && target.getDate() === start.getDate() && diffYears % interval === 0;
        }
        return true;
    };

    const hasTask = (date) => {
        const key = formatDateKey(date);
        return tasks.value.some(t => t.date === key && !t.done);
    };

    // 🌟 1. 补齐严格匹配当前身份的逻辑 (与 app.js 保持一致)
    const isTaskBelongToCurrentIdentity = (task) => {
        if (!activeIdentity?.value) return false;
        
        // 匹配手动绑定的任务
        if (task.identityId === activeIdentity.value.id) return true;
        
        // 匹配 AI 下发的系列任务
        if (task.systemName && activeIdentity.value.activeMissions) {
            return activeIdentity.value.activeMissions.some(m => m.name === task.systemName);
        }
        
        return false;
    };

    // 🌟 2. 身份优先排序辅助
    const identityFirst = (a, b) => {
        const aMatch = isTaskBelongToCurrentIdentity(a);
        const bMatch = isTaskBelongToCurrentIdentity(b);
        
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
    };

    // ==========================================
    // Inbox (Q0) 任务
    // ==========================================
    const addTask = () => {
        if (!newTask?.value?.trim()) return;
        let duration = 0;
        if (newDuration?.value) duration = Math.abs(parseFloat(newDuration.value)) / 60;
        const d          = new Date(selectedDate.value);
        const year       = d.getFullYear();
        const month      = String(d.getMonth() + 1).padStart(2, '0');
        const day        = String(d.getDate()).padStart(2, '0');
        const dateStr    = `${year}-${month}-${day}`;
        tasks.value.unshift({
            id: Date.now(), text: newTask.value, done: false,
            date: formatDateKey(selectedDate.value), q: 0,
            duration, accumulated: 0, log: [], expanded: false,
            subtasks: [], startDate: dateStr, endDate: dateStr, repeat: 'none'
        });
        newTask.value    = '';
        if (newDuration) newDuration.value = '';
    };

    const activeInboxTasks = computed(() => {
        const key = formatDateKey(selectedDate.value);
        return tasks.value.filter(t => t.q === 0 && !t.done && t.date === key);
    });

    const completedInboxTasks = computed(() => {
        const key = formatDateKey(selectedDate.value);
        return tasks.value.filter(t => t.q === 0 && t.done && t.date === key);
    });

    const dailyDoneCount = computed(() => {
        const key = formatDateKey(selectedDate.value);
        return tasks.value.reduce((count, t) => {
            if (!isTaskDone(t, selectedDate.value)) return count;
            if (t.q === 0) return t.date === key ? count + 1 : count;
            if (!t.repeat || t.repeat === 'none') {
                return (t.date === key || t.startDate === key) ? count + 1 : count;
            }
            return count + 1;
        }, 0);
    });

    const allCompletedTasks = computed(() => {
        const key = formatDateKey(selectedDate.value);
        return tasks.value.filter(t => {
            if (t.q <= 0 || !isTaskDone(t, selectedDate.value)) return false;
            if (!t.repeat || t.repeat === 'none') {
                return t.date === key || t.startDate === key;
            }
            return true;
        }).map(t => {
            let completedAt = '今日已完成';
            if (t.repeat && t.repeat !== 'none' && t.completedDates) {
                completedAt = t.completedDates[t.completedDates.length - 1] || '已完成';
            }
            return { ...t, completedAt };
        });
    });

    // ==========================================
    // 四象限任务
    // ==========================================
    const showQuadrantModal = ref(false);
    const quadrantForm      = reactive({
        q: 1, text: '', duration: '', startDate: '', endDate: '',
        repeat: 'none', repeatInterval: 1, isLongTerm: false, identityId: null
    });

    const addQuickTask = (quadrant) => {
        quadrantForm.q        = quadrant;
        quadrantForm.text     = '';
        quadrantForm.duration = '';
        const d     = new Date(selectedDate.value);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        quadrantForm.startDate     = dateStr;
        quadrantForm.endDate       = dateStr;
        quadrantForm.repeat        = 'none';
        quadrantForm.repeatInterval = 1;
        quadrantForm.isLongTerm    = false;
        showQuadrantModal.value    = true;
    };

    const closeQuadrantModal = () => { showQuadrantModal.value = false; };

    const saveQuadrantTask = () => {
        if (!quadrantForm.text.trim()) { alert('请输入任务内容'); return; }
        const duration = quadrantForm.duration ? Math.abs(parseFloat(quadrantForm.duration)) : 0;
        tasks.value.push({
            id: Date.now(), text: quadrantForm.text, done: false,
            date: formatDateKey(selectedDate.value), q: quadrantForm.q,
            duration, startDate: quadrantForm.startDate,
            endDate: quadrantForm.isLongTerm ? '' : quadrantForm.endDate,
            repeat: quadrantForm.repeat, repeatInterval: quadrantForm.repeatInterval || 1,
            accumulated: 0, log: [], expanded: false, subtasks: []
        });
        closeQuadrantModal();
    };

    const activeRecurringQuadrantTasks = computed(() =>
        tasks.value.filter(t => {
            if (![1, 2, 3].includes(t.q)) return false;
            if (isTaskDone(t, selectedDate.value)) return false;
            if (t.duration > 0 && (t.accumulated || 0) >= t.duration && t.endDate) return false;
            return checkTaskVisible(t, selectedDate.value);
        }).sort((a, b) => {
            const byId = identityFirst(a, b);
            return byId !== 0 ? byId : a.q - b.q;
        })
    );

    const activeQuadrantTasks = computed(() => {
        const sel    = new Date(selectedDate.value);
        sel.setHours(0, 0, 0, 0);
        const selTime = sel.getTime();
        return tasks.value.filter(t => {
            if (t.q <= 0) return false;
            if (isTaskDone(t, selectedDate.value)) return false;
            if (t.repeat && t.repeat !== 'none' && !checkTaskVisible(t, selectedDate.value)) return false;
            if ([1, 2, 3].includes(t.q) && checkTaskVisible(t, selectedDate.value)) return false;
            if (t.endDate && isTaskDone(t, selectedDate.value)) {
                const e = new Date(t.endDate);
                e.setHours(0, 0, 0, 0);
                if (selTime > e.getTime()) return false;
            }
            if (t.startDate) {
                const [y, m, d] = t.startDate.split('-').map(Number);
                if (new Date(y, m - 1, d).getTime() > selTime) return false;
            }
            return true;
        }).sort((a, b) => {
            const byId = identityFirst(a, b);
            if (byId !== 0) return byId;
            if (a.startDate && !b.startDate) return -1;
            if (!a.startDate && b.startDate) return 1;
            if (a.startDate && b.startDate) return new Date(a.startDate) - new Date(b.startDate);
            return a.q - b.q;
        });
    });

    const getTasksByQ = (q) => {
        const sel = new Date(selectedDate.value);
        sel.setHours(0, 0, 0, 0);
        const selTime = sel.getTime();
        return tasks.value.filter(t => {
            if (t.q !== q) return false;
            if (t.done) return false;
            if (t.duration > 0 && (t.accumulated || 0) >= t.duration && t.endDate) return false;
            if (t.repeat && t.repeat !== 'none') return checkTaskVisible(t, selectedDate.value);
            if (t.startDate) {
                const s = new Date(t.startDate);
                s.setHours(0, 0, 0, 0);
                if (selTime < s.getTime() - 86400000) return false;
            }
            if (t.endDate) {
                const e = new Date(t.endDate);
                e.setHours(0, 0, 0, 0);
                if (t.done && selTime > e.getTime()) return false;
            }
            return true;
        });
    };

    const getCompletedTasksByQ = (q) => {
        const sel = new Date(selectedDate.value);
        sel.setHours(0, 0, 0, 0);
        const selTime = sel.getTime();
        return tasks.value.filter(t => {
            if (t.q !== q) return false;
            if (!isTaskDone(t, selectedDate.value)) return false;
            if (t.startDate) {
                const s = new Date(t.startDate);
                s.setHours(0, 0, 0, 0);
                if (selTime < s.getTime() - 3 * 86400000) return false;
            }
            return true;
        }).sort((a, b) => b.id - a.id);
    };

    // ==========================================
    // 任务切换完成 / 删除
    // ==========================================
    const toggleTask = (task) => {
        const currentlyDone = isTaskDone(task, selectedDate.value);
        if (currentlyDone) {
            if (task.repeat && task.repeat !== 'none') {
                const key = formatDateKey(selectedDate.value);
                if (task.completedDates) {
                    task.completedDates = task.completedDates.filter(d => d !== key);
                }
            } else {
                task.done = false;
            }
        } else {
            if (task.repeat && task.repeat !== 'none') {
                if (!task.completedDates) task.completedDates = [];
                const key = formatDateKey(selectedDate.value);
                if (!task.completedDates.includes(key)) task.completedDates.push(key);
            } else {
                task.done = true;
            }
            if (navigator.vibrate) navigator.vibrate(50);
        }
    };

    const deleteTask = (id) => { tasks.value = tasks.value.filter(t => t.id !== id); };

    // ==========================================
    // 编辑弹窗
    // ==========================================
    const editingTask   = ref(null);
    const editForm      = reactive({
        text: '', duration: '', startDate: '', endDate: '',
        repeat: 'none', repeatInterval: 1, isLongTerm: false, identityId: null, q: 1
    });
    const showDeleteOptions = ref(false);

    const openEditModal = (task) => {
        editingTask.value     = task;
        editForm.text         = task.text;
        editForm.duration     = task.duration || '';
        const today           = getTodayStr();
        editForm.startDate    = task.startDate || today;
        editForm.endDate      = task.endDate || today;
        editForm.repeat       = task.repeat || 'none';
        editForm.repeatInterval = task.repeatInterval || 1;
        editForm.isLongTerm   = (task.repeat !== 'none' && !task.endDate);
        if (editForm.isLongTerm) editForm.endDate = '';
        editForm.identityId   = task.identityId || null;
        editForm.q            = task.q || 1;
    };

    const closeEditModal = () => {
        editingTask.value   = null;
        showDeleteOptions.value = false;
    };

    const saveEditTask = () => {
        if (!editingTask.value) return;
        if (!editForm.text.trim()) { alert('内容不能为空'); return; }
        const t = editingTask.value;
        t.text           = editForm.text;
        t.duration       = editForm.duration ? Math.abs(parseFloat(editForm.duration)) : 0;
        t.startDate      = editForm.startDate;
        t.endDate        = editForm.isLongTerm ? '' : editForm.endDate;
        t.repeat         = editForm.repeat;
        t.repeatInterval = editForm.repeatInterval || 1;
        t.q              = editForm.q;
        t.identityId     = editForm.identityId;
        if (editForm.identityId && t.repeat && t.repeat !== 'none') t.endDate = '';
        closeEditModal();
    };

    // 辅助：系列任务判断
    const getTaskTime = (t) => {
        const dateStr = t.date || t.startDate;
        if (!dateStr) return 0;
        const [y, m, d] = dateStr.split('-').map(Number);
        const o = new Date(y, m - 1, d);
        o.setHours(0, 0, 0, 0);
        return o.getTime();
    };

    const isMultipleObjectSeries = (task) => {
        if (task.seriesId || task.systemName) return true;
        return tasks.value.filter(t => t.id !== task.id && t.text === task.text && t.q === task.q && !t.repeat).length > 0;
    };

    const getSeriesMatcher = (task) => (t) => {
        if (task.seriesId && t.seriesId === task.seriesId) return true;
        if (!task.seriesId && task.systemName && t.systemName === task.systemName) return true;
        if (!task.systemName && !task.seriesId && t.text === task.text && t.q === task.q) return true;
        return false;
    };

    const deleteTaskToday = () => {
        if (!editingTask.value) return;
        const task = editingTask.value;
        if (isMultipleObjectSeries(task)) {
            tasks.value = tasks.value.filter(t => t.id !== task.id);
        } else {
            if (!task.skippedDates) task.skippedDates = [];
            const key = formatDateKey(selectedDate.value);
            if (!task.skippedDates.includes(key)) task.skippedDates.push(key);
        }
        showDeleteOptions.value = false;
        closeEditModal();
    };

    const deleteTaskFuture = () => {
        if (!editingTask.value) return;
        const task    = editingTask.value;
        const current = new Date(selectedDate.value);
        current.setHours(0, 0, 0, 0);
        const currentTime = current.getTime();
        if (isMultipleObjectSeries(task)) {
            const isSame = getSeriesMatcher(task);
            tasks.value  = tasks.value.filter(t => !isSame(t) || getTaskTime(t) < currentTime);
        } else {
            const yesterday = new Date(selectedDate.value);
            yesterday.setDate(yesterday.getDate() - 1);
            task.endDate   = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
            task.isLongTerm = false;
        }
        showDeleteOptions.value = false;
        closeEditModal();
    };

    const deleteTaskSeries = () => {
        if (!editingTask.value) return;
        const task = editingTask.value;
        if (isMultipleObjectSeries(task)) {
            const isSame = getSeriesMatcher(task);
            tasks.value  = tasks.value.filter(t => !isSame(t));
        } else {
            tasks.value = tasks.value.filter(t => t.id !== task.id);
        }
        showDeleteOptions.value = false;
        closeEditModal();
    };

    const deleteCurrentTask = () => {
        if (!editingTask.value) return;
        const task        = editingTask.value;
        const isMulti     = isMultipleObjectSeries(task);
        const isSingleRep = !isMulti && task.repeat && task.repeat !== 'none';
        if (isMulti || isSingleRep) {
            showDeleteOptions.value = true;
        } else {
            if (confirm('确定要删除这个任务吗？')) {
                tasks.value = tasks.value.filter(t => t.id !== task.id);
                closeEditModal();
            }
        }
    };

    // ==========================================
    // 子任务
    // ==========================================
    const addSubtask = (task, event) => {
        if (event) event.stopPropagation();
        const text = prompt('输入子任务内容:');
        if (!text?.trim()) return;
        if (!task.subtasks) task.subtasks = [];
        task.subtasks.push({ id: Date.now() + Math.random(), text: text.trim(), done: false });
    };

    const toggleSubtask  = (sub) => { sub.done = !sub.done; };
    const deleteSubtask  = (task, subId) => { task.subtasks = task.subtasks.filter(s => s.id !== subId); };
    const editSubtask    = (sub) => {
        const text = prompt('修改子任务:', sub.text);
        if (text?.trim()) sub.text = text.trim();
    };

    // ==========================================
    // 灵感胶囊
    // ==========================================
    const saveInspiration = (text, showModal) => {
        if (!text.trim()) return;
        const key = formatDateKey(selectedDate.value);
        let container = tasks.value.find(t => t.isInspiration && !t.done && t.q === 0);
        if (!container) {
            container = {
                id: Date.now(), text: '灵感胶囊', done: false, q: 0,
                date: key, startDate: key, subtasks: [],
                createdAt: new Date().toISOString(), isInspiration: true, expanded: true
            };
            tasks.value.unshift(container);
        } else {
            const start  = new Date(container.startDate);
            const target = new Date(selectedDate.value);
            start.setHours(0, 0, 0, 0); target.setHours(0, 0, 0, 0);
            if (target.getTime() < start.getTime()) container.startDate = key;
        }
        if (!container.subtasks) container.subtasks = [];
        container.subtasks.unshift({ id: Date.now() + Math.random(), text: text.trim(), done: false });
        container.expanded = true;
        if (showModal) showModal.value = false;
    };

    // ==========================================
    // 进度模块
    // ==========================================
    const progressTasks = computed(() => tasks.value.filter(t => t.duration > 0));

    const activeProgressTasks = computed(() =>
        progressTasks.value.filter(t => !t.done && (t.accumulated || 0) < t.duration)
    );

    const completedProgressTasks = computed(() =>
        progressTasks.value.filter(t => t.done || (t.accumulated || 0) >= t.duration)
    );

    const handleProgressComplete = (task) => {
        if (confirm(`确认要提前结束任务 "${task.text}" 吗？`)) {
            task.done = true;
            if (swipeItemId) swipeItemId.value = null;
            if (navigator.vibrate) navigator.vibrate(50);
        }
    };

    const progressStats = computed(() => {
        const all         = tasks.value.filter(t => t.duration > 0);
        const totalHours  = all.reduce((sum, t) => sum + (t.accumulated || 0), 0);
        const finishedCount = all.filter(t => (t.accumulated || 0) >= t.duration).length;
        return { hours: totalHours.toFixed(1), doneCount: finishedCount, totalCount: all.length };
    });

    const showProgressModal = ref(false);
    const progressForm      = reactive({ taskId: null, taskText: '', hours: 0 });
    const progressInputRef  = ref(null);

    const editTaskProgress = (task) => {
        progressForm.taskId   = task.id;
        progressForm.taskText = task.text;
        progressForm.hours    = '';
        showProgressModal.value = true;
        setTimeout(() => { if (progressInputRef.value) progressInputRef.value.focus(); }, 100);
    };

    const saveTaskProgress = () => {
        const task = tasks.value.find(t => t.id === progressForm.taskId);
        if (task) {
            const inputMin = parseFloat(progressForm.hours);
            if (!isNaN(inputMin) && inputMin !== 0) {
                const addedHours   = inputMin / 60;
                if (!task.accumulated) task.accumulated = 0;
                task.accumulated  += addedHours;
                if (task.accumulated < 0) task.accumulated = 0;
                if (!task.log) task.log = [];
                task.log.unshift({
                    date: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                    duration: addedHours, note: '手动调整'
                });
            }
        }
        showProgressModal.value = false;
    };

    // ==========================================
    // 触摸 / 点击交互
    // ==========================================
    let pressTimer    = null;
    let isLongPress   = false;
    let isScrolling   = false;
    let taskClickTimer = null;
    const lastTap     = ref({ id: null, time: 0 });
    const lastSubTap  = ref({ id: null, time: 0 });
    const listTouchStartX = ref(0);
    const listTouchStartY = ref(0);

    const handleTouchStart = (task, e) => {
        isScrolling = false;
        isLongPress = false;
        if (e?.touches?.[0]) {
            listTouchStartX.value = e.touches[0].clientX;
            listTouchStartY.value = e.touches[0].clientY;
        }
        pressTimer = setTimeout(() => {
            isLongPress = true;
            if (navigator.vibrate) navigator.vibrate(50);
            openEditModal(task);
        }, 600);
    };

    const handleTouchMove = (e) => {
        clearTimeout(pressTimer);
        if (e?.changedTouches?.[0]) {
            const moveX = Math.abs(e.changedTouches[0].clientX - listTouchStartX.value);
            const moveY = Math.abs(e.changedTouches[0].clientY - listTouchStartY.value);
            if (moveX > 15 || moveY > 15) isScrolling = true;
        }
    };

    const handleTouchEnd = () => { clearTimeout(pressTimer); };

    const handleTaskClick = (task) => {
        if (isLongPress || isScrolling) return;
        const now = Date.now();
        if (lastTap.value.id === task.id && now - lastTap.value.time < 300) {
            clearTimeout(taskClickTimer);
            editTaskProgress(task);
            lastTap.value = { id: null, time: 0 };
        } else {
            lastTap.value = { id: task.id, time: now };
            taskClickTimer = setTimeout(() => {
                if (!task.expanded) tasks.value.forEach(t => { t.expanded = false; });
                task.expanded = !task.expanded;
            }, 300);
        }
    };

    const handleSubtaskClick = (sub) => {
        const now = Date.now();
        if (lastSubTap.value.id === sub.id && now - lastSubTap.value.time < 300) {
            editSubtask(sub);
            lastSubTap.value = { id: null, time: 0 };
        } else {
            lastSubTap.value = { id: sub.id, time: now };
            setTimeout(() => { toggleSubtask(sub); }, 300);
        }
    };

    // 进度页单击/双击
    let progressClickTimer = null;
    const handleProgressItemClick = (task) => {
        const now = Date.now();
        if (lastTap.value.id === task.id && now - lastTap.value.time < 300) {
            clearTimeout(progressClickTimer);
            editTaskProgress(task);
            lastTap.value = { id: null, time: 0 };
        } else {
            lastTap.value = { id: task.id, time: now };
            progressClickTimer = setTimeout(() => { task.expanded = !task.expanded; }, 300);
        }
    };

    // 专注页单击/双击
    let clickTimer = null;
    const handleTileClick = (task) => {
        const now = Date.now();
        if (lastTap.value.id === task.id && now - lastTap.value.time < 300) {
            clearTimeout(clickTimer);
            editTaskProgress(task);
            lastTap.value = { id: null, time: 0 };
        } else {
            lastTap.value = { id: task.id, time: now };
        }
    };

    // ==========================================
    // 复活任务
    // ==========================================
    const showRestoreModal  = ref(false);
    const restorePromptText = ref('');
    const restoreActionType = ref('');
    const taskToRestore     = ref(null);

    const restoreTask = (taskProxy) => {
        const task = tasks.value.find(t => t.id === taskProxy.id);
        if (!task) return;
        taskToRestore.value = task;
        if (task.duration > 0 && (task.accumulated || 0) >= task.duration) {
            restorePromptText.value = `该任务工时已满 (${task.duration}h)。\n复活将重置进度为 0，确定吗？`;
            restoreActionType.value = 'reset_progress';
        } else {
            restorePromptText.value = `确定要撤销"${task.text}"的完成状态，\n将其恢复到进行中列表吗？`;
            restoreActionType.value = 'normal';
        }
        showRestoreModal.value = true;
        if (navigator.vibrate) navigator.vibrate(10);
    };

    const confirmRestore = () => {
        const task = taskToRestore.value;
        if (!task) return;
        if (restoreActionType.value === 'reset_progress') {
            task.done        = false;
            task.accumulated = 0;
            if (!task.log) task.log = [];
            task.log.unshift({
                date: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                duration: 0, note: '进度重置'
            });
        } else {
            if (task.repeat && task.repeat !== 'none') {
                const key = formatDateKey(selectedDate.value);
                if (task.completedDates) task.completedDates = task.completedDates.filter(d => d !== key);
            } else {
                task.done = false;
            }
        }
        showRestoreModal.value = false;
        taskToRestore.value    = null;
    };

    // ==========================================
    // 工具：颜色 / 进度条 / 身份任务
    // ==========================================
    const getTaskBarColor = (task) => {
        if (!activeIdentity?.value || task.identityId !== activeIdentity.value.id) return null;
        return activeIdentity.value.colorHex || null;
    };

    const getTaskDayProgress = (task) => {
        if (!task.startDate) return { current: 1, total: null };
        const start = new Date(task.startDate);
        start.setHours(0, 0, 0, 0);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const currentDay = Math.max(1, Math.floor((now - start) / 86400000) + 1);
        let totalDays = null;
        if (task.endDate) {
            const end = new Date(task.endDate);
            end.setHours(0, 0, 0, 0);
            totalDays = Math.max(1, Math.floor((end - start) / 86400000));
        }
        return { current: currentDay, total: totalDays };
    };

    const tasksForActiveIdentity = computed(() => {
        if (!activeIdentity?.value) return [];
        return tasks.value.filter(t => t.identityId === activeIdentity.value.id && !t.done);
    });

    return {
        tasks,
        // 工具
        formatDateKey, getTodayStr, isTaskDone, checkTaskVisible, hasTask,
        // Inbox
        addTask, activeInboxTasks, completedInboxTasks, dailyDoneCount, allCompletedTasks,
        // 四象限
        showQuadrantModal, quadrantForm, addQuickTask, closeQuadrantModal, saveQuadrantTask,
        activeRecurringQuadrantTasks, activeQuadrantTasks, getTasksByQ, getCompletedTasksByQ,
        // 编辑/删除
        editingTask, editForm, showDeleteOptions,
        openEditModal, closeEditModal, saveEditTask, deleteCurrentTask,
        deleteTask, toggleTask,
        deleteTaskToday, deleteTaskFuture, deleteTaskSeries,
        // 子任务
        addSubtask, toggleSubtask, deleteSubtask, editSubtask,
        // 灵感
        saveInspiration,
        // 进度
        progressTasks, activeProgressTasks, completedProgressTasks,
        handleProgressComplete, progressStats,
        showProgressModal, progressForm, progressInputRef,
        editTaskProgress, saveTaskProgress,
        // 触摸交互
        lastTap, handleTouchStart, handleTouchMove, handleTouchEnd,
        handleTaskClick, handleSubtaskClick,
        handleProgressItemClick, handleTileClick,
        // 复活
        showRestoreModal, restorePromptText, restoreActionType,
        restoreTask, confirmRestore,
        // 工具
        getTaskBarColor, getTaskDayProgress, tasksForActiveIdentity,
    };
}
