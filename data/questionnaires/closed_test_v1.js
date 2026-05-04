export const CLOSED_TEST_V1 = Object.freeze({
  questionnaireId: "closed_test_v1",
  schemaVersion: 1,
  title: "Closed Test Feedback Dossier",
  subtitle: "内测问卷回执",
  intro: "这份问卷会单独保存到 feedback/ 目录，不会进入正式存档。填写完成后可导出 JSON 回执与 TXT 摘要，直接发送给开发者。",
  sections: [
    {
      id: "player_meta",
      title: "玩家背景",
      description: "先确认这次体验的大致背景，便于开发者解释后续反馈。",
      questions: [
        {
          id: "A1",
          type: "single",
          label: "你主要使用什么设备体验这次版本？",
          required: true,
          exportKey: "deviceClass",
          options: [
            { value: "desktop", label: "台式机 / 外接显示器" },
            { value: "laptop", label: "笔记本" },
            { value: "tablet", label: "平板" },
            { value: "mobile", label: "手机" },
            { value: "handheld", label: "掌机 / 小屏设备" }
          ]
        },
        {
          id: "A2",
          type: "single",
          label: "这次大约玩了多久？",
          required: true,
          exportKey: "playDurationBand",
          options: [
            { value: "under_30m", label: "30 分钟以内" },
            { value: "30m_to_90m", label: "30 到 90 分钟" },
            { value: "90m_to_3h", label: "90 分钟到 3 小时" },
            { value: "over_3h", label: "3 小时以上" }
          ]
        },
        {
          id: "A3",
          type: "single",
          label: "这是你第一次接触这个项目吗？",
          required: true,
          exportKey: "isFirstTimePlayer",
          options: [
            { value: true, label: "是，第一次" },
            { value: false, label: "不是，之前玩过" }
          ]
        }
      ]
    },
    {
      id: "experience",
      title: "体验评价",
      description: "用简短量表确认这次版本的整体体感。",
      questions: [
        {
          id: "B4",
          type: "scale",
          label: "开场节奏是否容易进入状态？",
          required: true,
          options: [
            { value: 1, label: "1 很难进入" },
            { value: 2, label: "2 偏慢" },
            { value: 3, label: "3 一般" },
            { value: 4, label: "4 比较顺" },
            { value: 5, label: "5 很自然" }
          ]
        },
        {
          id: "B5",
          type: "scale",
          label: "你对当前 UI 信息层级的理解难度如何？",
          required: true,
          options: [
            { value: 1, label: "1 很混乱" },
            { value: 2, label: "2 偏难理解" },
            { value: 3, label: "3 基本可用" },
            { value: 4, label: "4 比较清楚" },
            { value: 5, label: "5 非常清楚" }
          ]
        },
        {
          id: "B6",
          type: "scale",
          label: "整体来说，你给这次体验打几分？",
          required: true,
          exportKey: "overallFunScore",
          options: [
            { value: 1, label: "1 不想继续" },
            { value: 2, label: "2 有明显问题" },
            { value: 3, label: "3 能继续观察" },
            { value: 4, label: "4 值得继续玩" },
            { value: 5, label: "5 很想继续玩" }
          ]
        },
        {
          id: "B7",
          type: "scale",
          label: "本次游玩时你有继续游玩的动力吗？",
          required: true,
          options: [
            { value: 1, label: "1" },
            { value: 2, label: "2" },
            { value: 3, label: "3" },
            { value: 4, label: "4" },
            { value: 5, label: "5" }
          ]
        },
        {
          id: "B8",
          type: "text",
          label: "您的游玩动力主要来源于？且在什么时候感到枯燥呢？",
          required: false,
          placeholder: "例如：动力来自剧情、氛围或机制；在哪个阶段开始觉得重复、拖沓或缺少反馈。",
          maxLength: 400
        },
        {
          id: "B9",
          type: "scale",
          label: "下个版本推出后您还愿意重复体验本游戏吗？",
          required: true,
          options: [
            { value: 1, label: "1" },
            { value: 2, label: "2" },
            { value: 3, label: "3" },
            { value: 4, label: "4" },
            { value: 5, label: "5" }
          ]
        }
      ]
    },
    {
      id: "issues",
      title: "问题与摩擦",
      description: "把你真正卡住的点写清楚，越具体越有帮助。",
      questions: [
        {
          id: "C9",
          type: "scale",
          label: "地图与场景文字是否容易读懂？",
          required: true,
          options: [
            { value: 1, label: "1 经常看不懂" },
            { value: 2, label: "2 容易迷失" },
            { value: 3, label: "3 偶尔卡住" },
            { value: 4, label: "4 大多清楚" },
            { value: 5, label: "5 很清楚" }
          ]
        },
        {
          id: "C10",
          type: "scale",
          label: "操作按钮和反馈是否足够明确？",
          required: true,
          options: [
            { value: 1, label: "1 经常误解" },
            { value: 2, label: "2 不够稳定" },
            { value: 3, label: "3 基本够用" },
            { value: 4, label: "4 较清晰" },
            { value: 5, label: "5 很明确" }
          ]
        },
        {
          id: "C11",
          type: "multi",
          label: "你觉得当前最需要优先处理的问题有哪些？",
          required: true,
          exportKey: "topProblems",
          options: [
            { value: "onboarding", label: "开场引导与节奏" },
            { value: "readability", label: "文本与信息层级" },
            { value: "menu_flow", label: "菜单与存取流程" },
            { value: "feedback", label: "行为反馈不够明确" },
            { value: "performance", label: "性能 / 卡顿 / 设备适配" },
            { value: "bugs", label: "明显 bug 或状态错乱" }
          ]
        },
        {
          id: "C12",
          type: "text",
          label: "如果有一个片段让你印象深刻，它是什么？",
          required: false,
          placeholder: "可以写一个场景、一句文案、一个系统反应，或为什么它有效。",
          maxLength: 500
        },
        {
          id: "C13",
          type: "text",
          label: "请写下你最想让开发者优先看到的一条反馈。",
          required: true,
          placeholder: "建议尽量写成：问题发生在什么位置、你当时想做什么、实际发生了什么。",
          maxLength: 1000
        },
        {
          id: "C14",
          type: "bug_report",
          label: "如果遇到 bug，可在这里补充一个可复现回执。",
          required: false,
          placeholder: "只写你确认有价值的信息，不必强行填写。",
          fields: [
            { id: "summary", label: "问题概述", placeholder: "一句话描述问题。", maxLength: 180 },
            { id: "steps", label: "复现步骤", placeholder: "按顺序写出你做了什么。", maxLength: 800 },
            { id: "expected", label: "你原本预期会发生什么", placeholder: "例如：应该正常切回主菜单。", maxLength: 400 },
            { id: "actual", label: "实际发生了什么", placeholder: "例如：界面停在半透明层，按钮失效。", maxLength: 400 }
          ]
        }
      ]
    },
    {
      id: "followup",
      title: "补充回执",
      description: "最后补一小段更自由的判断，方便开发者整理优先级。",
      questions: [
        {
          id: "D15",
          type: "text",
          label: "现在最值得保留的一个方向是什么？",
          required: false,
          placeholder: "可以是氛围、节奏、系统耦合方式，或某个具体页面。",
          maxLength: 500
        },
        {
          id: "D16",
          type: "text",
          label: "现在最该删掉或重做的一个点是什么？",
          required: false,
          placeholder: "写你觉得收益最高的一刀。",
          maxLength: 500
        },
        {
          id: "D17",
          type: "text",
          label: "还有别的补充吗？",
          required: false,
          placeholder: "例如：设备环境、操作习惯、和其他文字游戏或系统的对比。",
          maxLength: 800
        }
      ]
    }
  ]
});

export default CLOSED_TEST_V1;