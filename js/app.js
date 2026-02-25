
import { useTasks } from './tasks.js';
import { useLab } from './lab.js';
// import { useCountdown } from './countdown.js';


const { createApp, ref, computed, watch, onMounted, reactive, nextTick } = Vue; // 确保解构了 nextTick

    const app = createApp({ // 将 createApp 改为赋值给变量
        setup() {
            const { tasks } = useTasks();

            const { 
                identities, activeIdentity, web3Project, saveIdentities,
                labMode, FLASH_PROMPT, STRATEGY_PROMPT, EXTRACT_PROMPT,
                labHistory, addToHistory, deleteHistory, restoreHistory
            } = useLab();

            // --- 3. 夜间模式逻辑 ---
            const isDark = ref(false);

            const toggleTheme = () => {
                isDark.value = !isDark.value;
                updateTheme();
            };

            const updateTheme = () => {
                const html = document.documentElement;
                const themeColorMeta = document.getElementById('theme-color');
                
                if (isDark.value) {
                    html.classList.add('dark');
                    // 🚫 移除：不再保存手动状态，手动仅做测试用
                    // localStorage.setItem('future_flow_theme', 'dark'); 
                    themeColorMeta.setAttribute('content', '#1f2937'); 
                } else {
                    html.classList.remove('dark');
                    // 🚫 移除：不再保存手动状态
                    // localStorage.setItem('future_flow_theme', 'light');
                    themeColorMeta.setAttribute('content', '#2563eb');
                }
            };
            // --- 持久化 & 初始化 ---
            // --- 持久化 & 初始化 ---
            onMounted(() => {
                // 1. 强行跟随系统 (不再读取 localStorage)
                const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
                const systemDark = systemDarkQuery.matches;

                // 初始化直接用系统状态
                isDark.value = systemDark;
                updateTheme();

                // 检查是否有 AI 配置，如果没有且用户点击了“实验室”，则强制弹出配置
                const savedAiKey = localStorage.getItem('future_flow_ai_key');
                if (!savedAiKey) {
                    // 可以在这里标记一个状态，提醒用户去配置
                }

                // ✅ 实时监听
                systemDarkQuery.addEventListener('change', (e) => {
                    console.log('系统主题发生变化，自动跟随...');
                    isDark.value = e.matches; // 1. 强制同步系统状态
                    updateTheme();            // 2. 更新界面并刷新本地存储
                });

                const savedTasks = localStorage.getItem('mike-pro-tasks-v4');
                
                // 🚨 注意：刚才让你删除的代码就在这里，删掉后直接接下面这行：
                if (savedTasks) tasks.value = JSON.parse(savedTasks);
                
                const savedCountdowns = localStorage.getItem('mike-pro-countdowns-v4');
                if (savedCountdowns) countdowns.value = JSON.parse(savedCountdowns);

                // ... 后面的代码保持不变 ...

                const savedToken = localStorage.getItem('mike_github_token');
                if(savedToken) githubToken.value = savedToken;
                const savedGistId = localStorage.getItem('mike_gist_id');
                if(savedGistId) gistId.value = savedGistId;
                
                updateTheme();

                // ✅ 修复：强力滚动逻辑
                // 不只试一次，而是尝试多次，直到找到元素为止
                const forceScrollToToday = (retryCount = 0) => {
                    // 如果尝试超过10次（约3秒）还没找到，就放弃，防止死循环
                    if (retryCount > 10) return;

                    nextTick(() => {
                        const id = 'day-' + selectedDate.value.toDateString();
                        const el = document.getElementById(id);
                        
                        if (el) {
                            console.log("找到日期元素，执行滚动");
                            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        } else {
                            // 没找到？300毫秒后再试一次
                            setTimeout(() => forceScrollToToday(retryCount + 1), 300);
                        }
                    });
                };

                // 2. 只有在当前 Tab 是 'now' 或 'quadrant' 时才执行滚动
                if (currentTab.value === 'now' || currentTab.value === 'quadrant') {
                    forceScrollToToday();
                }

                // --- 🕛 自动刷新逻辑保持不变 ---
                handleMidnightRefresh();
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        const savedDate = localStorage.getItem('last_active_date');
                        const today = new Date().toDateString();
                        if (savedDate && savedDate !== today) {
                             window.location.reload();
                        } else {
                            handleMidnightRefresh();
                        }
                        localStorage.setItem('last_active_date', today);
                    }
                });
                localStorage.setItem('last_active_date', new Date().toDateString());
                // ✅ 新增：Vue 挂载完毕，优雅移除启动屏
                setTimeout(() => {
                    const splash = document.getElementById('splash-screen');
                    if (splash) {
                        // 1. 先变透明 (CSS transition 会处理淡出效果)
                        splash.style.opacity = '0';
                        // 2. 动画结束后彻底移除 DOM
                        setTimeout(() => splash.remove(), 500);
                    }
                }, 100); // 稍微延迟 100ms 确保页面完全渲染
            });

            // --- 原有逻辑 ---
            const currentTab = ref('now');
            const showHistoryModal = ref(false);
            const showCompletedInbox = ref(false); // 控制已完成列表的显示/隐藏
            const showCompletedProgress = ref(false); // ✅ 新增：进度页折叠
            const showProgressFloatBtn = ref(false);
            const showExpiredCountdown = ref(false);  // ✅ 新增：倒数日折叠
            const showCalendar = ref(false);
            const newTask = ref('');
            const newDuration = ref(''); 
            
            // 数据
            // const tasks = ref([]);
            const countdowns = ref([
                { id: 1, name: '比特币减半预期', date: '2028-04-18', color: 'border-orange-500', pinned: true },
                { id: 2, name: '春节', date: '2026-02-17', color: 'border-red-500', pinned: false },
            ]);

            // --- 新增：倒数日表单逻辑 ---
            const showCountdownModal = ref(false);
            const countdownFormMode = ref('add');
            const countdownForm = reactive({ id: null, name: '', date: '', isLunar: false, repeat: 'none' });

            const openCountdownModal = (mode, item = null) => {
                countdownFormMode.value = mode;
                if (mode === 'edit' && item) {
                    countdownForm.id = item.id;
                    countdownForm.name = item.name;
                    countdownForm.date = item.date;
                    countdownForm.isLunar = !!item.isLunar; // 确保是布尔值
                    countdownForm.repeat = item.repeat || 'none';
                } else {
                    countdownForm.id = Date.now();
                    countdownForm.name = '';
                    const today = new Date();
                    // 默认设为今天 (YYYY-MM-DD)
                    const y = today.getFullYear();
                    const m = String(today.getMonth() + 1).padStart(2, '0');
                    const d = String(today.getDate()).padStart(2, '0');
                    countdownForm.date = `${y}-${m}-${d}`;
                    countdownForm.isLunar = false;
                    countdownForm.repeat = 'none';
                }
                showCountdownModal.value = true;
            };

            const closeCountdownModal = () => showCountdownModal.value = false;

            const saveCountdown = () => {
                if (!countdownForm.name || !countdownForm.date) { alert("请填写完整信息"); return; }
                
                const newItem = {
                    id: countdownForm.id,
                    name: countdownForm.name,
                    date: countdownForm.date,
                    isLunar: countdownForm.isLunar,
                    repeat: countdownForm.repeat,
                    pinned: false,
                    color: 'border-blue-500'
                };

                if (countdownFormMode.value === 'add') {
                    countdowns.value.push(newItem);
                } else {
                    const idx = countdowns.value.findIndex(c => c.id === countdownForm.id);
                    if (idx !== -1) {
                        newItem.pinned = countdowns.value[idx].pinned; // 保持置顶状态
                        newItem.color = countdowns.value[idx].color;   // 保持颜色
                        countdowns.value[idx] = newItem;
                    }
                }
                closeCountdownModal();
            };

            const isFocusing = ref(false);
            const defaultDuration = ref(25);
            const timeLeft = ref(25 * 60);
            const showTimeSelect = ref(false);
            const showTimerAction = ref(false);
            const currentFocusTask = ref(null);
            let timerInterval = null;
            
            const editingTask = ref(null);
            const showSyncModal = ref(false); // 同步弹窗
            // 🚀 新增 1：控制历史记录弹窗显示
            const showDoneHistory = ref(false);

            // 🚀 新增 2：计算所有象限已完成的任务 (过滤 q > 0 的)
            const allCompletedTasks = computed(() => {
                const currentKey = formatDateKey(selectedDate.value);
                
                return tasks.value.filter(t => {
                    // 只要是象限任务，且在当前日期是“已完成”状态的
                    if (t.q <= 0 || !isTaskDone(t, selectedDate.value)) return false;

                    // 🎯 核心修复：防止一次性任务在未来每天“诈尸”
                    // 如果是一次性任务，它的创建日期 (date) 或开始日期必须是今天才显示
                    if (!t.repeat || t.repeat === 'none') {
                        return t.date === currentKey || t.startDate === currentKey;
                    }
                    
                    return true;
                }).map(t => {
                    // 记录一下完成时间显示
                    let timeStr = '今日已完成';
                    if (t.repeat && t.repeat !== 'none' && t.completedDates) {
                        timeStr = t.completedDates[t.completedDates.length-1] || '已完成';
                    }
                    return { ...t, completedAt: timeStr };
                });
            });

            
            const githubToken = ref('');
            const gistId = ref('');
            const syncStatus = ref('idle'); // idle, loading, success, error

            const now = new Date();
            const currentYear = ref(now.getFullYear());
            const currentMonth = ref(now.getMonth());
            const selectedDate = ref(new Date());
            // --- 修改：计算周视图 (扩大范围实现滑动效果) ---
            const stripDays = computed(() => {
                const days = [];
                // 生成前后各 15 天，共 31 天，让你随便滑
                for (let i = -15; i <= 15; i++) {
                    const d = new Date(selectedDate.value);
                    d.setDate(d.getDate() + i);
                    
                    const weekMap = ['日','一','二','三','四','五','六'];
                    days.push({
                        date: d,
                        dayNum: d.getDate(),
                        weekName: weekMap[d.getDay()],
                        dateStr: d.toDateString() // 用于 ID 定位
                    });
                }
                return days;
            });
            // --- 新增：日期条下拉打开日历逻辑 ---
            const headerTouchStartY = ref(0);

            const handleHeaderTouchStart = (e) => {
                headerTouchStartY.value = e.touches[0].clientY;
            };

            const handleHeaderTouchEnd = (e) => {
                const deltaY = e.changedTouches[0].clientY - headerTouchStartY.value;
                // 如果向下位移超过 40px，且日历当前是收起状态，则打开它
                if (deltaY > 40 && !showCalendar.value) {
                    showCalendar.value = true;
                }
            };
            // --- 新增：自动居中逻辑 ---
            const dateScrollContainer = ref(null);
            // const { nextTick } = Vue; // 确保解构出了 nextTick

            const scrollToSelected = () => {
                nextTick(() => {
                    if (!selectedDate.value) return;
                    const id = 'day-' + selectedDate.value.toDateString();
                    const el = document.getElementById(id);
                    if (el && dateScrollContainer.value) {
                        // 平滑滚动将选中元素置于中间
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                });
            };

            // 监听日期变化，每次选中新日期，自动滚过去
            watch(selectedDate, () => {
                scrollToSelected();
            });

            // 修改：切回 [专注] 或 [四象限] 时，自动重置回今天
            watch(currentTab, (val) => {
                if (val === 'now' || val === 'quadrant') {
                    jumpToToday(); // 强制跳转回今天
                }
            });

            const quadrantTitles = ['重要紧急 🔥', '重要不紧急 📅', '不重要紧急 🔔', '不重要不紧急 🗑️'];

            // --- 监听Tab切换 ---
            watch(currentTab, (newTab, oldTab) => {
                // ✅ 新增：切换 Tab 时，强制关闭所有倒数日的“左滑删除”状态
                swipeItemId.value = null;
                
                // 🚀 核心修改：在 ['now', 'quadrant'] 后面加上 'lab'
                if (['now', 'quadrant', 'lab'].includes(newTab)) {
                    showCalendar.value = false; // 进入这些页面时，默认收起日历
                } else {
                    showCalendar.value = true; // 进度和倒数日页面默认展开
                }

                // ✅ 修改 2：不论从“专注页”还是“四象限”离开，都自动收起所有任务
                if (oldTab === 'now' || oldTab === 'quadrant') {
                    tasks.value.forEach(t => {
                        t.expanded = false; 
                    });
                }
                
                // 3. 额外优化：如果切回 [专注] 或 [四象限]，自动重置回今天
                if (newTab === 'now' || newTab === 'quadrant') {
                    jumpToToday(); 
                }
            });

            // ================== 🕛 终极版：零点精准自动刷新 ==================
                
                const handleMidnightRefresh = () => {
                    const now = new Date();
                    const tomorrow = new Date(now);
                    
                    // 1. 设置目标时间为明天 00:00:01 (多加1秒作为缓冲，确保万无一失)
                    tomorrow.setDate(now.getDate() + 1);
                    tomorrow.setHours(0, 0, 1, 0); 
                    
                    // 2. 计算倒计时毫秒数
                    const timeToMidnight = tomorrow - now;
                    
                    console.log(`距离零点自动刷新还有: ${Math.floor(timeToMidnight/1000)} 秒`);

                    // 3. 启动精准倒计时
                    setTimeout(() => {
                        console.log('🕛 零点已到，执行刷新！');
                        window.location.reload();
                    }, timeToMidnight);
                };

                // A. 初始化时启动精准倒计时
                handleMidnightRefresh();

                // B. 依然保留 visibilitychange (防止手机休眠导致倒计时暂停)
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        // 手机醒来时，先检查一下是不是已经过点了
                        const savedDate = localStorage.getItem('last_active_date');
                        const today = new Date().toDateString();

                        // 如果记录的日期和今天不一样，直接刷
                        if (savedDate && savedDate !== today) {
                             window.location.reload();
                        } else {
                            // 如果还是同一天，重新校准一下倒计时 (因为休眠时 setTimeout 会不准)
                            handleMidnightRefresh();
                        }
                        // 更新一下“最后活跃日期”
                        localStorage.setItem('last_active_date', today);
                    }
                });
                
                // 初始化记录一下日期
                localStorage.setItem('last_active_date', new Date().toDateString());

                // ===============================================================
            
            // 自动保存本地数据
            watch([tasks, countdowns], () => { // <--- 删掉了 todayPomodoros
                localStorage.setItem('mike-pro-tasks-v4', JSON.stringify(tasks.value));
                localStorage.setItem('mike-pro-countdowns-v4', JSON.stringify(countdowns.value));
            }, { deep: true });

            // 自动保存同步配置
            watch([githubToken, gistId], () => {
                localStorage.setItem('mike_github_token', githubToken.value);
                localStorage.setItem('mike_gist_id', gistId.value);
            });

            // --- 云同步逻辑 (Gist) ---
            // --- 修复后的完整同步函数 ---
