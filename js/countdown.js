const { ref, computed, reactive, watch, nextTick } = window.Vue;

// ==========================================
// 📅 countdown.js — 倒数日模块
// 依赖：currentTab
// ==========================================

export function useCountdown({ currentTab }) {

    const countdowns = ref([
        { id: 1, name: '比特币减半预期', date: '2028-04-18', color: 'border-orange-500', pinned: true },
        { id: 2, name: '春节', date: '2026-02-17', color: 'border-red-500', pinned: false },
    ]);

    const showExpiredCountdown = ref(false);
    const showCountdownModal   = ref(false);
    const countdownFormMode    = ref('add');
    const countdownForm        = reactive({ id: null, name: '', date: '', isLunar: false, repeat: 'none' });

    const openCountdownModal = (mode, item = null) => {
        countdownFormMode.value = mode;
        if (mode === 'edit' && item) {
            countdownForm.id      = item.id;
            countdownForm.name    = item.name;
            countdownForm.date    = item.date;
            countdownForm.isLunar = !!item.isLunar;
            countdownForm.repeat  = item.repeat || 'none';
        } else {
            countdownForm.id      = Date.now();
            countdownForm.name    = '';
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            countdownForm.date    = `${y}-${m}-${d}`;
            countdownForm.isLunar = false;
            countdownForm.repeat  = 'none';
        }
        showCountdownModal.value = true;
    };

    const closeCountdownModal = () => { showCountdownModal.value = false; };

    const saveCountdown = () => {
        if (!countdownForm.name || !countdownForm.date) { alert('请填写完整信息'); return; }
        const newItem = {
            id:      countdownForm.id,
            name:    countdownForm.name,
            date:    countdownForm.date,
            isLunar: countdownForm.isLunar,
            repeat:  countdownForm.repeat,
            pinned:  false,
            color:   'border-blue-500'
        };
        if (countdownFormMode.value === 'add') {
            countdowns.value.push(newItem);
        } else {
            const idx = countdowns.value.findIndex(c => c.id === countdownForm.id);
            if (idx !== -1) {
                newItem.pinned        = countdowns.value[idx].pinned;
                newItem.color         = countdowns.value[idx].color;
                countdowns.value[idx] = newItem;
            }
        }
        closeCountdownModal();
    };

    const deleteCountdown = (id) => {
        if (confirm('删除?')) countdowns.value = countdowns.value.filter(c => c.id !== id);
    };

    // 核心算法：计算距离天数（支持农历 + 重复周期）
    const getDaysUntilData = (item) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        let targetDate = new Date(item.date);
        targetDate.setHours(0, 0, 0, 0);
        let nextDate   = new Date(targetDate);
        const todayTime = now.getTime();

        if (item.repeat === 'none' && !item.isLunar) {
            // 普通不重复，直接用原始日期
        } else {
            const getSolarFromLunar = (solarYear, lMonth, lDay) => {
                const candidates = [];
                for (let y = solarYear - 1; y <= solarYear + 1; y++) {
                    try {
                        const l = Lunar.fromYmd(y, Math.abs(lMonth), lDay);
                        const s = l.getSolar();
                        candidates.push(new Date(s.getYear(), s.getMonth() - 1, s.getDay()));
                    } catch (e) {}
                }
                return candidates;
            };

            if (item.isLunar) {
                const baseLunar  = Lunar.fromDate(new Date(item.date));
                const candidates = getSolarFromLunar(now.getFullYear(), baseLunar.getMonth(), baseLunar.getDay());
                candidates.sort((a, b) => a - b);
                const future = candidates.find(d => d.getTime() >= todayTime - 86400000);
                if (future) nextDate = future;
            } else {
                if (item.repeat === 'year') {
                    nextDate.setFullYear(now.getFullYear());
                    if (nextDate.getTime() < todayTime - 86400000) nextDate.setFullYear(now.getFullYear() + 1);
                } else if (item.repeat === 'month') {
                    nextDate.setFullYear(now.getFullYear());
                    nextDate.setMonth(now.getMonth());
                    if (nextDate.getTime() < todayTime - 86400000) nextDate.setMonth(now.getMonth() + 1);
                } else if (item.repeat === 'week') {
                    const targetDay  = new Date(item.date).getDay();
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

        const days = Math.ceil((nextDate - now) / (1000 * 60 * 60 * 24));
        const y    = nextDate.getFullYear();
        const m    = String(nextDate.getMonth() + 1).padStart(2, '0');
        const d    = String(nextDate.getDate()).padStart(2, '0');
        return { days, targetDateStr: `${y}-${m}-${d}` };
    };

    const getRepeatText = (r) => {
        const map = { none: '', year: '每年', month: '每月', week: '每周', day: '每日' };
        return map[r] || '';
    };

    const getD = (c) => getDaysUntilData(c).days;

    // 首页列表：只显示 0 <= 天数 <= 10 的事件（未来10天内）
    const homeUpcomingList = computed(() =>
        countdowns.value
            .filter(c => { const d = getD(c); return d >= 0 && d <= 10; })
            .sort((a, b) => getD(a) - getD(b))
    );

    // displayUpcomingList：同天 >= 3 时复制列表实现无缝滚动
    const displayUpcomingList = computed(() => {
        const list = homeUpcomingList.value;
        const byDay = {};
        list.forEach(item => {
            const key = getDaysUntilData(item).targetDateStr;
            byDay[key] = (byDay[key] || 0) + 1;
        });
        const shouldScroll = Object.values(byDay).some(c => c >= 3);
        // 只有需要滚动时才复制，防止出现滑到后面是重复内容的情况
        return shouldScroll ? [...list, ...list] : list;
    });

    const upcomingList = computed(() =>
        countdowns.value.filter(c => getD(c) >= 0).sort((a, b) => getD(a) - getD(b))
    );

    const expiredList = computed(() =>
        countdowns.value.filter(c => getD(c) < 0).sort((a, b) => getD(b) - getD(a))
    );

    // 自动滚动播放：同天 >= 3 才触发
    const upcomingScroll = ref(null);
    const upcomingPaused = ref(false);
    let upcomingRAF = 0;
    let scrollPos   = 0;

    const upcomingAutoplay = computed(() => {
        const byDay = {};
        homeUpcomingList.value.forEach(item => {
            const key = getDaysUntilData(item).targetDateStr;
            byDay[key] = (byDay[key] || 0) + 1;
        });
        return Object.values(byDay).some(c => c >= 3);
    });

    const startUpcomingAutoplay = () => {
        if (currentTab.value !== 'now' || !upcomingAutoplay.value) return;
        const el = upcomingScroll.value;
        if (!el) return;
        if (upcomingRAF) { cancelAnimationFrame(upcomingRAF); upcomingRAF = 0; }
        scrollPos = el.scrollLeft;
        const step = () => {
            if (upcomingPaused.value) { upcomingRAF = requestAnimationFrame(step); return; }
            scrollPos += 0.3;
            el.scrollLeft = scrollPos;
            const resetThreshold = el.scrollWidth / 2;
            if (scrollPos >= resetThreshold) {
                scrollPos -= resetThreshold;
                el.scrollLeft = scrollPos;
            }
            upcomingRAF = requestAnimationFrame(step);
        };
        upcomingRAF = requestAnimationFrame(step);
    };

    const stopUpcomingAutoplay = () => { if (upcomingRAF) cancelAnimationFrame(upcomingRAF); upcomingRAF = 0; };
    const pauseUpcoming        = () => { upcomingPaused.value = true; };
    const resumeUpcoming       = () => { upcomingPaused.value = false; };

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

    return {
        countdowns, showExpiredCountdown,
        showCountdownModal, countdownFormMode, countdownForm,
        openCountdownModal, closeCountdownModal, saveCountdown, deleteCountdown,
        getDaysUntilData, getRepeatText,
        displayUpcomingList, homeUpcomingList, upcomingList, expiredList,
        upcomingScroll, upcomingPaused, upcomingAutoplay,
        pauseUpcoming, resumeUpcoming,
    };
}
