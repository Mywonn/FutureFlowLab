const { ref, computed, watch, nextTick } = window.Vue;

// ==========================================
// 💰 finance.js — 金融模块 (从 app.js 拆分)
// 包含：研报系统 / 解锁门控 / 宏观大盘 / 个股查询 / 交易速记
// ==========================================

export function useFinance({ labSubTab, showSyncModal, aiConfig }) {

    // ==========================================
    // 🔒 解锁门控
    // ==========================================
    const isFinanceUnlocked = ref(false);

    // 校验逻辑：token 合法（ghp_ 开头）且已配置 Gist ID，即视为本人，解锁金融模块
    // 逻辑与原版一致，无需额外的 authGistId，iPhone PWA 填一次同步配置即永久生效
    const checkFinanceUnlock = () => {
        const savedToken  = localStorage.getItem('mike_github_token');
        const savedGistId = localStorage.getItem('mike_gist_id');

        if (savedToken && savedToken.startsWith('ghp_') && savedGistId) {
            isFinanceUnlocked.value = true;
        } else {
            isFinanceUnlocked.value = false;
        }
    };

    const requestUnlock = (target) => {
        if (isFinanceUnlocked.value) {
            executeUnlockTarget(target);
        } else {
            alert('🔒 访问受限：未检测到主理人专属 Gist 配置，请前往云同步设置。');
            showSyncModal.value = true;
        }
    };

    const executeUnlockTarget = (target) => {
        if (target === 'finance') {
            labSubTab.value = 'finance';
        } else if (target === 'report') {
            if (dailyReportData.value) {
                currentViewReport.value = dailyReportData.value;
                showReportDetail.value = true;
                const targetReport = reportHistory.value.find(r => r.id === dailyReportData.value.id);
                if (targetReport) {
                    targetReport.isRead = true;
                    targetReport.hasNew = false;
                    localStorage.setItem('ff_report_history', JSON.stringify(reportHistory.value));
                }
            }
        } else if (target === 'archive') {
            showReportArchiveModal.value = true;
        }
    };

    // ==========================================
    // 🗄️ 研报历史档案库
    // ==========================================
    const reportHistory        = ref(JSON.parse(localStorage.getItem('ff_report_history')) || []);
    const currentViewReport    = ref(null);
    const showReportArchiveModal = ref(false);
    const showReportDetail     = ref(false);

    const dailyReportData = computed(() => reportHistory.value.find(r => !r.isRead) || null);
    const archivedReports = computed(() => reportHistory.value.filter(r => r.isRead));

    // 📡 从 Gist 拉取每日复盘数据（Gist ID 完全从 localStorage 读取，不硬编码）
    const fetchDailyReportFromGist = async () => {
        const token  = localStorage.getItem('mike_github_token');
        const gistId = localStorage.getItem('ff_sync_gist_id') || localStorage.getItem('mike_gist_id');
        if (!token || !gistId) return;

        try {
            const res = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!res.ok) throw new Error('拉取 Gist 失败');
            const data = await res.json();

            if (data.files && data.files['ff_finance_report.json']) {
                const reportJson  = JSON.parse(data.files['ff_finance_report.json'].content);
                const fingerprint = reportJson.date + '_' + (reportJson.content ? reportJson.content.length : '0');
                const exists      = reportHistory.value.some(r => r.fingerprint === fingerprint);

                if (!exists) {
                    reportJson.fingerprint = fingerprint;
                    reportJson.id     = Date.now();
                    reportJson.isRead = false;
                    reportJson.hasNew = true;
                    reportHistory.value.unshift(reportJson);
                    if (reportHistory.value.length > 50) reportHistory.value.pop();
                    localStorage.setItem('ff_report_history', JSON.stringify(reportHistory.value));
                }
            }
        } catch (error) {
            console.error('获取复盘数据失败:', error);
        }
    };

    const viewArchivedReport = (report) => {
        currentViewReport.value = report;
        showReportDetail.value  = true;
    };

    const deleteArchivedReport = (id) => {
        reportHistory.value = reportHistory.value.filter(r => r.id !== id);
        localStorage.setItem('ff_report_history', JSON.stringify(reportHistory.value));
        if (currentViewReport.value && currentViewReport.value.id === id) {
            currentViewReport.value = null;
            showReportDetail.value  = false;
        }
        if (navigator.vibrate) navigator.vibrate(10);
    };

    // ==========================================
    // 📈 宏观大盘
    // ==========================================
    const macroData            = ref(null);
    const isMacroLoading       = ref(false);
    const showMacroModal       = ref(false);
    const currentMacroAssetKey  = ref('');
    const currentMacroAssetData = ref(null);

    const getAssetName = (key) => {
        const map = {
            us10y: '10年美债 (锚)', dxy: '美元指数 (水)',
            gold: '黄金 (避险)', spx: '标普500 (基石)',
            ndx: '纳指100 (矛)', btc: '比特币 (鸟)'
        };
        return map[key] || key.toUpperCase();
    };

    // 带"休市感知"的日期推算
    const generateRecentDates = (length, assetKey) => {
        const dates  = [];
        let d        = new Date();
        const isCrypto = (assetKey === 'btc');

        if (!isCrypto) {
            while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
        }
        for (let i = 0; i < length; i++) {
            dates.unshift(`${d.getMonth() + 1}/${d.getDate()}`);
            d.setDate(d.getDate() - 1);
            if (!isCrypto) {
                while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
            }
        }
        return dates;
    };

    const drawSparklines = (assets) => {
        Object.keys(assets).forEach(key => {
            const dom = document.getElementById(`chart-${key}`);
            if (dom && window.echarts) {
                const chart    = window.echarts.getInstanceByDom(dom) || window.echarts.init(dom);
                const lineData = assets[key].sparkline;
                const isUp     = assets[key].change_pct >= 0;
                const color    = isUp ? '#10b981' : '#ef4444';
                chart.setOption({
                    grid:   { top: 5, bottom: 5, left: 0, right: 0 },
                    xAxis:  { type: 'category', show: false },
                    yAxis:  { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
                    series: [{ data: lineData, type: 'line', smooth: true, showSymbol: false,
                        lineStyle: { color, width: 2 },
                        areaStyle: { color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1,
                            [{ offset: 0, color: color + '40' }, { offset: 1, color: color + '00' }]) }
                    }]
                });
            }
        });
    };

    const openMacroDetail = (key, asset) => {
        currentMacroAssetKey.value  = key;
        currentMacroAssetData.value = asset;
        showMacroModal.value        = true;

        nextTick(() => {
            const dom = document.getElementById('macro-detail-chart');
            if (dom && window.echarts) {
                const existing = window.echarts.getInstanceByDom(dom);
                if (existing) existing.dispose();

                const chart    = window.echarts.init(dom);
                const lineData = asset.sparkline;
                const isUp     = asset.change_pct >= 0;
                const color    = isUp ? '#10b981' : '#ef4444';
                const xDates   = generateRecentDates(lineData.length, key);

                chart.setOption({
                    tooltip: {
                        trigger: 'axis',
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        borderColor: '#334155',
                        padding: [8, 12],
                        textStyle: { color: '#f1f5f9', fontSize: 12 },
                        formatter: (params) =>
                            `<div style="color:#94a3b8;font-size:10px;margin-bottom:4px">${params[0].name}</div>
                             <span style="color:${color};font-size:14px;margin-right:6px">●</span>
                             <span style="color:#fff;font-size:18px;font-weight:900">${params[0].value}</span>`
                    },
                    grid:   { top: 15, bottom: 20, left: 5, right: 15, containLabel: true },
                    xAxis:  { type: 'category', data: xDates, boundaryGap: false,
                        axisLine: { lineStyle: { color: '#1e293b' } },
                        axisLabel: { color: '#64748b', fontSize: 10, margin: 12 },
                        axisTick: { show: false }
                    },
                    yAxis:  { type: 'value', scale: true,
                        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
                        axisLabel: { color: '#64748b', fontSize: 10 }
                    },
                    series: [{ data: lineData, type: 'line', smooth: true, showSymbol: false, symbolSize: 6,
                        lineStyle: { color, width: 3 },
                        areaStyle: { color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1,
                            [{ offset: 0, color: color + '50' }, { offset: 1, color: color + '00' }]) },
                        emphasis: { focus: 'series' }
                    }]
                });
            }
        });
    };

    const fetchMacroData = async (force = false) => {
        if (!force && macroData.value) return;
        isMacroLoading.value = true;
        try {
            const res = await fetch('https://ff-api.zeabur.app/api/macro');
            if (!res.ok) throw new Error('网络响应错误');
            macroData.value = await res.json();
            nextTick(() => drawSparklines(macroData.value.assets));
        } catch (error) {
            console.error('获取宏观数据失败:', error);
        } finally {
            isMacroLoading.value = false;
        }
    };

    const refreshMacro = () => fetchMacroData(true);

    // ==========================================
    // 📊 个股查询
    // ==========================================
    const searchTicker   = ref('');
    const stockData      = ref(null);
    const isStockLoading = ref(false);
    const stockAiInsight = ref('');

    const STOCK_CACHE_KEY = 'ff_stock_cache';
    const readStockCache  = () => { try { return JSON.parse(localStorage.getItem(STOCK_CACHE_KEY)) || {}; } catch { return {}; } };
    const writeStockCache = (obj) => { try { localStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(obj)); } catch {} };

    const drawStockChart = () => {
        if (!stockData.value) return;
        const dom = document.getElementById('stock-chart');
        if (dom && window.echarts) {
            const existing = window.echarts.getInstanceByDom(dom);
            if (existing) existing.dispose();
            const chart   = window.echarts.init(dom);
            const history = stockData.value.history;
            const isUp    = history[history.length - 1] >= history[0];
            const color   = isUp ? '#10b981' : '#ef4444';
            chart.setOption({
                grid:   { top: 5, bottom: 5, left: 0, right: 0 },
                xAxis:  { type: 'category', show: false },
                yAxis:  { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
                series: [{ data: history, type: 'line', smooth: true, showSymbol: false,
                    lineStyle: { color, width: 2 },
                    areaStyle: { color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1,
                        [{ offset: 0, color: color + '40' }, { offset: 1, color: color + '00' }]) }
                }]
            });
        }
    };

    const getStockData = async (ticker) => {
        const t     = ticker.trim().toUpperCase();
        const cache = readStockCache();
        const now   = Date.now();
        const ttl   = 1000 * 60 * 3;
        if (cache[t] && now - cache[t].ts < ttl) return cache[t].data;

        const endpoints = [
            `https://ff-api.zeabur.app/api/stock/${t}`,
            `https://api.futureflow.cyou/stock/${t}`
        ];
        let lastErr = null;
        for (const url of endpoints) {
            try {
                const r = await fetch(url);
                if (!r.ok) {
                    const txt = await r.text().catch(() => '');
                    if (r.status === 429) throw new Error('请求过于频繁，请稍后重试');
                    throw new Error(`${r.status} ${r.statusText} ${txt}`.trim());
                }
                const j = await r.json();
                cache[t] = { ts: now, data: j };
                writeStockCache(cache);
                return j;
            } catch (e) { lastErr = e; }
        }
        throw lastErr || new Error('获取股票数据失败');
    };

    const getFinancialsData = async (ticker) => {
        const t = ticker.trim().toUpperCase();
        const endpoints = [
            `https://api.futureflow.cyou/financials/${t}`,
            `https://ff-api.zeabur.app/api/financials/${t}`
        ];
        for (const url of endpoints) {
            try {
                const r = await fetch(url);
                if (!r.ok) continue;
                return await r.json();
            } catch {}
        }
        return null;
    };

    const generateStockAiInsight = async (data) => {
        if (!aiConfig.key) {
            stockAiInsight.value = '⚠️ 请先在右上角⚙️配置 AI 密钥，以获取智能诊断。';
            return;
        }
        stockAiInsight.value = '🤖 智脑正在深度解析各项指标，请稍候...';
        try {
            const has   = (p) => typeof p !== 'undefined' && p !== null;
            const lines = [
                `代码: ${data.ticker || 'N/A'}`,
                `最新价: ${has(data.price) ? data.price : 'N/A'}`,
            ];
            if (data?.indicators?.rsi)   lines.push(`RSI: ${data.indicators.rsi}`);
            if (has(data?.indicators?.peg)) lines.push(`PEG: ${data.indicators.peg}`);
            if (data?.indicators?.alpha) lines.push(`Alpha: ${data.indicators.alpha}%`);
            if (data?.scores) {
                const s = data.scores;
                lines.push(`评分: 价值${s.Value ?? '-'}, 成长${s.Growth ?? '-'}, 质量${s.Quality ?? '-'}, 财务${s.Financial ?? '-'}, 动能${s.Momentum ?? '-'}`);
            }
            const f   = data?.financials;
            const ttm = f?.ttm || {};
            if (typeof ttm.revenue      !== 'undefined') lines.push(`营收TTM: ${ttm.revenue}`);
            if (typeof ttm.netIncome    !== 'undefined') lines.push(`净利润TTM: ${ttm.netIncome}`);
            if (typeof ttm.eps          !== 'undefined') lines.push(`EPS TTM: ${ttm.eps}`);
            if (typeof ttm.grossMargin  !== 'undefined') lines.push(`毛利率TTM: ${ttm.grossMargin}`);

            const prompt = `你是华尔街顶级交易员。根据以下有限数据，用一段话给出客观的诊断与明确动作建议（买入/观望/卖出），语言要克制专业：\n${lines.join('\n')}`;
            const GEMINI_PROXY = 'https://api.futureflow.cyou';
            let rawText = '';

            if (aiConfig.model === 'deepseek-chat') {
                const response = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.key}` },
                    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }] })
                });
                const resData = await response.json();
                rawText = resData.choices[0].message.content;
            } else {
                const baseUrl  = GEMINI_PROXY.endsWith('/') ? GEMINI_PROXY.slice(0, -1) : GEMINI_PROXY;
                const response = await fetch(`${baseUrl}/v1/models/${aiConfig.model}:generateContent?key=${aiConfig.key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    throw new Error(`Gemini 请求失败: ${response.status} ${response.statusText} ${errText}`.trim());
                }
                const resData = await response.json();
                rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            }
            stockAiInsight.value = rawText;
        } catch (e) {
            stockAiInsight.value = '❌ AI 诊断请求超时或失败。';
        }
    };

    const analyzeStock = async () => {
        if (!searchTicker.value.trim()) return;
        isStockLoading.value = true;
        stockData.value      = null;
        stockAiInsight.value = '';
        try {
            const [base, fins] = await Promise.all([
                getStockData(searchTicker.value),
                getFinancialsData(searchTicker.value)
            ]);
            stockData.value = { ...base, financials: fins || null };
            nextTick(() => drawStockChart());
            generateStockAiInsight(stockData.value);
        } catch (e) {
            alert(e.message || '获取股票数据失败');
        } finally {
            isStockLoading.value = false;
        }
    };

    const refreshStock = async () => {
        if (searchTicker.value.trim()) await analyzeStock();
    };

    // ==========================================
    // 📝 交易速记
    // ==========================================
    const tradeLogs         = ref(JSON.parse(localStorage.getItem('ff_trade_logs')) || []);
    const showTradeLogHistory = ref(false);
    const showTradeLogInput = ref(false);
    const newTradeLogText   = ref('');
    const currentLogTime    = ref('');
    const financeMode       = ref('macro');

    const openTradeLogInput = () => {
        const now = new Date();
        currentLogTime.value   = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        newTradeLogText.value  = '';
        showTradeLogInput.value = true;
    };

    const saveTradeLog = () => {
        if (!newTradeLogText.value.trim()) return;
        let tag = '宏观感知';
        if (financeMode.value === 'stock' && searchTicker.value) {
            tag = searchTicker.value.toUpperCase();
        } else if (financeMode.value === 'macro' && showMacroModal.value && currentMacroAssetKey.value) {
            tag = getAssetName(currentMacroAssetKey.value);
        }
        tradeLogs.value.unshift({ id: Date.now(), time: currentLogTime.value, content: newTradeLogText.value.trim(), tag });
        localStorage.setItem('ff_trade_logs', JSON.stringify(tradeLogs.value));
        showTradeLogInput.value = false;
        if (navigator.vibrate) navigator.vibrate(50);
    };

    const deleteTradeLog = (id) => {
        if (confirm('确定要删除这条交易日记吗？')) {
            tradeLogs.value = tradeLogs.value.filter(l => l.id !== id);
            localStorage.setItem('ff_trade_logs', JSON.stringify(tradeLogs.value));
        }
    };

    // financeMode 切换时重绘图表
    watch(financeMode, (newVal) => {
        if (newVal === 'macro' && macroData.value) {
            nextTick(() => drawSparklines(macroData.value.assets));
        } else if (newVal === 'stock' && stockData.value) {
            nextTick(() => drawStockChart());
        }
    });

    // labSubTab 切换到 finance 时自动拉取数据
    watch(labSubTab, (newTab) => {
        if (newTab === 'finance') {
            if (financeMode.value === 'macro') {
                if (!macroData.value) fetchMacroData();
                else nextTick(() => drawSparklines(macroData.value.assets));
            } else if (financeMode.value === 'stock' && stockData.value) {
                nextTick(() => drawStockChart());
            }
        }
    });

    return {
        // 解锁
        isFinanceUnlocked, checkFinanceUnlock, requestUnlock,
        // 研报
        reportHistory, currentViewReport, showReportArchiveModal, showReportDetail,
        dailyReportData, archivedReports,
        fetchDailyReportFromGist, viewArchivedReport, deleteArchivedReport,
        // 宏观
        macroData, isMacroLoading, showMacroModal, currentMacroAssetKey, currentMacroAssetData,
        getAssetName, openMacroDetail, fetchMacroData, refreshMacro, drawSparklines,
        // 个股
        searchTicker, stockData, isStockLoading, stockAiInsight,
        drawStockChart, analyzeStock, refreshStock,
        // 交易速记
        tradeLogs, showTradeLogHistory, showTradeLogInput, newTradeLogText, currentLogTime,
        openTradeLogInput, saveTradeLog, deleteTradeLog,
        // 模式
        financeMode,
    };
}
