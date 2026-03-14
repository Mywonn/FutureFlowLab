
const { ref } = window.Vue;

// 1. 闪电模式 Prompt
export const FLASH_PROMPT = `
你是一位精通《原子习惯》的行为教练。
任务：将用户模糊的想法转化为一个"2分钟就能开始"的物理动作。

请严格按以下 JSON 输出：
{
  "stretchGoal": "拉伸区挑战目标",
  "missionDays": 7, // 👈 核心：AI 根据动作难度预估的合理执行天数 (如7, 14, 21等整数)
  "atomicStart": "2分钟启动动作",
  "steps": ["步骤1", "步骤2", "步骤3"]
}
`;

// 2. ♟️ 战略模式 
export const STRATEGY_PROMPT = `
你是一位精通《认知觉醒》、《原子习惯》和《刻意练习》的战略规划师。
用户想达成一个长期目标。请根据用户情况，设计 3套不同风格的完整执行方案。

方案风格定义：
1. 稳健型 (Turtle)：无痛启动，节奏慢但可持续。
2. 进阶型 (Rabbit)：强度适中，有明确里程碑。
3. 极客型 (Wolf)：高强度快速突破，短期密集冲刺。

每个方案必须包含完整的 phases（阶段）路线，阶段之间有递进关系，绝不是同一套动作的简单重复。

请严格按以下 JSON 格式输出：
{
  "options": [
    {
      "type": "🐢 稳健型",
      "systemName": "系统代号（简短有力）",
      "analysis": "2-3句话评估：此方案适合谁、核心节奏是什么、预期成果",
      "missionDays": 60,
      "setupAction": "今天就能做的第一个具体启动动作（越具体越好）",
      "phases": [
        {
          "phaseIndex": 1,
          "phaseName": "破冰期",
          "duration": 14,
          "goal": "这个阶段结束时要达成的具体可验证成果",
          "unlockCondition": "解锁下一阶段的明确条件（必须具体可验证，例如：完成首批5个商品上架）",
          "dailyFocus": "这个阶段每天的核心动作（1-2句话）",
          "tasks": [
            { "day": 1, "theme": "今日主题", "actions": ["具体行动1", "具体行动2"] },
            { "day": 2, "theme": "今日主题", "actions": ["具体行动1", "具体行动2"] },
            { "day": 3, "theme": "今日主题", "actions": ["具体行动1"] }
          ]
        },
        {
          "phaseIndex": 2,
          "phaseName": "加速期",
          "duration": 21,
          "goal": "...",
          "unlockCondition": "...",
          "dailyFocus": "...",
          "tasks": [
            { "day": 1, "theme": "...", "actions": ["..."] },
            { "day": 2, "theme": "...", "actions": ["..."] }
          ]
        },
        {
          "phaseIndex": 3,
          "phaseName": "收割期",
          "duration": 25,
          "goal": "...",
          "unlockCondition": "目标达成的最终验收标准",
          "dailyFocus": "...",
          "tasks": [
            { "day": 1, "theme": "...", "actions": ["..."] },
            { "day": 2, "theme": "...", "actions": ["..."] }
          ]
        }
      ]
    }
  ]
}

注意：
- options 数组必须包含 3 个方案（🐢稳健型、🐇进阶型、🐺极客型），结构完全相同
- 每个方案至少 3 个 phases，代表完整旅程（启动→执行→收割），每个方案的 phases 节奏和内容要明显不同
- tasks 只展示前 3 天作为预览，其余省略
- unlockCondition 必须具体可验证，不能是"坚持下去"这类模糊表达
- missionDays 必须等于该方案所有 phases 的 duration 之和
`;

// 3. 📥 萃取模式
export const EXTRACT_PROMPT = `
你是一个顶级的知识萃取专家。用户会输入一段高价值的长篇大论或聊天记录。
你的任务是：提炼出里面所有的核心操作规范、参数指标和行动步骤。

请严格按以下 JSON 格式输出：
{
  "stretchGoal": "一句话总结这段话的核心战略意图",
  "systemName": "为这套打法起一个响亮的名字",
  "missionDays": 14, // 👈 核心：AI预估将这套打法初步跑通所需的执行天数 (整数)
  "atomicStart": "马上能做的第一步动作",
  "steps": [
    "规则1...",
    "实操步骤1..."
  ]
}
`;

