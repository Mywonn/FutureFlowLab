// js/lab.js 修改
const { ref, reactive } = window.Vue;

// 🚀 这里的常量就是你的“灵魂指令”
export const AWAKENING_PROMPT = `
你是一位精通《原子习惯》和《认知觉醒》的行为科学教练。
你的任务是将用户模糊的想法转化为一个极具执行力的“闪电任务”。

解析规则：
1. 消除模糊（认知觉醒）：将目标具象化，锁定一个处于用户“拉伸区”的具体挑战。
2. 两分钟法则（原子习惯）：设计一个 2 分钟内就能开始的物理动作作为入口。
3. 身份认同（原子习惯）：强化用户作为该领域专家的身份感。

请严格按以下 JSON 格式输出，不要包含任何多余文字：
{
  "stretchGoal": "具体的拉伸目标文字",
  "atomicStart": "具体的 2 分钟启动动作文字",
  "identityFeedback": "一句鼓励身份认同的话"
}
`;




export function useLab() {
    // 🚀 核心改动：身份不再是预设，而是从本地存储读取或为空
    const identities = ref(JSON.parse(localStorage.getItem('ff_custom_identities')) || []);
    const activeIdentity = ref(identities.value[0] || null);

    const web3Project = ref({
        name: '',
        stretchGoal: '',
        atomicStart: '',
        suggestedSteps: []
    });

    // 🚀 新增：保存自定义身份到本地
    const saveIdentities = () => {
        localStorage.setItem('ff_custom_identities', JSON.stringify(identities.value));
    };

    return {
        identities,
        activeIdentity,
        web3Project,
        saveIdentities,
        // 留给下一步：AI 生成身份的逻辑
    };
}