const handleSync = async (direction) => {
    if (!githubToken.value) {
        alert("请先填写 GitHub Token");
        return;
    }
    syncStatus.value = 'loading';
    
    const fileName = 'mikes_flow_data.json';
    
    // 准备要上传的数据 (已移除 todayPomodoros)
    const content = JSON.stringify({
        tasks: tasks.value,
        countdowns: countdowns.value,
        updatedAt: new Date().toISOString()
    });

    try {
        // === 1. 上传 (UPLOAD) 逻辑 ===
        if (direction === 'upload') {
            const method = gistId.value ? 'PATCH' : 'POST';
            const url = gistId.value 
                ? `https://api.github.com/gists/${gistId.value}` 
                : 'https://api.github.com/gists';

            const res = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `token ${githubToken.value}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    description: "Future Flow Data Sync",
                    public: false, // 私有 Gist
                    files: {
                        [fileName]: { content: content }
                    }
                })
            });

            if (!res.ok) throw new Error('上传失败');
            const data = await res.json();
            
            // 如果是新建的，自动保存 Gist ID
            if (!gistId.value) gistId.value = data.id;
            
            alert('✅ 上传成功！');
        } 
        
        // === 2. 下载 (DOWNLOAD) 逻辑 ===
        else {
            if (!gistId.value) {
                alert("请先提供 Gist ID");
                syncStatus.value = 'error';
                return;
            }
            const res = await fetch(`https://api.github.com/gists/${gistId.value}`, {
                headers: { 'Authorization': `token ${githubToken.value}` }
            });
            
            if (!res.ok) throw new Error('下载失败');
            const data = await res.json();
            const file = data.files[fileName];
            
            if (file && file.content) {
                const cloudData = JSON.parse(file.content);
                if(confirm(`云端更新于: ${cloudData.updatedAt}\n确定覆盖吗？`)) {
                    tasks.value = cloudData.tasks || [];
                    countdowns.value = cloudData.countdowns || [];
                    alert('✅ 下载成功！');
                }
            }
        }
        
        syncStatus.value = 'success';
        setTimeout(() => syncStatus.value = 'idle', 3000);

    } catch (e) {
        console.error(e);
        alert(`同步出错: ${e.message}`);
        syncStatus.value = 'error';
    }
};
            // --- 任务管理 ---
            const formatDateKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            
            // 1. 移动到这里：定义获取今天的辅助函数 (供全剧使用)
            const getTodayStr = () => {
                const d = new Date();
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };



            const addTask = () => {
                if (!newTask.value.trim()) return;
                let duration = 0;
                if (newDuration.value) {
                    // ✅ 修改：输入的 newDuration 是分钟，除以 60 转为小时存进去
                    duration = Math.abs(parseFloat(newDuration.value)) / 60;
                }
                
                // ❌ 原代码：const today = getTodayStr(); 
                // ✅ 新代码：获取当前选中日期的字符串 (例如：2026-02-11)
                const d = new Date(selectedDate.value);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const selectedDateStr = `${year}-${month}-${day}`;

                tasks.value.unshift({
                    id: Date.now(), 
                    text: newTask.value, 
                    done: false,
                    date: formatDateKey(selectedDate.value),
                    q: 0, 
                    duration: duration, 
                    accumulated: 0, 
                    log: [], 
                    expanded: false, 
                    subtasks: [],     
                    // ✅ 修正：任务的开始/结束日期 = 你当前选中的那个日期
                    startDate: selectedDateStr,
                    endDate: selectedDateStr,
                    repeat: 'none'
                });
                newTask.value = ''; newDuration.value = '';
            };

            // --- 新增：自动计算今日已完成的任务数量 ---
            const dailyDoneCount = computed(() => {
                const key = formatDateKey(selectedDate.value);
                
                // 遍历所有任务，统计已完成的
                return tasks.value.reduce((count, t) => {
                    // 1. 核心判断：这个任务在“选中的这天”是完成状态吗？
                    if (!isTaskDone(t, selectedDate.value)) return count;

                    // 2. 归属判断：
                    if (t.q === 0) {
                        return t.date === key ? count + 1 : count;
                    }
                    
                    // 🎯 核心修复：四象限 (Q1-4) 的一次性任务，也必须属于这天才算数
                    if (!t.repeat || t.repeat === 'none') {
                        return (t.date === key || t.startDate === key) ? count + 1 : count;
                    }

                    // 重复任务如果 isTaskDone 为 true，说明当天打卡了，直接算成就
                    return count + 1;
                }, 0);
            });

            // 1. 定义【新建任务】的弹窗状态和表单
            const showQuadrantModal = ref(false);
            // ✅ 修改：增加 isLongTerm 字段
            const quadrantForm = reactive({ q: 1, text: '', duration: '', startDate: '', endDate: '', repeat: 'none', repeatInterval: 1, isLongTerm: false });
            const editForm = reactive({ text: '', duration: '', startDate: '', endDate: '', repeat: 'none', repeatInterval: 1, isLongTerm: false });
            // (注意：这里的 getTodayStr 定义已被移除，直接使用上面的)

            // 打开新建弹窗
            const addQuickTask = (quadrant) => {
                quadrantForm.q = quadrant;
                quadrantForm.text = '';
                quadrantForm.duration = '';
                
                // ✅ 这里的逻辑已经是正确的了（我看你之前的代码这里是对的），确认一下即可
                // 如果你之前这里用的是 getTodayStr()，请务必改成下面这样：
                const d = new Date(selectedDate.value);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;

                quadrantForm.startDate = dateStr; // 默认开始日期 = 选中日期
                quadrantForm.endDate = dateStr;   // 默认结束日期 = 选中日期
                
                quadrantForm.repeat = 'none';
                quadrantForm.repeatInterval = 1;
                quadrantForm.isLongTerm = false;
                showQuadrantModal.value = true;
            };

            const closeQuadrantModal = () => showQuadrantModal.value = false;

            // 保存【新建任务】
            const saveQuadrantTask = () => {
                if (!quadrantForm.text.trim()) { alert("请输入任务内容"); return; }
                
                let duration = 0;
                // ✅ 修改：输入的分钟 / 60 = 小时
                if (quadrantForm.duration) duration = Math.abs(parseFloat(quadrantForm.duration));

                tasks.value.push({
                    id: Date.now(), 
                    text: quadrantForm.text, 
                    done: false,
                    date: formatDateKey(selectedDate.value),
                    q: quadrantForm.q, 
                    duration: duration,
                    startDate: quadrantForm.startDate,
                    endDate: quadrantForm.isLongTerm ? '' : quadrantForm.endDate,
                    repeat: quadrantForm.repeat, 
                    repeatInterval: quadrantForm.repeatInterval || 1,
                    accumulated: 0, 
                    log: [], 
                    expanded: false,
                    subtasks: [] // ✅ 新增：初始化子任务数组
                });
                closeQuadrantModal();
            };

            
            const toggleTask = (task) => {
                // 1. 先判断当前状态
                const currentlyDone = isTaskDone(task, selectedDate.value);

                if (currentlyDone) {
                    // --- 如果已完成，执行“复活”操作 ---
                    
                    // A. 清除全局完成标记 (针对在进度页左滑完成的任务)
                    task.done = false;

                    // B. 如果是重复任务，清除今天的打卡记录
                    if (task.repeat && task.repeat !== 'none' && task.completedDates) {
                        const dateStr = formatDateKey(selectedDate.value);
                        const idx = task.completedDates.indexOf(dateStr);
                        if (idx > -1) task.completedDates.splice(idx, 1);
                    }
                } else {
                    // --- 如果未完成，执行“完成”操作 ---
                    
                    if (task.repeat && task.repeat !== 'none') {
                        // 重复任务：只打卡今天
                        const dateStr = formatDateKey(selectedDate.value);
                        if (!task.completedDates) task.completedDates = [];
                        if (!task.completedDates.includes(dateStr)) task.completedDates.push(dateStr);
                    } else {
                        // 普通任务：直接标记完成
                        task.done = true;
                    }
                }
            };
            const deleteTask = (id) => tasks.value = tasks.value.filter(t => t.id !== id);

            

            // 打开【编辑弹窗】
            const openEditModal = (task) => {
                editingTask.value = task;
                editForm.text = task.text;
                editForm.duration = task.duration ? task.duration : '';
                
                // 修改：如果任务没有日期，默认填入今天
                const today = getTodayStr();
                editForm.startDate = task.startDate || today; 
                editForm.endDate = task.endDate || today;
                
                editForm.repeat = task.repeat || 'none';
                editForm.repeatInterval = task.repeatInterval || 1;
                // ✅ 核心逻辑：如果 没有结束日期 且 重复，则视为“长期”
                // 注意：如果 endDate 是空字符串或者 null，就代表长期
                if (task.repeat !== 'none' && !task.endDate) {
                    editForm.isLongTerm = true;
                    editForm.endDate = ''; // 确保显示为空
                } else {
                    editForm.isLongTerm = false;
                }
            };

            const closeEditModal = () => {
                editingTask.value = null;
            };

            // 保存【编辑修改】
            const saveEditTask = () => {
                if (!editingTask.value) return;
                if (!editForm.text.trim()) { alert("内容不能为空"); return; }

                editingTask.value.text = editForm.text;
                editingTask.value.duration = editForm.duration ? Math.abs(parseFloat(editForm.duration)) : 0;
                editingTask.value.startDate = editForm.startDate;
                editingTask.value.endDate = editForm.isLongTerm ? '' : editForm.endDate;
                editingTask.value.repeat = editForm.repeat;
                editingTask.value.repeatInterval = editForm.repeatInterval || 1;
                closeEditModal();
            };

            // 删除当前任务
            const deleteCurrentTask = () => {
                if(!editingTask.value) return;
                if(confirm("确定要删除这个任务吗？")) {
                    deleteTask(editingTask.value.id);
                    closeEditModal();
                }
            };

           // --- 修复：长按 vs 单击 逻辑 (解决双重触发和滚动误触) ---
            let isLongPress = false; 
            let isScrolling = false; 
            
            // 新增：记录列表触摸的起始坐标，用于判断是否真的在滚动
            const listTouchStartX = ref(0);
            const listTouchStartY = ref(0);

            const handleTouchStart = (task, e) => {
                isScrolling = false; 
                isLongPress = false;
                
                // 1. 记录按下的初始坐标
                if (e && e.touches && e.touches.length > 0) {
                    listTouchStartX.value = e.touches[0].clientX;
                    listTouchStartY.value = e.touches[0].clientY;
                }

                pressTimer = setTimeout(() => {
                    isLongPress = true; 
                    if(navigator.vibrate) navigator.vibrate(50);
                    openEditModal(task); 
                }, 600);
            };

            const handleTouchMove = (e) => {
                clearTimeout(pressTimer); // 只要动了，就取消长按定时器

                // 2. 计算移动距离
                if (e && e.changedTouches && e.changedTouches.length > 0) {
                    const x = e.changedTouches[0].clientX;
                    const y = e.changedTouches[0].clientY;
                    
                    const moveX = Math.abs(x - listTouchStartX.value);
                    const moveY = Math.abs(y - listTouchStartY.value);

                    // 3. 只有当移动距离超过 10px 时，才判定为“滚动”
                    // 这样可以忽略手指点击时的微小震颤
                    if (moveX > 15 || moveY > 15) {
                        isScrolling = true;
                    }
                } 
                // else {
                //     // 如果没有事件对象（比如 mouseleave），为了安全起见视为滚动
                //     isScrolling = true;
                // }
            };

            // 1. 触摸结束只负责清理定时器，不处理业务逻辑
            const handleTouchEnd = (task) => {
                clearTimeout(pressTimer);
            };

            // ✅ 修改 handleTaskClick：支持双击修改工时，单击展开
            let taskClickTimer = null; // 用于存储单击的延时器

            const handleTaskClick = (task) => {
                if (isLongPress || isScrolling) return;

                const now = Date.now();
                
                // 1. 判断是否双击 (间隔 < 300ms) 改回 300
                if (lastTap.value.id === task.id && (now - lastTap.value.time) < 300) {
                    // --- 双击逻辑：修改工时 ---
                    clearTimeout(taskClickTimer); // 马上取消刚才那个准备执行的单击动作
                    editTaskProgress(task);       // 唤起修改工时弹窗
                    lastTap.value = { id: null, time: 0 }; // 重置状态
                } else {
                    // --- 单击逻辑：手风琴展开/收起 ---
                    lastTap.value = { id: task.id, time: now };
                    
                    // 延迟 300ms 执行展开，给双击留出反应时间 (改回 300)
                    taskClickTimer = setTimeout(() => {
                        // 原有的手风琴逻辑
                        if (!task.expanded) {
                            tasks.value.forEach(t => {
                                t.expanded = false;
                            });
                        }
                        task.expanded = !task.expanded;
                    }, 300);
                }
            };

            // ✅ 新增：专门处理子任务的双击逻辑
            const lastSubTap = ref({ id: null, time: 0 });

            const handleSubtaskClick = (sub) => {
                const now = Date.now();
                // 判断是否是同一个子任务，且间隔小于 300ms
                if (lastSubTap.value.id === sub.id && (now - lastSubTap.value.time) < 300) {
                    // 触发编辑
                    editSubtask(sub);
                    // 重置状态
                    lastSubTap.value = { id: null, time: 0 };
                } else {
                    // 记录第一次点击
                    lastSubTap.value = { id: sub.id, time: now };
                }
            };

            // --- 新增：安全地点击背景收起键盘 ---
            // 只要输入框加了 .stop，这个函数就永远不会在点击输入框时触发，绝对安全
            const handleBackgroundClick = (e) => {
                const targetTag = e.target.tagName;
                
                // ✅ 1. 如果点击的是输入框、按钮或任何交互元素，绝对不处理失焦
                if (e.target.closest('input, textarea, button, a, [role="button"]')) {
                    return;
                }

                // ✅ 2. 只有点击真正的空白容器层时，才考虑收起键盘
                if (targetTag === 'DIV' || targetTag === 'SECTION' || targetTag === 'BODY' || targetTag === 'HTML') {
                    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                        // ✅ 3. 额外保险：如果点击的是当前聚焦输入框的父容器，不触发失焦
                        // 这样即使点击了输入框边缘的 padding 也会保持聚焦
                        if (e.target.contains(document.activeElement)) {
                            return;
                        }
                        document.activeElement.blur();
                    }
                }
            };

            // --- 补全：子任务逻辑 ---
            const addSubtask = (task, event) => {
                const input = event.target; 
                const text = input.value.trim();
                if(!text) return;

                if(!task.subtasks) task.subtasks = [];
                
                task.subtasks.push({
                    id: Date.now(),
                    text: text,
                    done: false
                });
                
                input.value = ''; 
            };

            const toggleSubtask = (sub) => {
                sub.done = !sub.done;
            };

            const deleteSubtask = (task, subId) => {
                task.subtasks = task.subtasks.filter(s => s.id !== subId);
            };

            const editSubtask = (sub) => {
                sub.editing = true; // 开启编辑状态
                // 自动聚焦需要等 DOM 更新，这里可以用一个小技巧在 HTML 处理
            };
            // ⬆️⬆️⬆️ 新增结束 ⬆️⬆️⬆️
                            
            
            // ✅ 修改：拆分进行中和已完成任务
            const activeInboxTasks = computed(() => {
                // ✅ 新逻辑：只要 checkTaskVisible 说今天该做，就显示！
                // 这样既支持手动加的(有date)，也支持AI加的(有startDate)
                return tasks.value.filter(t => t.q === 0 && checkTaskVisible(t, selectedDate.value) && !isTaskDone(t, selectedDate.value));
            });

            const completedInboxTasks = computed(() => {
                // ✅ 新逻辑同上
                return tasks.value.filter(t => t.q === 0 && checkTaskVisible(t, selectedDate.value) && isTaskDone(t, selectedDate.value));
            });

            
            
            // ✅ 升级版 Top List：只包含【安排在今天】的 Q1-Q3 (高优) 任务
            const activeRecurringQuadrantTasks = computed(() => {
                return tasks.value.filter(t => {
                    // 1. 严格只看 Q1, Q2, Q3 (Q4 滚去下面)
                    if (![1, 2, 3].includes(t.q)) return false;
                    
                    // 2. 过滤已完成/工时已满
                    if (isTaskDone(t, selectedDate.value)) return false;
                    if (t.duration > 0 && (t.accumulated || 0) >= t.duration) return false;

                    // 3. 核心：只要 checkTaskVisible 说它今天该做，就放进来
                    // (现在支持了一次性任务，所以不一定要有 repeat 属性)
                    return checkTaskVisible(t, selectedDate.value);
                }).sort((a, b) => a.q - b.q);
            });
           

            
            // ✅ 升级版 Bottom List：方案 A (去重 + Q4收容 + 未来池)
            const activeQuadrantTasks = computed(() => {
                const sel = new Date(selectedDate.value);
                sel.setHours(0, 0, 0, 0);
                const selTime = sel.getTime();

                return tasks.value.filter(t => {
                // 1. 基础过滤：排除 Inbox (Q0)
                if (t.q <= 0) return false; 
                
                // 2. 完成过滤：只要在当天算作“已完成”，直接隐藏
                if (isTaskDone(t, selectedDate.value)) return false;

                // ✅ 修复 Bug 1：隐藏“非今日”的重复任务
                // 如果是重复任务，但根据规则今天不需要做（比如每3天一次，今天轮空），
                // 那么它既不该出现在 Top List，也不该出现在这里“诈尸”。
                if (t.repeat && t.repeat !== 'none' && !checkTaskVisible(t, selectedDate.value)) return false;

                // 3. 【去重熔断】：
                // 如果任务是 Q1-Q3 且 今天可见，它一定在 Top List 显示了，这里隐藏。
                // (Q4 会绕过这个检查，流到这里显示)
                if ([1,2,3].includes(t.q) && checkTaskVisible(t, selectedDate.value)) return false;

                // 4. 【过期熔断】：已过期的隐藏
                if (t.endDate && isTaskDone(t, selectedDate.value)) {
                    const e = new Date(t.endDate);
                    e.setHours(0,0,0,0);
                    if (selTime > e.getTime()) return false; 
                }

                // ✅ 修复 Bug 2：稳健的【未来熔断】
                // 不直接用 new Date(string)，避免 UTC 时区偏移导致“今天的任务被当成未来”
                if (t.startDate) {
                    const [y, m, d] = t.startDate.split('-').map(Number);
                    const startTs = new Date(y, m - 1, d).getTime(); // 强制构造本地 00:00
                    
                    // 只有当 开始时间 > 今天 00:00 时，才算未来任务
                    if (startTs > selTime) return false;
                }

                return true;

            }).sort((a, b) => {
                 // 5. 智能排序
                 if (a.startDate && !b.startDate) return -1;
                 if (!a.startDate && b.startDate) return 1;
                 if (a.startDate && b.startDate) {
                     return new Date(a.startDate) - new Date(b.startDate);
                 }
                 return a.q - b.q; 
            }); 
        });
            
            // 辅助：获取天数
            const getD = (c) => getDaysUntilData(c).days;
            // ✅ 新增：用于显示的“双倍列表”，实现无缝滚动
            // 如果列表项少于3个，就不复制（因为不会滚）；如果多于3个，就复制一份拼接在后面
            // 只有当满足“自动播放条件”时，才把列表复制一份，否则保持原样
            const displayUpcomingList = computed(() => {
                const list = homeUpcomingList.value;
                
                // 1. 即使总数 > 3，也要先计算是否满足“同天 >= 3”的严格条件
                const byDay = {};
                list.forEach(item => {
                    // computed 是懒执行的，所以这里调用定义在后面的 getDaysUntilData 是安全的
                    const key = getDaysUntilData(item).targetDateStr;
                    byDay[key] = (byDay[key] || 0) + 1;
                });
                
                // 2. 判断是否触发滚动
                const shouldScroll = Object.values(byDay).some(c => c >= 3);

                // 3. 只有需要滚动时，才复制列表实现无缝循环
                if (shouldScroll) {
                    return [...list, ...list]; 
                }
                
                // 4. 不需要滚动时，只显示原始的单份列表 (防止出现滑到后面是重复内容的情况)
                return list;
            });

            // 1. 首页列表：只显示 0 <= 天数 <= 10 的事件 (未来10天内)
            const homeUpcomingList = computed(() => {
                return countdowns.value
                    .filter(c => {
                        const days = getD(c);
                        return days >= 0 && days <= 10; 
                    })
                    .sort((a, b) => getD(a) - getD(b));
            });

            /* 近期重要自动播放逻辑已移动至 getDaysUntilData 定义之后，避免初始化顺序导致的白屏 */

            // 2. 倒数日页 - 即将到来 (所有未来事件，按时间排序，不分置顶)
            const upcomingList = computed(() => countdowns.value
                .filter(c => getD(c) >= 0)
                .sort((a,b) => getD(a) - getD(b))
            );

            // 4. 倒数日页 - 已过期组 (所有天数 < 0 的，无论是否置顶都归到这里)
            const expiredList = computed(() => countdowns.value
                .filter(c => getD(c) < 0)
                .sort((a,b) => getD(b) - getD(a)) // 过期越久的排越下面(或者反过来)
            );

            const progressTasks = computed(() => tasks.value.filter(t => t.duration > 0));
            
            /// ✅ 修改逻辑：
            // 进行中 = (工时没跑满) 且 (没被手动标记完成)
            const activeProgressTasks = computed(() => {
                return progressTasks.value.filter(t => !t.done && (t.accumulated || 0) < t.duration);
            });

            // 已完成 = (工时跑满了) 或者 (被手动标记完成了)
            const completedProgressTasks = computed(() => {
                return progressTasks.value.filter(t => t.done || (t.accumulated || 0) >= t.duration);
            });

            // ✅ 修正版：手动完成 = 全局结束
            const handleProgressComplete = (task) => {
                if(confirm(`确认要提前结束任务 "${task.text}" 吗？`)) {
                    // 不管是不是重复任务，在进度页点了完成，就是彻底不干了
                    task.done = true; 
                    
                    swipeItemId.value = null; 
                    if(navigator.vibrate) navigator.vibrate(50);
                }
            };

            // ⬇️⬇️⬇️ 【修改】进度页统计逻辑：只看总投入时长 + 达成项目数 ⬇️⬇️⬇️
            const progressStats = computed(() => {
                // 筛选出所有设定了工时的“长期项目”
                const allProjs = tasks.value.filter(t => t.duration > 0);
                
                // 1. 算出总共投入的时间 (Accumulated Total)
                const totalHours = allProjs.reduce((sum, t) => sum + (t.accumulated || 0), 0);
                
                // 2. 算出有多少个项目已经达标 (Accumulated >= Duration)
                const finishedCount = allProjs.filter(t => (t.accumulated || 0) >= t.duration).length;
                
                return {
                    hours: totalHours.toFixed(1), // 总投入小时
                    doneCount: finishedCount,     // 已达标个数
                    totalCount: allProjs.length   // 总项目数
                };
            });
            // ⬆️⬆️⬆️ 补回到这里 ⬆️⬆️⬆️

            // --- 其他 Helpers ---
            let pressTimer = null;
            const startPress = (id) => { pressTimer = setTimeout(() => togglePin(id), 600); };
            const cancelPress = () => clearTimeout(pressTimer);
            const togglePin = (id) => {
                const item = countdowns.value.find(c => c.id === id);
                if (item) { item.pinned = !item.pinned; if(navigator.vibrate) navigator.vibrate(50); }
            };

            const toggleTimerMode = () => {
                const modes = [25, 45, 60, 15];
                defaultDuration.value = modes[(modes.indexOf(defaultDuration.value) + 1) % modes.length];
                timeLeft.value = defaultDuration.value * 60;
            };
            // --- 核心修复：后台也能跑的计时器 ---
            let timerTargetTime = 0; // 记录预计结束的时间戳

            const startTimer = (task) => {
                currentFocusTask.value = task; 
                isFocusing.value = true; 
                
                // 关键：计算“未来结束的那一刻”的具体时间戳
                const now = Date.now();
                timerTargetTime = now + defaultDuration.value * 60 * 1000;
                
                // 立即刷新一次显示
                timeLeft.value = defaultDuration.value * 60;

                if (timerInterval) clearInterval(timerInterval);
                
                timerInterval = setInterval(() => {
                    const current = Date.now();
                    // 剩余时间 = 目标时间 - 当前时间 (这样算，无论你切后台多久，回来一减就是对的)
                    const diff = Math.ceil((timerTargetTime - current) / 1000);
                    
                    if (diff <= 0) {
                        timeLeft.value = 0;
                        stopTimer(true);
                        alert("专注完成！"); 
                    } else {
                        timeLeft.value = diff;
                    }
                }, 1000);
            };
           
            // --- 新增：顶部交互逻辑 ---
            const handleTimerClick = () => {
                if (isFocusing.value) {
                    // 如果正在专注，点击切换“停止菜单”
                    showTimerAction.value = !showTimerAction.value;
                    showTimeSelect.value = false;
                } else {
                    // 如果没在专注，点击切换“时间选择”
                    showTimeSelect.value = !showTimeSelect.value;
                    showTimerAction.value = false;
                }
            };

            const setDuration = (m) => {
                defaultDuration.value = m;
                timeLeft.value = m * 60; // 更新显示
                showTimeSelect.value = false; // 选完自动关
            };

            const closeTimerMenus = () => {
                showTimeSelect.value = false;
                showTimerAction.value = false;
            };

            
            
            // 请用这个覆盖原来的 stopTimer
            const stopTimer = (save) => {
                clearInterval(timerInterval); 
                isFocusing.value = false;
                closeTimerMenus(); // 关菜单
                
                // 恢复默认显示
                timeLeft.value = defaultDuration.value * 60;

                if (save && currentFocusTask.value) {
                    const added = defaultDuration.value / 60;
                    const t = currentFocusTask.value;
                    if(!t.accumulated) t.accumulated = 0; 
                    t.accumulated += added;
                    if(!t.log) t.log = []; 
                    t.log.unshift({ date: new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}), duration: added });
                }
                currentFocusTask.value = null;
            };
            const formatTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

            const daysInMonth = computed(() => {
                const days = []; const year = currentYear.value; const month = currentMonth.value;
                const lastDay = new Date(year, month + 1, 0).getDate();
                for (let i = 1; i <= lastDay; i++) {
                    const date = new Date(year, month, i);
                    const lunar = Lunar.fromDate(date);
                    let text = lunar.getDayInChinese();
                    if(lunar.getFestivals().length) text = lunar.getFestivals()[0];
                    else if(lunar.getJieQi()) text = lunar.getJieQi();
                    else if(lunar.getDay()===1) text = lunar.getMonthInChinese()+'月';
                    days.push({ dayNum: i, date: date, lunarText: text });
                }
                return days;
            });
            const firstDayOfWeek = computed(() => new Date(currentYear.value, currentMonth.value, 1).getDay());
            const lunarMonthStr = computed(() => Lunar.fromDate(new Date(currentYear.value, currentMonth.value, 15)).getMonthInChinese() + "月");
            const changeMonth = (d) => { const newDate = new Date(currentYear.value, currentMonth.value + d, 1); currentYear.value = newDate.getFullYear(); currentMonth.value = newDate.getMonth(); };
            

            // === ⬇️ 在这里添加滑动逻辑代码 ⬇️ ===
            const touchStartX = ref(0);
            
            const touchEndX = ref(0);

            const touchStart = (e) => {
                // 记录手指按下的 X 坐标
                touchStartX.value = e.changedTouches[0].screenX;
            };

            const touchEnd = (e) => {
                // 记录手指离开的 X 坐标
                touchEndX.value = e.changedTouches[0].screenX;
                handleSwipe();
            };

            const handleSwipe = () => {
                // 设置最小滑动距离为 40px，避免误触
                const minSwipeDistance = 40;
                
                // 向左滑 (手指从右往左移，数值变小) -> 下个月
                if (touchEndX.value < touchStartX.value - minSwipeDistance) {
                    changeMonth(1);
                }
                // 向右滑 (手指从左往右移，数值变大) -> 上个月
                if (touchEndX.value > touchStartX.value + minSwipeDistance) {
                    changeMonth(-1);
                }
            };

            // === ⬇️ 全局左右滑动切换日期 (防误触增强版) ⬇️ ===
            const pageTouchStartX = ref(null); // 改用 null 初始化，方便判断无效滑动
            const pageTouchStartY = ref(0);

            const handlePageTouchStart = (e) => {
                if (e.touches.length > 1) return; // 忽略多指缩放操作
                
                // 🌟 修复 1：防 iOS 边缘侧滑返回冲突 (屏幕边缘 30px 内的滑动不处理)
                if (e.touches[0].clientX < 30) {
                    pageTouchStartX.value = null; 
                    return;
                }

                pageTouchStartX.value = e.touches[0].clientX;
                pageTouchStartY.value = e.touches[0].clientY;
            };

            const handlePageTouchEnd = (e) => {
                // 如果是无效起始点，或者没有手指，直接退出
                if (e.changedTouches.length === 0 || pageTouchStartX.value === null) return;
                
                // 防止和横向滚动区域冲突
                if (e.target.closest('.overflow-x-auto')) return;

                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;

                const deltaX = touchEndX - pageTouchStartX.value;
                const deltaY = touchEndY - pageTouchStartY.value;

                // 🌟 修复 2：增加斜滑防误触 (绝对距离达标，且 X轴位移 必须大于 Y轴位移的 1.5倍)
                if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
                    const newDate = new Date(selectedDate.value);
                    if (deltaX < 0) {
                        newDate.setDate(newDate.getDate() + 1); // 左滑：明天
                    } else {
                        newDate.setDate(newDate.getDate() - 1); // 右滑：昨天
                    }
                    selectedDate.value = newDate;
                    if (navigator.vibrate) navigator.vibrate(20);
                }

                // 结束时重置坐标
                pageTouchStartX.value = null;
            };
            // === ⬆️ 结束 ⬆️ ===

            const jumpToToday = () => { 
                const t = new Date(); 
                currentYear.value = t.getFullYear(); 
                currentMonth.value = t.getMonth(); 
                selectedDate.value = t; 
                
                // ✅ 手动触发一次滚动，确保万无一失
                scrollToSelected();
            };
            const selectDate = (day) => selectedDate.value = day.date;
            const isSameDate = (d1, d2) => d1.getDate()===d2.getDate() && d1.getMonth()===d2.getMonth() && d1.getFullYear()===d2.getFullYear();
            const getDayClass = (day) => {
                if (isSameDate(day.date, selectedDate.value)) return 'bg-blue-600 dark:bg-blue-500 text-white shadow-lg ring-2 ring-blue-200 dark:ring-blue-800';
                if (isSameDate(day.date, new Date())) return 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/30';
                return 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300';
            };
            const getLunarClass = (day) => {
                if (isSameDate(day.date, selectedDate.value)) return 'text-white';
                const highlightList = ['春节', '端午', '中秋', '元旦', '清明', '国庆', '立春', '雨水', '惊蛰', '春分'];
                if (highlightList.some(f => day.lunarText.includes(f))) return 'text-red-500 dark:text-red-400 font-bold';
                return 'text-gray-600 dark:text-gray-400';
            };
            // ✅ 修正版：统一判断任务是否“完成”
            const isTaskDone = (task, date) => {
                // 1. 最高优先级：手动标记完成 (在进度页左滑或点击圆圈)
                if (task.done) return true;

                // 2. [新增核心修复]：如果工时跑满了，也视为已完成！
                // 这样它才能出现在底部的“已完成明细”弹窗里
                if (task.duration > 0 && (task.accumulated || 0) >= task.duration) return true;

                // 3. 次级优先级：如果是重复任务，检查“今天”有没有打卡
                if (task.repeat && task.repeat !== 'none') {
                    const dateStr = formatDateKey(date);
                    return task.completedDates && task.completedDates.includes(dateStr);
                }
                
                // 4. 兜底
                return false;
            };
            
            // ✅ 核心算法：判断任务在指定日期是否可见（支持间隔重复 & 一次性日期范围）
            const checkTaskVisible = (task, targetDateObj) => {
                const target = new Date(targetDateObj);
                target.setHours(0, 0, 0, 0);
                const targetTime = target.getTime();

                // --- 1. 一次性任务 (Non-Recurring) 的新逻辑 ---
                if (!task.repeat || task.repeat === 'none') {
                     // 规则 A：如果没有开始日期，视为“积压(Backlog)”，不属于“今天” -> 返回 false
                     if (!task.startDate) return false; 
                     
                     const start = new Date(task.startDate);
                     start.setHours(0,0,0,0);
                     // 规则 B：如果还没到开始日期 -> 不显示
                     if (targetTime < start.getTime()) return false; 
                     
                     // 规则 C：如果设置了结束日期，且今天已经超过了结束日期 -> 不显示 (过期)
                     if (task.endDate) {
                         const end = new Date(task.endDate);
                         end.setHours(0,0,0,0);
                         if (targetTime > end.getTime()) return false; 
                     }
                     
                     // 否则：今天在 [开始, 结束] 范围内 -> 显示
                     return true; 
                }

                // --- 2. 重复任务 (Recurring) 的逻辑 (保持不变) ---
                
                // 如果没有开始日期，默认从创建那天算起
                if (!task.startDate) return true;

                const start = new Date(task.startDate);
                start.setHours(0, 0, 0, 0);

                const end = task.endDate ? new Date(task.endDate) : null;
                if (end) end.setHours(0, 0, 0, 0);

                const startTime = start.getTime();

                // 基础范围检查
                if (targetTime < startTime) return false; 
                if (end && targetTime > end.getTime()) return false; 

                // 间隔算法
                const interval = parseInt(task.repeatInterval || 1);
                
                if (task.repeat === 'day') {
                    const diffDays = Math.floor((targetTime - startTime) / (24 * 60 * 60 * 1000));
                    return diffDays % interval === 0;
                }
                
                if (task.repeat === 'week') {
                    const diffWeeks = Math.floor((targetTime - startTime) / (7 * 24 * 60 * 60 * 1000));
                    return target.getDay() === start.getDay() && (diffWeeks % interval === 0);
                }

                if (task.repeat === 'month') {
                    let diffMonths = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
                    return target.getDate() === start.getDate() && (diffMonths % interval === 0);
                }

                if (task.repeat === 'year') {
                    const diffYears = target.getFullYear() - start.getFullYear();
                    const isSameDate = target.getMonth() === start.getMonth() && target.getDate() === start.getDate();
                    return isSameDate && (diffYears % interval === 0);
                }

                return true;
            };

            const hasTask = (date) => { const key = formatDateKey(date); return tasks.value.some(t => t.date === key && !t.done); };
            // --- 核心升级：支持农历和重复周期的计算 ---
            // --- 核心升级：支持农历和重复周期的计算 ---
            const getDaysUntilData = (item) => {
                const now = new Date();
                now.setHours(0,0,0,0);
                
                let targetDate = new Date(item.date);
                targetDate.setHours(0,0,0,0);
                let nextDate = new Date(targetDate);
                const todayTime = now.getTime();

                if (item.repeat === 'none' && !item.isLunar) {
                    // 普通不重复
                } else {
                    // 辅助：从公历年推算该年对应的农历日期
                    const getSolarFromLunar = (solarYear, lMonth, lDay) => {
                        let candidates = [];
                        for (let y = solarYear - 1; y <= solarYear + 1; y++) {
                            try {
                                const l = Lunar.fromYmd(y, Math.abs(lMonth), lDay); 
                                const s = l.getSolar();
                                const d = new Date(s.getYear(), s.getMonth() - 1, s.getDay());
                                candidates.push(d);
                            } catch(e) {}
                        }
                        return candidates;
                    };

                    if (item.isLunar) {
                        const baseLunar = Lunar.fromDate(new Date(item.date));
                        const lMonth = baseLunar.getMonth();
                        const lDay = baseLunar.getDay();
                        
                        const candidates = getSolarFromLunar(now.getFullYear(), lMonth, lDay);
                        candidates.sort((a,b) => a-b);
                        const future = candidates.find(d => d.getTime() >= todayTime - 86400000); 
                        if (future) nextDate = future;
                    } else {
                        // 公历重复逻辑
                        if (item.repeat === 'year') {
                            nextDate.setFullYear(now.getFullYear());
                            if (nextDate.getTime() < todayTime - 86400000) nextDate.setFullYear(now.getFullYear() + 1);
                        } else if (item.repeat === 'month') {
                            nextDate.setFullYear(now.getFullYear());
                            nextDate.setMonth(now.getMonth());
                            if (nextDate.getTime() < todayTime - 86400000) nextDate.setMonth(now.getMonth() + 1);
                        } else if (item.repeat === 'week') {
                            const targetDay = new Date(item.date).getDay();
                            const currentDay = now.getDay();
                            let diff = targetDay - currentDay;
                            if (diff < 0) diff += 7;
                            nextDate = new Date(now);
                            nextDate.setDate(now.getDate() + diff);
                        } else if (item.repeat === 'day') {
                            nextDate = new Date(now);
                        }
                    }
                }

                const diffTime = nextDate - now;
                const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                const y = nextDate.getFullYear();
                const m = String(nextDate.getMonth()+1).padStart(2,'0');
                const d = String(nextDate.getDate()).padStart(2,'0');
                
                return { days, targetDateStr: `${y}-${m}-${d}` };
            };

            // ✅ 新增：当同一天事件数量 >= 3 时，右下「近期重要」区域自动滚动播放
            const upcomingScroll = ref(null);
            const upcomingAutoplay = computed(() => {
                const byDay = {};
                homeUpcomingList.value.forEach(item => {
                    const key = getDaysUntilData(item).targetDateStr;
                    byDay[key] = (byDay[key] || 0) + 1;
                });
                return Object.values(byDay).some(c => c >= 3);
            });
            const upcomingPaused = ref(false);
            let upcomingRAF = 0;
            let scrollPos = 0; 

            const startUpcomingAutoplay = () => {
                if (currentTab.value !== 'now' || !upcomingAutoplay.value) return;
                const el = upcomingScroll.value;
                if (!el) return;
                
                if (upcomingRAF) { cancelAnimationFrame(upcomingRAF); upcomingRAF = 0; }
                
                scrollPos = el.scrollLeft; 
                const speed = 0.3; // 保持你喜欢的速度
                
                const step = () => {
                    if (upcomingPaused.value) {
                        upcomingRAF = requestAnimationFrame(step);
                        return;
                    }
                    
                    scrollPos += speed;
                    el.scrollLeft = scrollPos;
                    
                    // ✅ 核心修改：无缝循环逻辑
                    // 以前是 (scrollPos >= max - 1)
                    // 现在是：只要滚动的距离超过了“内容总宽度的一半”，就立刻归零
                    // 因为内容是双倍的，一半的宽度正好就是“原始列表”的长度
                    const resetThreshold = el.scrollWidth / 2;
                    
                    // ✅ 核心修复：精度保留
                    if (scrollPos >= resetThreshold) {
                        // 不要直接设为 0，而是减去阈值
                        // 例子：如果滚到了 500.3，阈值是 500
                        // 500.3 - 500 = 0.3 (这样保留了 0.3 的动量，不会卡顿)
                        scrollPos -= resetThreshold; 
                        el.scrollLeft = scrollPos;
                    }
                    
                    upcomingRAF = requestAnimationFrame(step);
                };
                upcomingRAF = requestAnimationFrame(step);
            };

            const stopUpcomingAutoplay = () => {
                if (upcomingRAF) cancelAnimationFrame(upcomingRAF);
                upcomingRAF = 0;
            };
            const pauseUpcoming = () => { upcomingPaused.value = true; };
            const resumeUpcoming = () => { upcomingPaused.value = false; };
            watch([upcomingAutoplay, currentTab, homeUpcomingList], () => {
                nextTick(() => {
                    if (currentTab.value === 'now' && upcomingAutoplay.value && homeUpcomingList.value.length) {
                        startUpcomingAutoplay();
                    } else {
                        stopUpcomingAutoplay();
                    }
                });
            }, { deep: true, immediate: true });
            watch(() => upcomingScroll.value, (el) => {
                if (el && currentTab.value === 'now' && upcomingAutoplay.value && homeUpcomingList.value.length) {
                    startUpcomingAutoplay();
                }
            });

            
            const showCompletedQ = reactive({ 1: false, 2: false, 3: false, 4: false });

            
            const getCompletedTasksByQ = (q) => {
                const sel = new Date(selectedDate.value);
                sel.setHours(0,0,0,0);
                const selTime = sel.getTime();

                return tasks.value.filter(t => {
                    if (t.q !== q) return false;
                    
                    // 核心区别：这里只返回【已完成】的任务
                    if (!isTaskDone(t, selectedDate.value)) return false;

                    // 日期筛选 (保持一致，避免显示太久远的历史任务)
                    if (t.startDate) {
                        const s = new Date(t.startDate);
                        s.setHours(0,0,0,0);
                        if (selTime < (s.getTime() - 3 * 24 * 60 * 60 * 1000)) return false; 
                    }
                    return true;
                }).sort((a, b) => b.id - a.id); // 最近完成的排前面
            };
            
            const getTasksByQ = (q) => {
                // 预处理选中的日期
                const sel = new Date(selectedDate.value);
                sel.setHours(0,0,0,0);
                const selTime = sel.getTime();

                return tasks.value.filter(t => {
                    if (t.q !== q) return false;

                    // --- 🚀 核心修复：在这里加上全局熔断逻辑 ---
                    // 1. 如果任务已经被“全局标记完成”（在进度页左滑了），无论哪天都不显示
                    if (t.done) return false;
                    
                    // 2. 如果任务工时已经跑满，无论哪天都不显示
                    if (t.duration > 0 && (t.accumulated || 0) >= t.duration) return false;
                    // ------------------------------------------------

                    // A. 如果是重复任务，走新的间隔算法
                    if (t.repeat && t.repeat !== 'none') {
                         return checkTaskVisible(t, selectedDate.value);
                    }
                    
                    // B. 如果是一次性任务，走旧逻辑 (为了显示逾期任务)
                    // 1. 开始日期检查
                    if (t.startDate) {
                        const s = new Date(t.startDate);
                        s.setHours(0,0,0,0);
                        if (selTime < (s.getTime() - 1 * 24 * 60 * 60 * 1000)) return false; // 提前1天显示
                    }
                    // 2. 结束日期检查 (仅当已完成且过期时隐藏)
                    if (t.endDate) {
                        const e = new Date(t.endDate);
                        e.setHours(0,0,0,0);
                        // 注意：上面已经 check 了 t.done，这里其实只有未完成的任务会走到这
                        if (t.done && selTime > e.getTime()) return false;
                    }

                    return true;
                });
            };
            
            const getRepeatText = (r) => {
                const map = { 'none': '', 'year': '每年', 'month': '每月', 'week': '每周', 'day': '每日' };
                return map[r] || '';
            };
            
            const addCountdown = () => { const n = prompt("事件:"); if(!n) return; const d = prompt("日期(YYYY-MM-DD):"); if(n&&d) countdowns.value.push({ id: Date.now(), name: n, date: d, color: 'border-blue-500', pinned: false }); };
            const deleteCountdown = (id) => { if(confirm('删除?')) countdowns.value = countdowns.value.filter(c => c.id !== id); };
            const editCountdown = (item) => { const n = prompt("名称:", item.name); const d = prompt("日期:", item.date); if(n&&d) { item.name = n; item.date = d; } };

            // --- 新增：双击修改工时 & 模拟双击逻辑 ---
            const lastTap = ref({ id: null, time: 0 });

            // ✅ 新增：工时弹窗状态
            const showProgressModal = ref(false);
            const progressForm = reactive({ taskId: null, taskText: '', hours: 0 });
            const progressInputRef = ref(null);

            // ✅ 修改：增加防抖逻辑，完美区分单击和双击
            let clickTimer = null; // 用于存储定时器

            // ✅ 修改：专注页左下角交互逻辑
            // 需求：单击卡片本身不弹窗（只允许在四象限页修改），保留双击改工时，保留圆点点击完成
            const handleTileClick = (task) => {
                const now = Date.now();
                
                // 1. 判断是否双击 (间隔 < 300ms)
                if (lastTap.value.id === task.id && (now - lastTap.value.time) < 300) {
                    // --- 双击逻辑：修改工时 ---
                    clearTimeout(clickTimer); // 清除潜在的定时器
                    editTaskProgress(task);   // 唤起修改工时弹窗
                    lastTap.value = { id: null, time: 0 }; // 重置状态
                } else {
                    // --- 单击逻辑 ---
                    // 仅记录点击时间，用于检测下一次是否是双击
                    lastTap.value = { id: task.id, time: now };
                    
                    // ❌ 移除：clickTimer = setTimeout(() => { openEditModal(task); }, 300);
                    // 现在单击卡片空白处什么都不会发生，完美符合你的要求。
                }
            };

            // ✅ 修改：唤起自定义弹窗，而不是 ugly prompt
            // ✅ 修改 1：打开弹窗时，输入框留空，不再显示总数
            const editTaskProgress = (task) => {
                progressForm.taskId = task.id;
                progressForm.taskText = task.text;
                progressForm.hours = ''; // 👈 关键：设为空，方便直接输入新增量
                showProgressModal.value = true;
                
                // 自动聚焦
                setTimeout(() => {
                    if(progressInputRef.value) progressInputRef.value.focus();
                }, 100);
            };

            // ✅ 修改 2：保存时，执行“累加”逻辑
            const saveTaskProgress = () => {
                const task = tasks.value.find(t => t.id === progressForm.taskId);
                if (task) {
                    // ✅ 修改：获取输入的“分钟”，然后除以 60 转成小时
                    const inputMin = parseFloat(progressForm.hours);
                    
                    if (!isNaN(inputMin) && inputMin !== 0) {
                        const addedHours = inputMin / 60; // 核心转换
                        
                        // 1. 更新总工时 (依然是小时)
                        if (!task.accumulated) task.accumulated = 0;
                        task.accumulated += addedHours;
                        
                        if (task.accumulated < 0) task.accumulated = 0;
                        
                        // 2. 记录日志 (记录的是小时，这样显示的时候还是 +0.5h)
                        if(!task.log) task.log = [];
                        task.log.unshift({
                            date: new Date().toLocaleString('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}),
                            duration: addedHours, // 👈 存进去的是小时
                            note: '手动调整'
                        });
                    }
                }
                showProgressModal.value = false;
            };

            // ✅ 进度页专用：区分单击和双击
            // 这段代码既保留了“单击展开明细”，又增加了“双击修改工时”
            let progressClickTimer = null; 

            const handleProgressItemClick = (task) => {
                const now = Date.now();
                
                // 判断是否双击
                if (lastTap.value.id === task.id && (now - lastTap.value.time) < 300) {
                    // --- 双击情况：修改工时 ---
                    clearTimeout(progressClickTimer); 
                    editTaskProgress(task);           
                    lastTap.value = { id: null, time: 0 }; 
                } else {
                    // --- 单击情况：展开/收起详情 ---
                    lastTap.value = { id: task.id, time: now };
                    
                    progressClickTimer = setTimeout(() => {
                        // ✅ 新增手风琴逻辑：
                        
                        // 1. 先记录当前点击的任务原本是不是开着的
                        const wasExpanded = task.expanded;

                        // 2. 暴力关掉所有任务 (无论是专注页还是进度页的，统统收起)
                        tasks.value.forEach(t => {
                            t.expanded = false;
                        });

                        // 3. 如果原本是关着的，现在才把它打开
                        // (如果原本是开着的，第2步已经把它关了，这里就不操作，实现了“收起”效果)
                        if (!wasExpanded) {
                            task.expanded = true;
                        }

                    }, 300);
                }
            };

            // --- 倒数日左滑删除逻辑 & 长按逻辑 ---
            const swipeItemId = ref(null); // 记录当前哪个 ID 被滑开了
            const startX = ref(0);
            const currentOffsetX = ref(0);
            let swipeStartY = 0; 
            let swipeLongPressTimer = null; 
            let isSwipeLongPress = false; 

            const handleSwipeStart = (e, id, item = null, type = '') => {
                if (swipeItemId.value !== id) {
                    swipeItemId.value = null; 
                }
                startX.value = e.touches[0].clientX;
                swipeStartY = e.touches[0].clientY;
                
                // 新增：长按触发逻辑
                isSwipeLongPress = false;
                if (item && type === 'countdown') {
                    swipeLongPressTimer = setTimeout(() => {
                        isSwipeLongPress = true;
                        if(navigator.vibrate) navigator.vibrate(50);
                        openCountdownModal('edit', item); // 唤起编辑弹窗
                    }, 600);
                }
            };

            const handleSwipeMove = (e, id) => {
                const deltaX = e.touches[0].clientX - startX.value;
                const deltaY = e.touches[0].clientY - swipeStartY;
                
                // 新增：如果手指移动超过 10px (说明在滚动或滑除)，立刻取消长按
                if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                    clearTimeout(swipeLongPressTimer);
                }

                // 只有向左滑且滑动距离大于 10px 才触发预览
                if (deltaX < -10) {
                    currentOffsetX.value = deltaX;
                }
            };

            const handleSwipeEnd = (e, id) => {
                clearTimeout(swipeLongPressTimer); // 手指离开，清理长按定时器

                // 如果滑动超过 50px，就保持打开状态
                if (currentOffsetX.value < -50) {
                    swipeItemId.value = id;
                } else {
                    swipeItemId.value = null;
                }
                currentOffsetX.value = 0;
            };

            // 新增：专用于倒数日的点击处理
            const handleCountdownClick = (id) => {
                if (isSwipeLongPress) return; // 如果刚刚触发了长按，屏蔽本次单击
                if (swipeItemId.value === id) {
                    swipeItemId.value = null; // 如果当前是滑开状态，单击将其收起
                }
            };
            
            // 方案A: 双击 Logo 刷新
            // 使用时间差判断双击，比 @dblclick 在手机上反应更快
            const lastLogoTap = ref(0);
            const isLogoAnimating = ref(false); // 1. 新增控制变量

            const handleLogoClick = () => {
                // 2. 无论单击双击，先触发“Q弹”动画
                isLogoAnimating.value = true;
                // 200毫秒后自动还原，形成“缩放-还原”的完整视觉过程
                setTimeout(() => {
                    isLogoAnimating.value = false;
                }, 200);

                const now = Date.now();
                if (now - lastLogoTap.value < 300) {
                    if(navigator.vibrate) navigator.vibrate(50); 
                    window.location.reload();
                } else {
                    lastLogoTap.value = now;
                }
            };

            // 方案B: 专注图标连点 5 下刷新
            let focusTapCount = 0;
            let focusTapTimer = null;
            
            const handleFocusTabClick = () => {
                // 1. 如果当前已经是专注页，才开始计数
                if (currentTab.value === 'now') {
                    focusTapCount++;
                    
                    // 清除重置计时器
                    clearTimeout(focusTapTimer);
                    
                    // 如果 500ms 内没有下一次点击，重置计数
                    focusTapTimer = setTimeout(() => {
                        focusTapCount = 0;
                    }, 500);

                    if (focusTapCount >= 5) {
                        if(navigator.vibrate) navigator.vibrate([50, 50, 50]); // 震动3下提示
                        window.location.reload();
                        focusTapCount = 0;
                    }
                }
                
                // 2. 无论如何，先切换到专注页
                currentTab.value = 'now';
            };

            // --- 🚀 新增变量：控制复活弹窗 ---
            const showRestoreModal = ref(false);
            const taskToRestore = ref(null);
            const restorePromptText = ref('');
            const restoreActionType = ref('normal'); // 'normal' | 'reset_progress'

            // --- 修改后的触发函数：不再直接弹窗，而是打开美化版 Modal ---
            const restoreTask = (taskProxy) => {
                const task = tasks.value.find(t => t.id === taskProxy.id);
                if (!task) return;

                taskToRestore.value = task;

                // 1. 情况 A：工时跑满
                if (task.duration > 0 && (task.accumulated||0) >= task.duration) {
                    restorePromptText.value = `该任务工时已满 (${task.duration}h)。\n复活将重置进度为 0，确定吗？`;
                    restoreActionType.value = 'reset_progress';
                } 
                // 2. 情况 B：普通完成
                else {
                    restorePromptText.value = `确定要撤销“${task.text}”的完成状态，\n将其恢复到进行中列表吗？`;
                    restoreActionType.value = 'normal';
                }

                showRestoreModal.value = true;
                if(navigator.vibrate) navigator.vibrate(10);
            };

            // --- 新增：执行复活的逻辑 ---
            const confirmRestore = () => {
                const task = taskToRestore.value;
                if (!task) return;

                if (restoreActionType.value === 'reset_progress') {
                    // 重置工时并复活
                    task.done = false;
                    task.accumulated = 0;
                    // 可选：记录一条重置日志
                    if(!task.log) task.log = [];
                    task.log.unshift({
                        date: new Date().toLocaleString('zh-CN', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'}),
                        duration: 0,
                        note: '任务复活重置'
                    });
                } else {
                    // 普通复活
                    task.done = false;
                    
                    // 如果是重复任务，撤销今天的打卡
                    if (task.repeat && task.repeat !== 'none' && task.completedDates) {
                        const dateStr = formatDateKey(selectedDate.value);
                        task.completedDates = task.completedDates.filter(d => d !== dateStr);
                    }
                }

                if(navigator.vibrate) navigator.vibrate(50);
                showRestoreModal.value = false;
                taskToRestore.value = null;
            };

            // 1. 定义 AI 配置状态
            const showAiConfigModal = ref(false);
            const aiConfig = reactive({
                model: localStorage.getItem('ff_ai_model') || 'gemini-1.5-flash',
                key: localStorage.getItem('ff_ai_key') || ''
            });

            // 2. 定义保存函数
            const saveAiConfig = () => {
                if (!aiConfig.key) {
                    alert("请填写 API Key 以接通电力");
                    return;
                }
                localStorage.setItem('ff_ai_model', aiConfig.model);
                localStorage.setItem('ff_ai_key', aiConfig.key);
                showAiConfigModal.value = false;
                alert("⚡ 电力已接通！AI 教练已就绪。");
            };


           
            const showAddIdentityModal = ref(false);
    const showEditIdentityModal = ref(false);
    const newIdentityInput = ref('');
    const editingIdentity = ref(null);
    const editIdentityInput = ref('');

    const openAddIdentityModal = () => { showAddIdentityModal.value = true; };

    const startIdentityPress = (id) => {
        // 使用全局定义的 pressTimer (约398行已定义)
        pressTimer = setTimeout(() => {
            if(navigator.vibrate) navigator.vibrate(50);
            editingIdentity.value = id;
            editIdentityInput.value = id.name;
            showEditIdentityModal.value = true;
        }, 600);
    };

    const clearIdentityPress = () => {
        clearTimeout(pressTimer);
    };

    const confirmAddIdentity = () => {
        if (!newIdentityInput.value.trim()) return;
        const newId = { id: 'custom-' + Date.now(), name: newIdentityInput.value, icon: '✨', color: 'indigo' };
        identities.value.push(newId);
        activeIdentity.value = newId;
        saveIdentities(); 
        newIdentityInput.value = '';
        showAddIdentityModal.value = false;
    };

    const confirmEditIdentity = () => {
        if (!editIdentityInput.value.trim() || !editingIdentity.value) return;
        editingIdentity.value.name = editIdentityInput.value;
        saveIdentities();
        showEditIdentityModal.value = false;
    };

    const deleteIdentity = () => {
        if (!editingIdentity.value) return;
        if (confirm(`确定要删除“${editingIdentity.value.name}”？`)) {
            identities.value = identities.value.filter(i => i.id !== editingIdentity.value.id);
            if (activeIdentity.value?.id === editingIdentity.value.id) {
                activeIdentity.value = identities.value[0] || null;
            }
            saveIdentities();
            showEditIdentityModal.value = false;
        }
    };

    // FutureFlow/js/app.js 约 1440 行
    const isAnalyzing = ref(false);

    const runAiAnalysis = async () => {
        if (!aiConfig.key) { showAiConfigModal.value = true; return; }
        if (!web3Project.value.name) { alert("请先输入内容"); return; }
        
        isAnalyzing.value = true;
        const GEMINI_PROXY = 'https://futureflowlab.mzdesx.workers.dev'; 

        try {
            // 🚀 核心分支：根据开关选择 Prompt
            let currentPrompt = FLASH_PROMPT;
            if (labMode.value === 'strategy') currentPrompt = STRATEGY_PROMPT;
            if (labMode.value === 'extract') currentPrompt = EXTRACT_PROMPT;
            
            const promptText = `${currentPrompt}\n用户身份: ${activeIdentity.value.name}\n目标项目/内容: ${web3Project.value.name}`;
            
            let rawText = "";

             if (aiConfig.model === 'deepseek-chat') {
                 // DeepSeek 请求代码
                 const response = await fetch("https://api.deepseek.com/chat/completions", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.key}` },
                    body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: "你只输出JSON。" }, { role: "user", content: promptText }], temperature: 1.1 })
                });
                const data = await response.json();
                rawText = data.choices[0].message.content;
             } else {
                 // Gemini 请求代码
                 const response = await fetch(`${GEMINI_PROXY}/v1beta/models/${aiConfig.model}:generateContent?key=${aiConfig.key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
                });
                const data = await response.json();
                rawText = data.candidates[0].content.parts[0].text;
             }
            
            console.log("AI 回传:", rawText);
            const jsonMatch = rawText.match(/\{[\s\S]*\}/); 
            
            if (jsonMatch) {
                const cleanJson = JSON.parse(jsonMatch[0]);

                addToHistory(promptText, cleanJson);
                
                // 🧹 清空旧数据
                web3Project.value.plans = [];

                if (labMode.value === 'strategy') {
                    // ♟️ 战略模式：读取 options 数组
                    if (cleanJson.options && Array.isArray(cleanJson.options)) {
                        web3Project.value.plans = cleanJson.options;
                    } else {
                        // 容错：如果 AI 还是吐了单个对象
                        web3Project.value.plans = [cleanJson];
                    }
                } else {
                    // ⚡ 闪电模式 和 📥 萃取模式：构造成一个单元素数组，方便统一 UI
                    web3Project.value.plans = [{
                        type: labMode.value === 'extract' ? '💡 灵感萃取' : '⚡ 极速行动',
                        // ✅ 修复：正确映射 systemName，防止 UI 显示“系统名称”这个占位符
                        systemName: cleanJson.systemName || (labMode.value === 'extract' ? '核心打法提炼' : '单点突破'), 
                        analysis: cleanJson.stretchGoal,
                        setupAction: cleanJson.atomicStart,
                        milestones: cleanJson.steps || []
                    }];
                }
                web3Project.value.selectedPlanIndex = 0;
                return;
            }
            throw new Error("格式解析失败");

        } catch (e) {
            console.error(e);
            alert("AI 请求失败，请检查网络或 API Key");
        } finally {
            isAnalyzing.value = false;
        }
    };


 
    const startEvolution = () => {
        const plan = web3Project.value.currentPlan; 
        if (!plan) return;

        // 🐛 核心修复 2：获取精确的本地时间戳，解决 UTC 时差导致的丢失问题
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${dayStr}`; 
        const dateKey = formatDateKey(d); // 兼容旧版日期的判断逻辑
        
        // 兼容提取出的各项字段
        const milestones = plan.milestones || plan.steps || [];
        const subtasks = milestones.map(s => ({ 
            id: Date.now() + Math.random(), text: s, done: false 
        }));

        // 动态判断当前是不是战略模式
        const isStrategy = plan.weeklySchedule || (plan.options && plan.options.length > 0) || (typeof labMode !== 'undefined' && labMode.value === 'strategy') || (typeof isStrategyMode !== 'undefined' && isStrategyMode.value === true);

        if (isStrategy) {
            // --- ♟️ 战略模式：部署系统 ---
            if (plan.setupAction || plan.atomicStart) {
                tasks.value.unshift({
                    id: Date.now(),
                    text: `🚀 [启动] ${plan.setupAction || plan.atomicStart}`,
                    q: 2, 
                    done: false,
                    date: dateKey, // 👈 补全 date 字段
                    duration: 0.5,
                    startDate: todayStr,
                    endDate: todayStr,
                    repeat: 'none',
                    subtasks: []
                });
            }
            
            if (plan.weeklySchedule && plan.weeklySchedule.length > 0) {
                plan.weeklySchedule.forEach((dayPlan, index) => {
                    const targetDate = new Date();
                    targetDate.setDate(targetDate.getDate() + index); 
                    
                    const ty = targetDate.getFullYear();
                    const tm = String(targetDate.getMonth() + 1).padStart(2, '0');
                    const td = String(targetDate.getDate()).padStart(2, '0');
                    const dateStr = `${ty}-${tm}-${td}`;

                    const dailySubtasks = (dayPlan.tasks || []).map(t => ({
                        id: Date.now() + Math.random(), text: t, done: false
                    }));

                    setTimeout(() => {
                        tasks.value.push({
                            id: Date.now() + Math.random(),
                            text: `[周${"日一二三四五六".charAt(targetDate.getDay())}] ${dayPlan.theme} (${plan.systemName})`,
                            q: 2, 
                            done: false,
                            date: formatDateKey(targetDate), // 👈 补全 date 字段
                            duration: plan.duration || 0.5,
                            startDate: dateStr, 
                            endDate: '',        
                            repeat: 'week',     
                            repeatInterval: 1,  
                            expanded: false,
                            subtasks: dailySubtasks
                        });
                    }, index * 50);
                });
                alert(`已为你生成未来 ${plan.weeklySchedule.length} 天的定制计划！请去四象限查看。`);

            } else if (plan.systemName) {
                setTimeout(() => {
                     tasks.value.push({
                        id: Date.now() + 1,
                        text: plan.routine || plan.systemName, 
                        q: 2,
                        done: false,
                        date: dateKey, // 👈 补全 date 字段
                        duration: plan.duration || 0.5,
                        startDate: todayStr,
                        endDate: '',
                        repeat: plan.frequency || 'day',
                        repeatInterval: 1,
                        expanded: true,
                        subtasks: subtasks 
                    });
                }, 10);
            }
        } else {
            // --- ⚡ 闪电模式 & 📥 萃取模式：单点突破 ---
            // 自动判断是萃取还是闪电
            const isExtract = plan.type === '💡 灵感萃取' || !!plan.systemName;
            
            // 优先拿具体动作，没有就用系统名，最后才是项目名
            const mainText = plan.setupAction || plan.atomicStart || plan.systemName || web3Project.value.name;

            tasks.value.unshift({
                id: Date.now(),
                text: isExtract ? `💡 ${mainText}` : `⚡ ${mainText}`,
                q: isExtract ? 2 : 1, // 💡 萃取放入 Inbox(Q2)，⚡ 闪电放入 Q1
                done: false,
                date: dateKey, // 🐛 核心修复 3：补全 date 字段，不再离奇失踪
                duration: 0.5,
                startDate: todayStr,
                endDate: todayStr,
                repeat: 'none',
                accumulated: 0,
                log: [],
                expanded: true,
                subtasks: subtasks
            });
        }

        currentTab.value = 'now'; 
        web3Project.value.name = '';
        web3Project.value.stretchGoal = '';
        web3Project.value.atomicStart = '';
        web3Project.value.plans = []; 
    };

    const handleProgressScroll = (e) => {
            // 当滚动超过 100px 时显示返回按钮
            showProgressFloatBtn.value = e.target.scrollTop > 100;
        };

    // --- 🚀 新增：底部四象限面板折叠逻辑 ---
            const isBottomPanelExpanded = ref(true); // 默认展开
            const autoCollapsed = ref(false); // 🌟 新增：记录是否是系统自动折叠的

            // 1. 计算专注页当前显示的任务总数
            const totalNowTasksCount = computed(() => {
                return activeRecurringQuadrantTasks.value.length + activeInboxTasks.value.length;
            });

            // 2. 监听任务总数变化（智能优先级判断）
            watch(totalNowTasksCount, (newCount, oldCount) => {
                const old = oldCount || 0;
                
                // 【情况A：任务突破 6 条】
                if (newCount > 5 && old <= 5) {
                    // 如果面板当前是展开的，系统就帮它收起，并打上“系统代劳”的标记
                    if (isBottomPanelExpanded.value) {
                        isBottomPanelExpanded.value = false;
                        autoCollapsed.value = true; 
                    }
                } 
                // 【情况B：任务回落到 6 条及以下】
                else if (newCount <= 5 && old > 5) {
                    // 🌟 核心判断：只有当面板是“被系统自动收起”的，系统才负责把它展开
                    // 如果是你手动收起的 (autoCollapsed 为 false)，系统绝对不干预！
                    if (autoCollapsed.value && !isBottomPanelExpanded.value) {
                        isBottomPanelExpanded.value = true;
                        autoCollapsed.value = false; // 任务完成，重置标记
                    }
                }
            }, { immediate: true });

            // 3. 简单的切换函数（手动控制）
            const toggleBottomPanel = () => {
                isBottomPanelExpanded.value = !isBottomPanelExpanded.value;
                autoCollapsed.value = false; // 🌟 只要手动干预，立刻清除系统标记
                if(navigator.vibrate) navigator.vibrate(10);
            };

            // 4. 处理把手的滑动手势（手动控制）
            let panelTouchStartY = 0;
            const handlePanelTouchStart = (e) => {
                panelTouchStartY = e.touches[0].clientY;
            };
            const handlePanelTouchEnd = (e) => {
                const deltaY = e.changedTouches[0].clientY - panelTouchStartY;
                const threshold = 30;

                if (deltaY > threshold && isBottomPanelExpanded.value) {
                    // 向下滑 -> 收起
                    isBottomPanelExpanded.value = false;
                    autoCollapsed.value = false; // 🌟 手动干预，清除系统标记
                } else if (deltaY < -threshold && !isBottomPanelExpanded.value) {
                    // 向上滑 -> 展开
                    isBottomPanelExpanded.value = true;
                    autoCollapsed.value = false; // 🌟 手动干预，清除系统标记
                }
            };
        
            // === 🌟 年度愿景板逻辑 ===
            const showYearlyGoals = ref(false);
            const isEditingWishes = ref(false);
            
            // 💡 独立保存的标题（不再与今年系统时间强绑定）
            const visionTitle = ref(localStorage.getItem('ff_vision_title') || new Date().getFullYear().toString());

            const defaultWishes = [
                { id: 1, icon: '🗣️', title: '流利的英语口语交流者', desc: 'Fluent English Speaker' },
                { id: 2, icon: '💻', title: '深耕跨境电商探索', desc: 'Cross-border E-commerce' },
                { id: 3, icon: '😎', title: '保持帅气', desc: 'Stay Handsome' }
            ];

            const yearlyWishes = ref(JSON.parse(localStorage.getItem('ff_yearly_wishes')) || defaultWishes);

            // 监听数据变化并保存到本地
            watch([yearlyWishes, visionTitle], () => {
                localStorage.setItem('ff_yearly_wishes', JSON.stringify(yearlyWishes.value));
                localStorage.setItem('ff_vision_title', visionTitle.value);
            }, { deep: true });

            const addWish = () => {
                yearlyWishes.value.push({ id: Date.now(), icon: '🎯', title: '', desc: '' });
            };

            const deleteWish = (id) => {
                if(confirm('确定要删除这个愿望吗？')) {
                    yearlyWishes.value = yearlyWishes.value.filter(w => w.id !== id);
                }
            };

    return {
        isDark, 
        toggleTheme,
        identities, activeIdentity, web3Project, saveIdentities,
        showHistoryModal,
        currentTab, showProgressFloatBtn,showCalendar, toggleCalendar: () => showCalendar.value = !showCalendar.value,
        stripDays, handleHeaderTouchStart, handleHeaderTouchEnd,
        dateScrollContainer, touchStart, touchEnd,
        isFocusing, newTask, newDuration, tasks,
        activeProgressTasks, completedProgressTasks, handleProgressComplete,
        activeInboxTasks, completedInboxTasks, activeRecurringQuadrantTasks, activeQuadrantTasks,
        showCompletedInbox,      // 修复专注页已完成点不开
        showCompletedProgress,   // 修复进度页已完成点不开
        showExpiredCountdown,    // 修复倒数日过期点不开
        displayUpcomingList, homeUpcomingList, upcomingList, expiredList, upcomingScroll, pauseUpcoming, resumeUpcoming,
        quadrantTitles, progressStats, progressTasks, 
        currentYear, currentMonth, lunarMonthStr, daysInMonth, firstDayOfWeek,
        selectedDate, changeMonth, handlePageTouchStart, handlePageTouchEnd, jumpToToday, selectDate, getDayClass, isSameDate, getLunarClass,
        defaultDuration, timeLeft, formatTime, startTimer, stopTimer,
        dailyDoneCount, addTask, isTaskDone, toggleTask, deleteTask, addQuickTask,
        showQuadrantModal, quadrantForm, closeQuadrantModal, saveQuadrantTask,
        getTasksByQ, hasTask, getDaysUntilData, getRepeatText, deleteCountdown, 
        showTimeSelect, showTimerAction, handleTimerClick, setDuration, closeTimerMenus,
        showCountdownModal, countdownForm, openCountdownModal, closeCountdownModal, saveCountdown, countdownFormMode,
        editingTask, openEditModal, closeEditModal, deleteCurrentTask, editForm, saveEditTask,
        showSyncModal, showDoneHistory, allCompletedTasks, restoreTask, githubToken, gistId, handleSync, syncStatus,
        handleTouchStart, handleTouchMove, handleTouchEnd, handleTaskClick, handleSubtaskClick, addSubtask, toggleSubtask, deleteSubtask, editSubtask, handleBackgroundClick,
        showProgressModal, progressForm, progressInputRef, saveTaskProgress,
        swipeItemId, startX, currentOffsetX, handleSwipeStart, handleSwipeMove, handleSwipeEnd,
        handleTileClick, editTaskProgress, handleProgressItemClick, handleCountdownClick,
        isLogoAnimating, handleLogoClick, handleFocusTabClick, showRestoreModal, restorePromptText, confirmRestore,
        showAiConfigModal, aiConfig, saveAiConfig,
        showAddIdentityModal, showEditIdentityModal, newIdentityInput, editIdentityInput,
        openAddIdentityModal, confirmAddIdentity, confirmEditIdentity, deleteIdentity,
        startIdentityPress, clearIdentityPress,isAnalyzing, runAiAnalysis, startEvolution,labMode,
        labHistory, addToHistory, deleteHistory, restoreHistory,handleProgressScroll,
        isBottomPanelExpanded, toggleBottomPanel, handlePanelTouchStart, handlePanelTouchEnd,
        showYearlyGoals, isEditingWishes, yearlyWishes, visionTitle, addWish, deleteWish,
    };
        } // 结束 setup
    }); // 结束 createApp 定义

    app.directive('focus', {
        mounted(el) {
            // 1. 立即获取焦点，唤起键盘
            el.focus();
            
            // 2. 设置一个延迟（给键盘弹起留出动画时间，通常 300ms 足够）
            setTimeout(() => {
                // 3. 强制将该元素滚动到屏幕垂直方向的“正中间”
                // scrollIntoView 是浏览器原生 API，能自动处理各种遮挡情况
                el.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center', 
                    inline: 'nearest' 
                });
            }, 500);
        }
    });

    app.mount('#app');
    // 1. 全局暴力禁止双击 (Double Tap)
    // 使用 { passive: false } 确保 preventDefault 能生效
    document.addEventListener('dblclick', function(event) {
        event.preventDefault();
    }, { passive: false });

    // 2. 禁止双指缩放 (Pinch to Zoom)
    // 即使你写了 meta viewport，iOS 10+ 依然允许手势缩放，这会导致布局错乱
    document.addEventListener('gesturestart', function(event) {
        event.preventDefault();
    }, { passive: false });

    // 3. 修复键盘收起后，页面没回弹导致的“假死”或“可滑动”状态
    // 当输入框失焦（键盘收起）时，强制重置滚动位置
    document.addEventListener('focusout', function() {
        setTimeout(() => {
            window.scrollTo(0, 0); // 强制滚回顶部
        }, 100);

    });

