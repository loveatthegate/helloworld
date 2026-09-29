export type CheckItemAttrs = {
  scope: "throughout" | "step" | "after_event";
  judgeType: "presence" | "action" | "order" | "duration" | "count" | "coverage" | "prohibition";
  missingEvidence: "not_observed" | "not_applicable";
  evidenceFrom: "global" | "detail" | "any";
  segmentSource: "worker" | "vision" | "voice" | "gesture";
};

export function inferCheckItemAttrs(input: {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  riskHint?: string | null;
  keyActions?: string[] | null;
  passCriteria?: string | null;
}): CheckItemAttrs {
  const text = [
    input.title,
    input.description,
    input.category,
    input.riskHint,
    input.passCriteria,
    ...(input.keyActions ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  const prohibition = /禁止|不得|不准|严禁|负向/.test(text);
  const throughout =
    prohibition ||
    /全程|始终|一直|作业期间|必须佩戴|不得离开|值守|持续/.test(text) ||
    input.category === "准备" && /防护|PPE|着装|安全帽/.test(text);
  const afterEvent = /事件后|报警后|触发后|若发生/.test(text);
  const detail = /特写|细节|近景|挂牌|验电|签字|铭牌/.test(text);
  return {
    scope: afterEvent ? "after_event" : throughout ? "throughout" : "step",
    judgeType: prohibition
      ? "prohibition"
      : throughout
        ? "presence"
        : /顺序|先后/.test(text)
          ? "order"
          : /分钟|持续|不少于/.test(text)
            ? "duration"
            : /次|点位|覆盖|巡/.test(text)
              ? "coverage"
              : "action",
    missingEvidence: detail ? "not_applicable" : "not_observed",
    evidenceFrom: detail ? "detail" : "any",
    segmentSource: "worker",
  };
}

export const SCOPE_LABEL: Record<string, string> = {
  throughout: "全程",
  step: "分步",
  after_event: "事件后",
};

export const JUDGE_LABEL: Record<string, string> = {
  presence: "状态有无",
  action: "动作发生",
  order: "顺序",
  duration: "持续时长",
  count: "次数",
  coverage: "点位覆盖",
  prohibition: "负向禁则",
};
