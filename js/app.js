
import { useTasks } from './tasks.js';
import { useLab } from './lab.js';
import { useFinance } from './finance.js';
import { useCountdown } from './countdown.js';


const { createApp, ref, computed, watch, onMounted, reactive, nextTick } = Vue; // 确保解构了 nextTick

    const app = createApp({ // 将 createApp 改为赋值给变量
        setup() {
            // tasks / countdown 模块在 aiConfig 定义后初始化，见下方 TASKS MODULE INIT

            const { 
                identities, activeIdentity, web3Project, saveIdentities,
                labMode, labSubTab, FLASH_PROMPT, STRATEGY_PROMPT, EXTRACT_PROMPT,
                labHistory, addToHistory, deleteHistory, restoreHistory,
                adoptPlan, unlockNextPhase, clearActivePlan,
            } = useLab();

            // --- 3. 夜间模式逻辑 ---
            // 注意：useFinance 在 aiConfig 定义后调用（见文件下方 FINANCE MODULE INIT 注释处）
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
            onMounted(() => {
                // 主题：跟随系统，实时监听变化
                const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
                isDark.value = systemDarkQuery.matches;
                updateTheme();
                systemDarkQuery.addEventListener('change', (e) => {
                    isDark.value = e.matches;
                    updateTheme();
                });

                // 本地任务/倒数日数据在模块初始化后加载，见 TASKS/COUNTDOWN MODULE INIT 下方

                // 恢复 GitHub 同步配置
                const savedToken  = localStorage.getItem('mike_github_token');
                const savedGistId = localStorage.getItem('mike_gist_id');
                if (savedToken)  githubToken.value = savedToken;
                if (savedGistId) gistId.value = savedGistId;

                // 金融模块解锁校验（逻辑在 finance.js 内部，不依赖硬编码 ID）
                checkFinanceUnlock();

                // 初次拉取每日研报
                fetchDailyReportFromGist();

                // 日期条滚动到今天（重试机制，等待 DOM 就绪）
                const forceScrollToToday = (retryCount = 0) => {
                    if (retryCount > 10) return;
                    nextTick(() => {
                        const el = document.getElementById('day-' + selectedDate.value.toDateString());
                        const container = dateScrollContainer.value;
                        if (el && container) {
                            const containerCenter = container.offsetWidth / 2;
                            const elOffset = el.offsetLeft + el.offsetWidth / 2;
                            container.scrollTo({ left: elOffset - containerCenter, behavior: 'smooth' });
                        } else {
                            setTimeout(() => forceScrollToToday(retryCount + 1), 300);
                        }
                    });
                };
                if (currentTab.value === 'now' || currentTab.value === 'quadrant') {
                    forceScrollToToday();
                }

                // 零点精准自动刷新（定义在此处，供 visibilitychange 复用）
                const handleMidnightRefresh = () => {
                    const now      = new Date();
                    const tomorrow = new Date(now);
                    tomorrow.setDate(now.getDate() + 1);
                    tomorrow.setHours(0, 0, 1, 0);
                    setTimeout(() => window.location.reload(), tomorrow - now);
                };
                handleMidnightRefresh();

                // 手机从休眠唤醒：跨天刷新，同天重新校准倒计时 + 静默拉取研报
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        const savedDate = localStorage.getItem('last_active_date');
                        const today     = new Date().toDateString();
                        if (savedDate && savedDate !== today) {
                            window.location.reload();
                        } else {
                            handleMidnightRefresh();
                            fetchDailyReportFromGist();
                        }
                        localStorage.setItem('last_active_date', today);
                    }
                });
                localStorage.setItem('last_active_date', new Date().toDateString());

                // 启动屏淡出
                setTimeout(() => {
                    const splash = document.getElementById('splash-screen');
                    if (splash) {
                        splash.style.opacity = '0';
                        setTimeout(() => splash.remove(), 500);
                    }
                }, 100);
            });

            // ==========================================
            // 💰 金融模块 (已拆分至 finance.js)
            // ==========================================
            // useFinance 在 aiConfig 定义后调用，见下方 FINANCE MODULE INIT 注释处

                        // --- 原有逻辑 ---
            const currentTab = ref('now');
            const showHistoryModal = ref(false);
            const showCompletedInbox = ref(false); // 控制已完成列表的显示/隐藏
            const showCompletedProgress = ref(false); // ✅ 新增：进度页折叠
            const showProgressFloatBtn = ref(false);
            const showCalendar = ref(false);
            const newTask = ref('');
            const newDuration = ref(''); 
            

            const isFocusing = ref(false);
            const defaultDuration = ref(25);
            const timeLeft = ref(25 * 60);
            const showTimeSelect = ref(false);
            const showTimerAction = ref(false);
            const currentFocusTask = ref(null);
            let timerInterval = null;
            
            const showSyncModal = ref(false); // 同步弹窗
            // 🚀 新增 1：控制历史记录弹窗显示
            const showDoneHistory = ref(false);

            const showInspirationModal = ref(false);
            const inspirationText = ref('');
            const inspirationInputRef = ref(null);

            const toggleInspirationModal = () => {
                showInspirationModal.value = true;
            };

            watch(showInspirationModal, (newVal) => {
                if (newVal) {
                    nextTick(() => {
                        if (inspirationInputRef.value) {
                            inspirationInputRef.value.focus();
                        }
                    });
                }
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
                    const container = dateScrollContainer.value;
                    if (el && container) {
                        // 精确居中：让元素中心对齐容器中心
                        const containerCenter = container.offsetWidth / 2;
                        const elOffset = el.offsetLeft + el.offsetWidth / 2;
                        container.scrollTo({ left: elOffset - containerCenter, behavior: 'smooth' });
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

            watch(labSubTab, (newTab) => {
                if (newTab === 'finance') {
                    if (financeMode.value === 'macro') {
                        if (!macroData.value) {
                            fetchMacroData(); // 没有数据就去拉
                        } else {
                            nextTick(() => drawSparklines(macroData.value.assets));
                        }
                    } else if (financeMode.value === 'stock') {
                        if (stockData.value) {
                            nextTick(() => drawStockChart());
                        }
                    }
                }
            });

            
            // 自动保存本地数据
            // tasks/countdowns watch 已移至模块初始化后（见 TASKS MODULE INIT 下方）

            // 自动保存同步配置
            watch([githubToken, gistId], () => {
                localStorage.setItem('mike_github_token', githubToken.value);
                localStorage.setItem('mike_gist_id', gistId.value);
            });

            // --- 修复后的完整同步函数 ---
            const handleSync = async (direction) => {
                if (!githubToken.value) {
                    alert("请先填写 GitHub Token");
                    return;
                }
                syncStatus.value = 'loading';
                
                const fileName = 'mikes_flow_data.json';
                
                // 1. 🌟 新增：准备要上传的所有核心数据
                const content = JSON.stringify({
                    tasks: tasks.value,
                    countdowns: countdowns.value,
                    reportHistory: reportHistory.value, // ✅ 同步暗黑胶囊研报
                    identities: identities.value,       // ✅ 同步觉醒身份
                    labHistory: labHistory.value,       // ✅ 同步身份问过AI的历史
                    yearlyWishes: yearlyWishes.value,   // ✅ 同步年度愿景板
                    tradeLogs: tradeLogs.value, 
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
                        
                        alert('✅ 所有模块数据已同步至云端！');
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
                            if(confirm(`云端数据更新于: \n${cloudData.updatedAt}\n\n确定覆盖本地数据吗？`)) {
                                
                                // 🌟 核心修复：将云端数据恢复到各个模块并保存到 LocalStorage
                                tasks.value = cloudData.tasks || [];
                                countdowns.value = cloudData.countdowns || [];
                                
                                if (cloudData.reportHistory) {
                                    reportHistory.value = cloudData.reportHistory;
                                    localStorage.setItem('ff_report_history', JSON.stringify(reportHistory.value));
                                }
                                if (cloudData.identities) {
                                    identities.value = cloudData.identities;
                                    saveIdentities(); // 调用自带函数保存身份
                                }
                                if (cloudData.labHistory) {
                                    labHistory.value = cloudData.labHistory;
                                    localStorage.setItem('ff_lab_history', JSON.stringify(labHistory.value));
                                }
                                if (cloudData.yearlyWishes) {
                                    yearlyWishes.value = cloudData.yearlyWishes;
                                    // yearlyWishes 自带 watch，会自动存入 localStorage
                                }
                                if (cloudData.tradeLogs) {
                                    tradeLogs.value = cloudData.tradeLogs;
                                    localStorage.setItem('ff_trade_logs', JSON.stringify(tradeLogs.value));
                                }

                                alert('✅ 跨设备下载覆盖成功！');
                            }
                        }
                    }
                    
                    // 同步完成后重新校验金融模块解锁状态
                    checkFinanceUnlock();

                    syncStatus.value = 'success';
                    setTimeout(() => syncStatus.value = 'idle', 3000);

                } catch (e) {
                    console.error(e);
                    alert(`同步出错: ${e.message}`);
                    syncStatus.value = 'error';
                }
            };

            
            

            // -----------------------------------------------------------
            // 🗑️ 终极修复：精确识别 AI 多对象系列 vs 手动单对象重复
            // -----------------------------------------------------------
            const saveInspiration = () => {
                if (!inspirationText.value.trim()) return;

                const currentKey = formatDateKey(selectedDate.value);
                
                // 1. 查找是否存在全局的“灵感容器”（无视日期限制，无视中英文名称）
                let container = tasks.value.find(t => 
                    t.isInspiration && 
                    !t.done &&  // 只要没被勾选完成，就一直复用这一个
                    t.q === 0
                );

                if (!container) {
                    // 2. 如果不存在，创建唯一容器
                    container = {
                        id: Date.now(),
                        text: '灵感胶囊', // 你可以在这里改回 Inspiration Spark
                        done: false,
                        q: 0,
                        date: currentKey,
                        startDate: currentKey,
                        subtasks: [],
                        createdAt: new Date().toISOString(),
                        isInspiration: true,
                        expanded: true // 默认展开
                    };
                    tasks.value.unshift(container);
                } else {
                    // 3. 核心修复：如果是旧容器，为了防止在选中“历史某一天”记灵感时容器不可见，
                    // 动态把它的开始日期往前推
                    const start = new Date(container.startDate);
                    const target = new Date(selectedDate.value);
                    start.setHours(0,0,0,0);
                    target.setHours(0,0,0,0);
                    if (target.getTime() < start.getTime()) {
                        container.startDate = currentKey; 
                    }
                }

                // 4. 将新灵感作为子任务添加
                const subtask = {
                    id: Date.now() + Math.random(),
                    text: inspirationText.value.trim(),
                    done: false
                };
                
                if (!container.subtasks) container.subtasks = [];
                container.subtasks.unshift(subtask);
                container.expanded = true; // 每次添加新灵感自动展开让你看到

                inspirationText.value = '';
                showInspirationModal.value = false;
            };

            const lastTap = ref({ id: null, time: 0 });
            const lastSubTap = ref({ id: null, time: 0 });
            let pressTimer = null;
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
                            
            
            // 🌟 核心辅助：严格判断任务是否属于【当前选中的身份卡片】
            const isTaskBelongToCurrentIdentity = (task) => {
                if (!activeIdentity.value) return false;
                
                // 1. 匹配手动建立并绑定的旧任务
                if (task.identityId === activeIdentity.value.id) return true;
                
                // 2. 匹配 AI 下发的任务（检查该任务所属的系统名，是否在当前身份的挑战列表中）
                if (task.systemName && activeIdentity.value.activeMissions) {
                    return activeIdentity.value.activeMissions.some(m => m.name === task.systemName);
                }
                
                return false;
            };

            // 任务色条颜色：严格跟随当前身份
            const getTaskBarColor = (task) => {
                if (isTaskBelongToCurrentIdentity(task)) {
                    return activeIdentity.value?.colorHex || '#6366f1';
                }
                return 'transparent'; // ✅ 修改：非当前身份任务直接透明留白
            };

            // 🌟 身份优先排序辅助：严格把当前选中身份的任务排最前
            const identityFirst = (a, b) => {
                const aMatch = isTaskBelongToCurrentIdentity(a);
                const bMatch = isTaskBelongToCurrentIdentity(b);
                
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            };

            const activeInboxTasks = computed(() => {
                return tasks.value.filter(t => {
                    const basicCheck = t.q === 0 && checkTaskVisible(t, selectedDate.value) && !isTaskDone(t, selectedDate.value);
                    if (!basicCheck) return false;
                    if (t.isInspiration) {
                        if (!t.subtasks || t.subtasks.length === 0) return false;
                        if (t.subtasks.every(sub => sub.done)) return false;
                    }
                    return true;
                }).sort(identityFirst);
            });

            const completedInboxTasks = computed(() => {
                // ✅ 新逻辑同上
                return tasks.value.filter(t => t.q === 0 && checkTaskVisible(t, selectedDate.value) && isTaskDone(t, selectedDate.value));
            });

            
            

            
            // ✅ 新增：用于显示的“双倍列表”，实现无缝滚动
            // 如果列表项少于3个，就不复制（因为不会滚）；如果多于3个，就复制一份拼接在后面
            /* 近期重要自动播放逻辑已移动至 getDaysUntilData 定义之后，避免初始化顺序导致的白屏 */




            // --- 其他 Helpers ---
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


            // --- 新增：双击修改工时 & 模拟双击逻辑 ---

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

            // 1. 定义 AI 配置状态
            const showAiConfigModal = ref(false);
            const aiConfig = reactive({
                model: localStorage.getItem('ff_ai_model') || 'gemini-2.5-flash',
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

            // ==========================================
            // 💰 FINANCE MODULE INIT (依赖 aiConfig / labSubTab / showSyncModal)
            // ==========================================
            const financeModule = useFinance({ labSubTab, showSyncModal, aiConfig });
            const {
                isFinanceUnlocked, checkFinanceUnlock, requestUnlock,
                reportHistory, currentViewReport, showReportArchiveModal, showReportDetail,
                dailyReportData, archivedReports,
                fetchDailyReportFromGist, viewArchivedReport, deleteArchivedReport,
                macroData, isMacroLoading, showMacroModal, currentMacroAssetKey, currentMacroAssetData,
                getAssetName, openMacroDetail, fetchMacroData, refreshMacro, drawSparklines,
                searchTicker, stockData, isStockLoading, stockAiInsight,
                drawStockChart, analyzeStock, refreshStock,
                tradeLogs, showTradeLogHistory, showTradeLogInput, newTradeLogText, currentLogTime,
                openTradeLogInput, saveTradeLog, deleteTradeLog,
                financeMode,
            } = financeModule;

            // ==========================================
            // ✅ TASKS MODULE INIT
            // ==========================================
            const tasksModule = useTasks({
                selectedDate, currentTab,
                newTask, newDuration,
                isFocusing, currentFocusTask,
                identities, activeIdentity,
                swipeItemId,
            });
            const {
                tasks,
                formatDateKey, getTodayStr, isTaskDone, checkTaskVisible, hasTask,
                addTask, dailyDoneCount, allCompletedTasks,
                showQuadrantModal, quadrantForm, addQuickTask, closeQuadrantModal, saveQuadrantTask,
                activeRecurringQuadrantTasks, activeQuadrantTasks, getTasksByQ, getCompletedTasksByQ,
                editingTask, editForm, showDeleteOptions,
                openEditModal, closeEditModal, saveEditTask, deleteCurrentTask,
                deleteTask, toggleTask,
                deleteTaskToday, deleteTaskFuture, deleteTaskSeries,
                progressTasks, activeProgressTasks, completedProgressTasks,
                handleProgressComplete, progressStats,
                showProgressModal, progressForm, progressInputRef,
                handleTileClick,
                showRestoreModal, restorePromptText, restoreActionType,
                restoreTask, confirmRestore,
                getTaskDayProgress, tasksForActiveIdentity,
            } = tasksModule;

            // ==========================================
            // 📅 COUNTDOWN MODULE INIT
            // ==========================================
            const countdownModule = useCountdown({ currentTab });
            const {
                countdowns, showExpiredCountdown,
                showCountdownModal, countdownFormMode, countdownForm,
                openCountdownModal, closeCountdownModal, saveCountdown, deleteCountdown,
                getDaysUntilData, getRepeatText,
                displayUpcomingList, homeUpcomingList, upcomingList, expiredList,
                upcomingScroll, upcomingPaused, upcomingAutoplay,
                pauseUpcoming, resumeUpcoming,
            } = countdownModule;

            // ==========================================
            // 📦 本地数据加载（模块 ref 初始化完成后执行）
            // ==========================================
            (() => {
                const savedTasks = localStorage.getItem('mike-pro-tasks-v4');
                if (savedTasks) tasks.value = JSON.parse(savedTasks);
                const savedCountdowns = localStorage.getItem('mike-pro-countdowns-v4');
                if (savedCountdowns) countdowns.value = JSON.parse(savedCountdowns);
            })();

            watch([tasks, countdowns], () => { // <--- 删掉了 todayPomodoros
                localStorage.setItem('mike-pro-tasks-v4', JSON.stringify(tasks.value));
                localStorage.setItem('mike-pro-countdowns-v4', JSON.stringify(countdowns.value));
            }, { deep: true });

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

    // 双击身份编辑
    // 用 touchstart 记录起始时间（排除滑动），touchend 判断是否双击
    const _identityTapMap = new Map();
    const _identityTouchStartMap = new Map();

    const handleIdentityTouchStart = (id) => {
        _identityTouchStartMap.set(id.id, Date.now());
    };

    const handleIdentityDoubleTap = (event, id) => {
        const startTime = _identityTouchStartMap.get(id.id) || 0;
        // 如果手指按下超过 200ms，认为是长按意图，不算 tap
        if (Date.now() - startTime > 200) {
            _identityTapMap.set(id.id, 0);
            return;
        }

        const now = Date.now();
        const last = _identityTapMap.get(id.id) || 0;
        if (now - last < 400 && last > 0) {
            // 双击确认：阻止后续合成的 click 事件
            event.preventDefault();
            clearTimeout(pressTimer);
            editingIdentity.value = id;
            editIdentityInput.value = id.name;
            showEditIdentityModal.value = true;
            _identityTapMap.set(id.id, 0);
        } else {
            _identityTapMap.set(id.id, now);
        }
    };

    const confirmAddIdentity = async () => {
        if (!newIdentityInput.value.trim()) return;
        if (document.activeElement) document.activeElement.blur();

        const identityName = newIdentityInput.value.trim();
        const newId = { 
            id: 'custom-' + Date.now(), 
            name: identityName, 
            icon: '⏳', 
            colorHex: '#4f46e5', 
            isLoading: true 
        };
        
        identities.value = [...identities.value, newId]; 
        activeIdentity.value = newId;
        newIdentityInput.value = '';
        showAddIdentityModal.value = false;

        if (aiConfig.key) {
            try {
                const promptText = `你是一个UI设计师。请为"${identityName}"这个身份分配一个专属Emoji和一个主色调。
                    要求：
                    1. 颜色必须是高饱和度的深色系（适合暗色模式背景），确保文字易读。
                    2. 颜色必须与身份特征强相关（例如：英语用书本蓝，运动用活力橙，交易用金钱绿）。
                    3. 严格禁止只返回一种颜色，请在十六进制库中寻找最匹配的那个。
                    请严格只返回JSON：{"icon": "🚀", "colorHex": "#312E81"}`;
                const GEMINI_PROXY = 'https://api.futureflow.cyou';
                let rawText = "";

                if (aiConfig.model === 'deepseek-chat') {
                    const response = await fetch("https://api.deepseek.com/chat/completions", {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.key}` },
                        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: "你只输出JSON。" }, { role: "user", content: promptText }] })
                    });
                    const resData = await response.json();
                    rawText = resData.choices[0].message.content;
                } else {
                    const baseUrl = GEMINI_PROXY.endsWith('/') ? GEMINI_PROXY.slice(0, -1) : GEMINI_PROXY;
                    
                    const response = await fetch(`${baseUrl}/v1/models/${aiConfig.model}:generateContent?key=${aiConfig.key}`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
                    });
                    const resData = await response.json();
                    rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                }

                const cleaned = rawText.replace(/```json|```/g, '').trim();
                const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const cleanJson = JSON.parse(jsonMatch[0]);
                    const targetIndex = identities.value.findIndex(i => i.id === newId.id);
                    if (targetIndex !== -1) {
                        identities.value[targetIndex] = {
                            ...identities.value[targetIndex],
                            icon: cleanJson.icon || '✨',
                            colorHex: cleanJson.colorHex || '#4f46e5',
                            isLoading: false
                        };
                        saveIdentities();
                        if (activeIdentity.value?.id === newId.id) {
    activeIdentity.value = identities.value[targetIndex];
}
                    }
                }
            } catch (e) {
                console.error("AI 生成失败", e);
                const targetIndex = identities.value.findIndex(i => i.id === newId.id);
                if (targetIndex !== -1) { identities.value[targetIndex].icon = '✨'; identities.value[targetIndex].isLoading = false; saveIdentities(); }
            }
        } else {
            const targetIndex = identities.value.findIndex(i => i.id === newId.id);
            if (targetIndex !== -1) { identities.value[targetIndex].icon = '✨'; identities.value[targetIndex].isLoading = false; saveIdentities(); }
        }
    };

    const completeMission = (missionId, missionName) => {
        if (activeIdentity.value && confirm(`确定要完成/中止 [${missionName || '此挑战'}] 吗？\n（四象限中的日常任务仍会保留）`)) {
            // 从数组中过滤掉这个任务
            if (activeIdentity.value.activeMissions) {
                activeIdentity.value.activeMissions = activeIdentity.value.activeMissions.filter(m => m.id !== missionId);
            }
            // 兼容清除可能存在的旧结构
            if (activeIdentity.value.currentMission && (!missionId || activeIdentity.value.currentMission.id === missionId)) {
                activeIdentity.value.currentMission = null;
            }
            saveIdentities();
        }
    };


    // 1. 自动计算任务进行了几天
            const getMissionProgress = (mission) => {
                if (!mission.startDate) return 0;
                
                // 将日期字符串统一转为当日 0 点的时间戳来计算
                const start = new Date(mission.startDate);
                start.setHours(0, 0, 0, 0);
                
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                
                const diffTime = now.getTime() - start.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                // 返回值：最小是 0 (今天刚开始)，最大不超过设定的总天数
                return Math.max(0, Math.min(diffDays, parseInt(mission.days) || 1));
            };

            // 2. 长按逻辑变量
            let missionPressTimer = null;

            // 3. 开始长按
            // ======= Mission 详情底部抽屉 =======
            const missionSheet = ref({ open: false, mission: null });

            const openMissionSheet = (mission) => {
                missionSheet.value = { open: true, mission };
            };
            const closeMissionSheet = () => {
                missionSheet.value = { open: false, mission: null };
            };

            const startMissionPress = (mission) => {
                missionPressTimer = setTimeout(() => {
                    if (navigator.vibrate) navigator.vibrate(50);
                    completeMission(mission.id, mission.name);
                }, 1000);
            };

            // 4. 清除长按 (手指移动或松开时)
            const clearMissionPress = () => {
                if (missionPressTimer) {
                    clearTimeout(missionPressTimer);
                    missionPressTimer = null;
                }
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

    const resolveGeminiModel = async (baseUrl, key, desired) => {
        try {
            const r = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models?key=${key}`);
            if (!r.ok) return desired;
            const j = await r.json();
            const list = Array.isArray(j.models) ? j.models : [];
            const gens = list.filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'));
            const names = new Set(gens.map(m => (m.name || '').replace(/^models\//, '').toLowerCase()));
            // 优先选择 2.5/2.0 系列作为最新版，其次回退至 1.5
            const prefs = [
                desired,
                'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro',
                'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite-001', 'gemini-2.0-pro',
                'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro'
            ].filter(Boolean);
            const pick = prefs.find(n => names.has(String(n).toLowerCase()));
            if (pick) return pick;
            return gens[0] ? (gens[0].name || '').replace(/^models\//, '') : desired;
        } catch (e) {
            return desired;
        }
    };

    const runAiAnalysis = async () => {
        if (!aiConfig.key) { showAiConfigModal.value = true; return; }
        if (!web3Project.value.name) { alert("请先输入内容"); return; }
        
        isAnalyzing.value = true;
        const GEMINI_PROXY = 'https://api.futureflow.cyou';

        try {
            let currentPrompt = FLASH_PROMPT;
            if (labMode.value === 'strategy') currentPrompt = STRATEGY_PROMPT;
            if (labMode.value === 'extract') currentPrompt = EXTRACT_PROMPT;
            
            const promptText = `${currentPrompt}\n用户身份: ${activeIdentity.value.name}\n目标项目/内容: ${web3Project.value.name}`;
            let rawText = "";

             if (aiConfig.model === 'deepseek-chat') {
                 const response = await fetch("https://api.deepseek.com/chat/completions", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.key}` },
                    body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: "你只输出JSON。" }, { role: "user", content: promptText }], temperature: 1.1 })
                });
                const data = await response.json();
                rawText = data.choices[0].message.content;
             } else {
                 const baseUrl = GEMINI_PROXY.endsWith('/') ? GEMINI_PROXY.slice(0, -1) : GEMINI_PROXY;
                const _model = await resolveGeminiModel(baseUrl, aiConfig.key, aiConfig.model);
                const response = await fetch(`${baseUrl}/v1/models/${aiConfig.model}:generateContent?key=${aiConfig.key}`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
                 });
                if (!response.ok) throw new Error("Gemini 请求失败");
                 const data = await response.json();
                 rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
             }
            
            const cleaned = rawText.replace(/```json|```/g, '').trim();
            const jsonMatch = rawText.match(/\{[\s\S]*\}/); 
            if (jsonMatch) {
                const cleanJson = JSON.parse(jsonMatch[0]);
                addToHistory(promptText, cleanJson);
                web3Project.value.plans = [];

                if (labMode.value === 'strategy') {
                    if (cleanJson.options && Array.isArray(cleanJson.options)) {
                        web3Project.value.plans = cleanJson.options;
                    } else {
                        web3Project.value.plans = [cleanJson];
                    }
                } else {
                    web3Project.value.plans = [{
                        type: labMode.value === 'extract' ? '💡 灵感萃取' : '⚡ 极速行动',
                        systemName: cleanJson.systemName || (labMode.value === 'extract' ? '核心打法提炼' : '单点突破'), 
                        analysis: cleanJson.stretchGoal,
                        setupAction: cleanJson.atomicStart,
                        milestones: cleanJson.steps || [],
                        missionDays: cleanJson.missionDays || 7 // 👈 获取 AI 判定的天数
                    }];
                }
                web3Project.value.selectedPlanIndex = 0;
                return;
            }
            throw new Error("格式解析失败");

        } catch (e) {
            console.error(e);
            alert(`AI 请求失败：${e.message || '未知错误'}`);
        } finally {
            isAnalyzing.value = false;
        }
    };


 
    // ============================================================
    // 🗓️ 核心：将某个阶段的所有天任务下发到四象限
    // startDate: Date 对象，表示该阶段从哪天开始
    // ============================================================
    const dispatchPhase = (phase, planSystemName, startDate) => {
        const seriesId = `phase_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        const phaseDuration = phase.duration || 7;

        // 1. 下发 tasks 里有明确安排的那几天（逐天一张卡片）
        const scheduledDays = new Set();
        if (phase.tasks && phase.tasks.length > 0) {
            phase.tasks.forEach((dayPlan) => {
                const dayOffset = (dayPlan.day || 1) - 1;
                scheduledDays.add(dayOffset);

                const targetDate = new Date(startDate);
                targetDate.setDate(targetDate.getDate() + dayOffset);
                const ty = targetDate.getFullYear();
                const tm = String(targetDate.getMonth() + 1).padStart(2, '0');
                const td = String(targetDate.getDate()).padStart(2, '0');
                const dateStr = `${ty}-${tm}-${td}`;

                const subtasks = (dayPlan.actions || []).map(a => ({
                    id: Date.now() + Math.random(), text: a, done: false
                }));

                setTimeout(() => {
                    tasks.value.push({
                        id: Date.now() + Math.random(),
                        text: `[${phase.phaseName}] D${dayPlan.day} ${dayPlan.theme}`,
                        q: 2, done: false,
                        date: formatDateKey(targetDate),
                        duration: 1,
                        startDate: dateStr,
                        endDate: dateStr,
                        repeat: 'none',
                        accumulated: 0, log: [], expanded: false,
                        subtasks,
                        systemName: planSystemName,
                        seriesId,
                    });
                }, dayOffset * 20);
            });
        }

        // 2. 下发 dailyFocus 作为整个阶段的每日打卡（覆盖没有明确安排的天）
        if (phase.dailyFocus) {
            const phaseEndDate = new Date(startDate);
            phaseEndDate.setDate(phaseEndDate.getDate() + phaseDuration - 1);
            const peStr = `${phaseEndDate.getFullYear()}-${String(phaseEndDate.getMonth()+1).padStart(2,'0')}-${String(phaseEndDate.getDate()).padStart(2,'0')}`;
            const psStr = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;

            tasks.value.push({
                id: Date.now() + 999,
                text: `📍 [${phase.phaseName}每日] ${phase.dailyFocus}`,
                q: 2, done: false,
                date: formatDateKey(startDate),
                duration: 0.5,
                startDate: psStr,
                endDate: peStr,
                repeat: 'day', repeatInterval: 1,
                accumulated: 0, log: [], expanded: false,
                subtasks: [],
                systemName: planSystemName,
                seriesId,
            });
        }
    };

    // ============================================================
    // 解锁下一阶段（app 层，可访问 tasks）
    // ============================================================
    const unlockNextPhaseWithDispatch = () => {
        const activePlan = web3Project.value.activePlan;
        if (!activePlan || !activePlan.phases) return;

        const currentIdx = web3Project.value.currentPhaseIndex;
        const maxIdx = activePlan.phases.length - 1;
        if (currentIdx >= maxIdx) return;

        // 先更新阶段索引
        unlockNextPhase();

        const nextPhase = activePlan.phases[currentIdx + 1];
        if (!nextPhase) return;

        // 计算新阶段开始日期（今天）
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        dispatchPhase(nextPhase, activePlan.systemName, today);

        if (navigator.vibrate) navigator.vibrate(50);
        alert(`🔓 第 ${currentIdx + 2} 阶段「${nextPhase.phaseName}」已解锁！\n${nextPhase.duration} 天任务已下发到四象限。`);
    };

    const startEvolution = () => {
        const plan = web3Project.value.currentPlan; 
        if (!plan) return;

        const d = new Date();
        d.setHours(0, 0, 0, 0);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${dayStr}`; 
        const dateKey = formatDateKey(d); 
        
        const aiDays = plan.missionDays ? parseInt(plan.missionDays) : 21;
        const endD = new Date();
        endD.setDate(endD.getDate() + aiDays);
        const endDateStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;

        // 🌟 Strategy + phases 模式
        if (labMode.value === 'strategy' && plan.phases && plan.phases.length > 0) {
            adoptPlan(web3Project.value.selectedPlanIndex);

            // 下发第一阶段所有天任务
            dispatchPhase(plan.phases[0], plan.systemName, d);

            if (activeIdentity.value) {
                if (!activeIdentity.value.activeMissions) activeIdentity.value.activeMissions = [];
                activeIdentity.value.activeMissions.unshift({
                    id: Date.now(),
                    name: plan.systemName || web3Project.value.name || '进化挑战',
                    startDate: todayStr, endDate: endDateStr, days: aiDays
                });
                saveIdentities();
            }

            currentTab.value = 'lab';
            alert(`✅ 已启动「${plan.systemName}」\n第一阶段共 ${plan.phases[0].tasks?.length || 0} 天任务已下发到四象限！`);
            return;
        }

        // ===== Flash / Extract 模式原有逻辑 =====
        const milestones = plan.milestones || plan.steps || [];
        const subtasks = milestones.map(s => ({ id: Date.now() + Math.random(), text: s, done: false }));

        // Extract 模式只下发任务到规划，不写入身份 missions
        const isExtractMode = plan.type === '💡 灵感萃取' || labMode.value === 'extract';

        if (!isExtractMode && activeIdentity.value) {
            if (!activeIdentity.value.activeMissions) {
                activeIdentity.value.activeMissions = [];
                if (activeIdentity.value.currentMission) {
                    activeIdentity.value.activeMissions.push({ ...activeIdentity.value.currentMission, id: 'old-mission' });
                    delete activeIdentity.value.currentMission;
                }
            }
            activeIdentity.value.activeMissions.unshift({
                id: Date.now(),
                name: plan.systemName || web3Project.value.name || '专属进化挑战',
                startDate: todayStr, endDate: endDateStr, days: aiDays
            });
            saveIdentities();
        }

        const isStrategy = plan.weeklySchedule || (plan.options && plan.options.length > 0);

        if (isStrategy) {
            if (plan.setupAction || plan.atomicStart) {
                tasks.value.unshift({
                    id: Date.now(), text: `🚀 [启动] ${plan.setupAction || plan.atomicStart}`, q: 2, done: false, date: dateKey, duration: 0.5, startDate: todayStr, endDate: todayStr, repeat: 'none', subtasks: []
                });
            }
            if (plan.weeklySchedule && plan.weeklySchedule.length > 0) {
                const batchSeriesId = `ai_series_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                plan.weeklySchedule.forEach((dayPlan, index) => {
                    const targetDate = new Date();
                    targetDate.setDate(targetDate.getDate() + index); 
                    const ty = targetDate.getFullYear();
                    const tm = String(targetDate.getMonth() + 1).padStart(2, '0');
                    const td = String(targetDate.getDate()).padStart(2, '0');
                    const dateStr = `${ty}-${tm}-${td}`;
                    const dailySubtasks = (dayPlan.tasks || []).map(t => ({ id: Date.now() + Math.random(), text: t, done: false }));
                    setTimeout(() => {
                        tasks.value.push({
                            id: Date.now() + Math.random(), text: `[周${"日一二三四五六".charAt(targetDate.getDay())}] ${dayPlan.theme} (${plan.systemName})`,
                            q: 2, done: false, date: formatDateKey(targetDate), duration: plan.duration || 0.5, startDate: dateStr, endDate: '', repeat: 'week', repeatInterval: 1, expanded: false, subtasks: dailySubtasks, systemName: plan.systemName, seriesId: batchSeriesId 
                        });
                    }, index * 50);
                });
                alert(`已为你生成未来 ${plan.weeklySchedule.length} 天的定制计划！请去四象限查看。`);
            } else if (plan.systemName) {
                setTimeout(() => {
                    tasks.value.push({
                        id: Date.now() + 1, text: plan.routine || plan.systemName, q: 2, done: false, date: dateKey, duration: plan.duration || 0.5, startDate: todayStr, 
                        endDate: endDateStr, repeat: plan.frequency || 'day', repeatInterval: 1, expanded: true, subtasks: subtasks, systemName: plan.systemName 
                    });
                }, 10);
            }
        } else {
            const isExtract = plan.type === '💡 灵感萃取' || !!plan.systemName;
            const mainText = plan.setupAction || plan.atomicStart || plan.systemName || web3Project.value.name;
            tasks.value.unshift({
                id: Date.now(), text: isExtract ? `💡 ${mainText}` : `⚡ ${mainText}`, q: 2, done: false, date: dateKey, duration: 0.5, startDate: todayStr, 
                endDate: endDateStr, repeat: 'day', repeatInterval: 1, accumulated: 0, log: [], expanded: true, subtasks: subtasks, systemName: plan.systemName
            });
        }

        currentTab.value = 'now'; 
        web3Project.value.name = '';
        web3Project.value.stretchGoal = '';
        web3Project.value.atomicStart = '';
        web3Project.value.plans = []; 
    };


    // 进度页：月历已移入滚动容器，自然滚走，只需控制浮动按钮
    const handleProgressMainScroll = (e) => {
        showProgressFloatBtn.value = e.target.scrollTop > 280;
    };

        // ==========================================
    // 📊 进度页三栏统计 computeds
    // ==========================================
    const _allProgressTasks = computed(() =>
        [...(activeProgressTasks.value || []), ...(completedProgressTasks.value || [])]
    );

    // 今日投入小时
    const progressTodayHours = computed(() => {
        const today = getTodayStr();
        const total = _allProgressTasks.value.reduce((s, t) =>
            s + (t.dailyLog && t.dailyLog[today] ? t.dailyLog[today] : 0), 0);
        return total.toFixed(1);
    });

    // 投入最多项目
    const progressTopTask = computed(() => {
        const sorted = _allProgressTasks.value
            .filter(t => (t.accumulated || 0) > 0)
            .sort((a, b) => (b.accumulated || 0) - (a.accumulated || 0));
        if (!sorted.length) return null;
        return { text: sorted[0].text, hours: (sorted[0].accumulated || 0).toFixed(1) };
    });

    // 近7日柱状图数据
    const progress7DayBars = computed(() => {
        const weekLabels = ['日','一','二','三','四','五','六'];
        const dailyTotals = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const key = `${y}-${m}-${dd}`;
            const total = _allProgressTasks.value.reduce((s, t) =>
                s + (t.dailyLog && t.dailyLog[key] ? t.dailyLog[key] : 0), 0);
            return { total, label: weekLabels[d.getDay()], isToday: i === 6 };
        });
        const maxV = Math.max(1, ...dailyTotals.map(d => d.total));
        return dailyTotals.map(d => ({
            ...d,
            height: Math.max(2, Math.round(d.total / maxV * 28))
        }));
    });

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

            const getIdentityDays = (id) => {
                // 1. 找到该身份对象
                const identity = identities.value.find(i => i.id === id);
                if (!identity) return 1;

                let maxDay = 1;

                // 2. 检查该身份下的 AI 挑战 (Active Missions)
                if (identity.activeMissions && identity.activeMissions.length > 0) {
                    identity.activeMissions.forEach(m => {
                        const p = getMissionProgress(m);
                        if (p > maxDay) maxDay = p;
                    });
                }

                // 3. 检查该身份下手动关联的任务 (Tasks)
                const linkedTasks = tasks.value.filter(t => t.identityId === id);
                linkedTasks.forEach(t => {
                    const p = getTaskDayProgress(t).current;
                    if (p > maxDay) maxDay = p;
                });

                // 4. 兜底逻辑：如果没有任何关联任务，则显示身份创建至今的天数
                if (maxDay === 1 && id.startsWith('custom-')) {
                    const timestamp = parseInt(id.replace('custom-', ''));
                    const diff = Date.now() - timestamp;
                    maxDay = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
                }

                return maxDay;
            };

            // 2. 底部 Tab 栏动态样式
            const getTabContainerStyle = () => {
                if (currentTab.value === 'lab' && labSubTab.value === 'awake' && activeIdentity.value?.colorHex) {
                    return { backgroundColor: activeIdentity.value.colorHex, borderTopColor: activeIdentity.value.colorHex };
                }
                return {};
            };

            // 3. 底部 Tab 栏动态背景类名
            const getTabContainerClass = () => {
                if (currentTab.value === 'lab' && labSubTab.value === 'finance') return '!bg-black !border-gray-900';
                if (currentTab.value === 'lab' && labSubTab.value === 'awake' && activeIdentity.value?.colorHex) return 'border-transparent';
                return 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800';
            };

            // 4. 底部 Tab 按钮文字的动态颜色
            const getTabBtnClass = (tabName) => {
                const isActive = currentTab.value === tabName;
                const isAwakeThemed = currentTab.value === 'lab' && labSubTab.value === 'awake' && activeIdentity.value?.colorHex;
                const isFinanceThemed = currentTab.value === 'lab' && labSubTab.value === 'finance';
                
                if (isActive) {
                    if (isAwakeThemed || isFinanceThemed) return 'text-white scale-105 font-bold';
                    return 'text-blue-600 dark:text-blue-400 scale-105 font-bold';
                } else {
                    if (isAwakeThemed || isFinanceThemed) return 'text-white/50 hover:text-white/70';
                    return 'text-gray-400 hover:text-gray-500';
                }
            };

            // ==========================================
            // 📖 成功日记模块
            // ==========================================
            const DIARY_PIN = '1234';
            const DIARY_STORAGE_KEY = 'futureflow-diary-v1';

            const showDiaryLock = ref(false);
            const showDiaryMain = ref(false);
            const diaryPin = ref('');
            const diaryPinError = ref(false);
            const diaryView = ref('today');

            const diaryMoods = [
                { emoji: '🔥' }, { emoji: '😊' }, { emoji: '😐' }, { emoji: '😔' }, { emoji: '💪' }
            ];
            const diaryTagOptions = ['专注', '突破', '感恩', '学习', '挑战', '放松', '创意', '坚持'];

            const diaryHistory = ref([]);
            const diaryTodayStr = computed(() => {
                const d = new Date();
                return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`;
            });
            const diaryTodayKey = () => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            };

            const diaryEntry = reactive({
                mood: '',
                achievements: [],
                content: '',
                tags: [],
            });

            const loadDiary = () => {
                const saved = localStorage.getItem(DIARY_STORAGE_KEY);
                if (saved) diaryHistory.value = JSON.parse(saved);
                const todayRecord = diaryHistory.value.find(e => e.date === diaryTodayKey());
                if (todayRecord) {
                    diaryEntry.mood = todayRecord.mood || '';
                    diaryEntry.achievements = [...(todayRecord.achievements || [])];
                    diaryEntry.content = todayRecord.content || '';
                    diaryEntry.tags = [...(todayRecord.tags || [])];
                } else {
                    diaryEntry.mood = '';
                    diaryEntry.achievements = [];
                    diaryEntry.content = '';
                    diaryEntry.tags = [];
                }
            };

            const openDiary = () => {
                diaryPin.value = '';
                diaryPinError.value = false;
                showDiaryLock.value = true;
            };

            const closeDiary = () => {
                showDiaryLock.value = false;
                showDiaryMain.value = false;
                diaryPin.value = '';
            };

            const handlePinInput = (n) => {
                if (n === '') return;
                if (n === '⌫') {
                    diaryPin.value = diaryPin.value.slice(0, -1);
                    diaryPinError.value = false;
                    return;
                }
                if (diaryPin.value.length >= 4) return;
                diaryPin.value += String(n);
                if (diaryPin.value.length === 4) {
                    nextTick(() => {
                        if (diaryPin.value === DIARY_PIN) {
                            showDiaryLock.value = false;
                            loadDiary();
                            showDiaryMain.value = true;
                            diaryView.value = 'today';
                        } else {
                            diaryPinError.value = true;
                            setTimeout(() => { diaryPin.value = ''; diaryPinError.value = false; }, 800);
                        }
                    });
                }
            };

            const addDiaryAchievement = () => { diaryEntry.achievements.push(''); };

            const toggleDiaryTag = (tag) => {
                const idx = diaryEntry.tags.indexOf(tag);
                if (idx === -1) diaryEntry.tags.push(tag);
                else diaryEntry.tags.splice(idx, 1);
            };

            const saveDiaryEntry = () => {
                const key = diaryTodayKey();
                const record = {
                    date: key,
                    mood: diaryEntry.mood,
                    achievements: diaryEntry.achievements.filter(a => a.trim()),
                    content: diaryEntry.content.trim(),
                    tags: [...diaryEntry.tags],
                };
                const idx = diaryHistory.value.findIndex(e => e.date === key);
                if (idx !== -1) diaryHistory.value.splice(idx, 1, record);
                else diaryHistory.value.unshift(record);
                diaryHistory.value.sort((a, b) => b.date.localeCompare(a.date));
                localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(diaryHistory.value));
                diaryView.value = 'history';
            };

            const deleteDiaryEntry = (date) => {
                diaryHistory.value = diaryHistory.value.filter(e => e.date !== date);
                localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(diaryHistory.value));
            };

           
    return {
        isDark, 
        toggleTheme,
        identities, activeIdentity, web3Project, saveIdentities,
        showHistoryModal,isFinanceUnlocked, requestUnlock, dailyReportData, showReportDetail, reportHistory, archivedReports, showReportArchiveModal, currentViewReport, viewArchivedReport,
        deleteArchivedReport, fetchDailyReportFromGist,
        macroData, isMacroLoading, getAssetName,showMacroModal, currentMacroAssetKey, currentMacroAssetData, openMacroDetail, refreshMacro,
        searchTicker,tradeLogs, showTradeLogHistory, showTradeLogInput, newTradeLogText, currentLogTime,
        openTradeLogInput, saveTradeLog, deleteTradeLog, 
        stockData, isStockLoading, stockAiInsight, analyzeStock, refreshStock,
        financeMode,
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
        editingTask, openEditModal, closeEditModal, deleteCurrentTask, editForm, saveEditTask, showDeleteOptions, deleteTaskToday, deleteTaskFuture, deleteTaskSeries,
        showInspirationModal, inspirationText, saveInspiration, inspirationInputRef, toggleInspirationModal,
        showSyncModal, showDoneHistory, allCompletedTasks, restoreTask, githubToken, gistId, handleSync, syncStatus,
        handleTouchStart, handleTouchMove, handleTouchEnd, handleTaskClick, handleSubtaskClick, addSubtask, toggleSubtask, deleteSubtask, editSubtask, handleBackgroundClick,
        showProgressModal, progressForm, progressInputRef, saveTaskProgress,
        swipeItemId, startX, currentOffsetX, handleSwipeStart, handleSwipeMove, handleSwipeEnd,
        handleTileClick, editTaskProgress, handleProgressItemClick, handleCountdownClick,
        progressTodayHours, progressTopTask, progress7DayBars,
        handleProgressMainScroll,
        isLogoAnimating, handleLogoClick, handleFocusTabClick, showRestoreModal, restorePromptText, confirmRestore,
        showAiConfigModal, aiConfig, saveAiConfig,
        showAddIdentityModal, showEditIdentityModal, newIdentityInput, editIdentityInput,
        openAddIdentityModal, confirmAddIdentity,  confirmEditIdentity, deleteIdentity,completeMission, getMissionProgress,startMissionPress,    
        clearMissionPress,
        missionSheet, openMissionSheet, closeMissionSheet,
        getTaskBarColor,
        startIdentityPress, clearIdentityPress, handleIdentityDoubleTap, handleIdentityTouchStart, isAnalyzing, runAiAnalysis, startEvolution,labMode, labSubTab,
        labHistory, addToHistory, deleteHistory, restoreHistory,
        isBottomPanelExpanded, toggleBottomPanel, handlePanelTouchStart, handlePanelTouchEnd,
        showYearlyGoals, isEditingWishes, yearlyWishes, visionTitle, addWish, deleteWish,getIdentityDays,
        getTabContainerStyle,
        getTabContainerClass,
        getTabBtnClass,getTaskDayProgress,tasksForActiveIdentity,
        adoptPlan, unlockNextPhase, clearActivePlan, unlockNextPhaseWithDispatch,
        // 成功日记
        showDiaryLock, showDiaryMain, diaryPin, diaryPinError, diaryView,
        diaryMoods, diaryTagOptions, diaryHistory, diaryTodayStr, diaryEntry,
        openDiary, closeDiary, handlePinInput,
        addDiaryAchievement, toggleDiaryTag, saveDiaryEntry, deleteDiaryEntry,
    };
        } // 结束 setup
    }); // 结束 createApp 定义



    app.directive('focus', {
        mounted(el) {
            el.focus();
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