export function useLab() {
    const identities = ref(JSON.parse(localStorage.getItem('ff_custom_identities')) || []);
    
    // ✨ 核心修复：读取你上次离开时选中的身份 ID
    const savedActiveId = localStorage.getItem('ff_active_identity_id');
    const activeIdentity = ref(savedActiveId ? (identities.value.find(i => i.id === savedActiveId) || identities.value[0] || null) : (identities.value[0] || null));
    
    // 👇 状态升级：'flash' | 'strategy' | 'extract'
    const labMode = ref('flash');
    
    const labSubTab = ref('awake');

    const saveIdentities = () => {
        localStorage.setItem('ff_custom_identities', JSON.stringify(identities.value));
        // ✨ 同步保存当前选中的身份 ID
        if (activeIdentity.value) {
            localStorage.setItem('ff_active_identity_id', activeIdentity.value.id);
        }
    };

    
    const labHistory = ref(JSON.parse(localStorage.getItem('ff_lab_history')) || []);

    const web3Project = ref({
        name: '',
        plans: [], 
        selectedPlanIndex: 0,
        
        // 执行状态：采用方案后激活
        activePlan: null,
        currentPhaseIndex: 0,

        get currentPlan() {
            return this.plans[this.selectedPlanIndex] || {};
        }
    });

    // 恢复持久化的执行状态
    const savedActivePlan = JSON.parse(localStorage.getItem('ff_active_plan') || 'null');
    if (savedActivePlan) {
        web3Project.value.activePlan = savedActivePlan.plan;
        web3Project.value.currentPhaseIndex = savedActivePlan.currentPhaseIndex || 0;
    }

    // 采用方案，进入执行模式
    const adoptPlan = (planIndex) => {
        const plan = web3Project.value.plans[planIndex];
        if (!plan) return;
        web3Project.value.activePlan = JSON.parse(JSON.stringify(plan));
        web3Project.value.currentPhaseIndex = 0;
        localStorage.setItem('ff_active_plan', JSON.stringify({
            plan: web3Project.value.activePlan,
            currentPhaseIndex: 0
        }));
    };

    // 解锁下一阶段
    const unlockNextPhase = () => {
        const plan = web3Project.value.activePlan;
        if (!plan || !plan.phases) return;
        const maxIndex = plan.phases.length - 1;
        if (web3Project.value.currentPhaseIndex < maxIndex) {
            web3Project.value.currentPhaseIndex++;
            localStorage.setItem('ff_active_plan', JSON.stringify({
                plan: plan,
                currentPhaseIndex: web3Project.value.currentPhaseIndex
            }));
        }
    };

    // 退出执行模式（清除）
    const clearActivePlan = () => {
        web3Project.value.activePlan = null;
        web3Project.value.currentPhaseIndex = 0;
        localStorage.removeItem('ff_active_plan');
    };
    
    // ✅ 保存历史记录的方法
    const addToHistory = (promptText, resultData) => {
        const record = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            projectName: web3Project.value.name,
            prompt: promptText,
            result: resultData // 完整保存 AI 返回的 JSON
        };
        labHistory.value.unshift(record);
        localStorage.setItem('ff_lab_history', JSON.stringify(labHistory.value));
    };

    // 删除历史
    const deleteHistory = (id) => {
        labHistory.value = labHistory.value.filter(h => h.id !== id);
        localStorage.setItem('ff_lab_history', JSON.stringify(labHistory.value));
    };

    // 恢复历史
    const restoreHistory = (record) => {
        web3Project.value.name = record.projectName;
        
        if (record.result.options) {
            web3Project.value.plans = record.result.options;
            // 兼容可能存在的 labMode 或 isStrategyMode
            if (typeof labMode !== 'undefined') labMode.value = 'strategy';
            else if (typeof isStrategyMode !== 'undefined') isStrategyMode.value = true;
        } else {
            // 🐛 核心修复 1：将历史记录的原始 JSON 重新组装成 UI 需要的标准格式
            web3Project.value.plans = [{
                type: record.result.systemName ? '💡 灵感萃取' : '⚡ 极速行动',
                systemName: record.result.systemName || '历史萃取记录',
                analysis: record.result.stretchGoal,
                // 兼容新老字段命名
                setupAction: record.result.setupAction || record.result.atomicStart,
                milestones: record.result.milestones || record.result.steps || []
            }];
            
            // 自动推断恢复的模式
            if (typeof labMode !== 'undefined') {
                labMode.value = record.result.systemName ? 'extract' : 'flash';
            }
        }
        web3Project.value.selectedPlanIndex = 0;
    };

    return {
        identities, activeIdentity, web3Project, saveIdentities,
        labMode, labSubTab, FLASH_PROMPT, STRATEGY_PROMPT, EXTRACT_PROMPT,
        labHistory, addToHistory, deleteHistory, restoreHistory,
        adoptPlan, unlockNextPhase, clearActivePlan,
    };


}
