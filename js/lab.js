
const { ref } = window.Vue;

// 1. 闪电模式 Prompt (原版)
export const FLASH_PROMPT = `
你是一位精通《原子习惯》的行为教练。
任务：将用户模糊的想法转化为一个"2分钟就能开始"的物理动作。

请严格按以下 JSON 输出：
{
  "stretchGoal": "拉伸区挑战目标",
  "atomicStart": "2分钟启动动作",
  "steps": ["步骤1", "步骤2", "步骤3"]
}
`;

// 2. ♟️ 战略模式 (三书融合版：觉醒 + 身份 + 刻意练习)
export const STRATEGY_PROMPT = `
你是一位精通《认知觉醒》、《原子习惯》和《刻意练习》的战略规划师。
用户想达成一个长期目标。请根据用户情况（如无数据则默认初学者），设计 **3套不同风格** 的执行方案供选择。

方案风格定义：
1. **稳健型 (Turtle)**：每天时间少，周期长，适合忙碌者，无痛启动。
2. **进阶型 (Rabbit)**：强度适中，注重反馈，适合有一定基础者。
3. **极客型 (Wolf)**：高强度，周期短，通过大量刻意练习快速突破。

请严格按以下 JSON 格式输出（必须包含 options 数组，内含 3 个方案）：
{
  "options": [
    {
      "type": "🐢 稳健型",
      "analysis": "简短评估...",
      "systemName": "系统代号",
      // 💥 核心升级：不再是一句话，而是7天的数组
      "weeklySchedule": [
        // ✅ 提示 AI：请设计一周循环课表，包含训练日和休息日，注重饮食与运动的结合
        { "day": 1, "theme": "核心激活", "tasks": ["死虫式20次", "碳水循环: 低碳日"] },
        // ... (Day 2 - Day 6)  
        { "day": 7, "theme": "主动休息", "tasks": ["冥想10分钟", "饮食: 欺骗餐(Cheat Meal)"] }, 
      ],
      "frequency": "day",
      "duration": 0.5,
      "setupAction": "今日启动动作",
      "milestones": ["阶段1目标", "阶段2目标", "阶段3目标"]
    },
    {
      "type": "🐇 进阶型",
      // ... 格式同上
    },
    {
      "type": "🐺 极客型",
      // ... 格式同上
    }
  ]
}
*注意：frequency 只能是 'day'|'week'|'month'。duration 是小时数。*
`;

// 3. 📥 萃取模式 (DeepSeek 专用长文本提炼)
export const EXTRACT_PROMPT = `
你是一个顶级的知识萃取专家。用户会输入一段高价值的长篇大论或聊天记录。
你的任务是：提炼出里面**所有的核心操作规范、参数指标和行动步骤**。
绝不能丢失具体的数值（如价格区间、转化率等）和干货细节，尽可能保留原汁原味，并转化为可执行的清单。

请严格按以下 JSON 格式输出：
{
  "stretchGoal": "一句话总结这段话的核心战略意图",
  "systemName": "为这套打法起一个响亮的名字（如：极客截流选品法）",
  "atomicStart": "马上能做的第一步动作",
  "steps": [
    "规则/标准1：详细保留数值和判断逻辑...",
    "规则/标准2：详细保留数值和判断逻辑...",
    "实操步骤1：具体怎么做...",
    "实操步骤2：具体怎么做..."
  ] // 根据原文长度，提取出 5 到 12 条详细的路径和规则，越详细越好
}
`;

export function useLab() {
    const identities = ref(JSON.parse(localStorage.getItem('ff_custom_identities')) || []);
    const activeIdentity = ref(identities.value[0] || null);
    
    // 👇 状态升级：'flash' | 'strategy' | 'extract'
    const labMode = ref('flash');

    const saveIdentities = () => {
        localStorage.setItem('ff_custom_identities', JSON.stringify(identities.value));
    };

    
    const labHistory = ref(JSON.parse(localStorage.getItem('ff_lab_history')) || []);

    const web3Project = ref({
        name: '',
        // 👇 数据结构大改：不再存单个字段，而是存方案列表
        plans: [], 
        selectedPlanIndex: 0, // 默认选中第0个
        
        // 兼容旧逻辑的临时字段 (UI展示用)
        get currentPlan() {
            return this.plans[this.selectedPlanIndex] || {};
        }
    });
    
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
        // 恢复方案数据
        if (record.result.options) {
            web3Project.value.plans = record.result.options;
            isStrategyMode.value = true; // 历史记录通常是战略
        } else {
            // 兼容旧历史
            web3Project.value.plans = [record.result];
        }
        web3Project.value.selectedPlanIndex = 0;
    };

    return {
        identities, activeIdentity, web3Project, saveIdentities,
        labMode, FLASH_PROMPT, STRATEGY_PROMPT, EXTRACT_PROMPT,
        labHistory, addToHistory, deleteHistory, restoreHistory,
    };


}
