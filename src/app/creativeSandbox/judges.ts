export interface CreativeJudgeProfile {
  id: 'judgeA' | 'judgeB' | 'judgeC';
  label: string;
  focus: string;
  instructions: string;
}

export const creativeJudgeProfiles: CreativeJudgeProfile[] = [
  {
    id: 'judgeA',
    label: 'Judge A — 正確さ重視',
    focus: 'ファクト整合性と指示順守',
    instructions:
      '候補文がユーザー指示に忠実か、事実や制約から逸脱していないかを主眼に採点します。短い根拠を必ず添えてください。',
  },
  {
    id: 'judgeB',
    label: 'Judge B — 構成・論理重視',
    focus: '論理展開と情報構造',
    instructions:
      '候補文の論理の筋道・段落構成・説得力を評価します。主張と根拠が噛み合っているか確認し、端的なコメントを返してください。',
  },
  {
    id: 'judgeC',
    label: 'Judge C — 表現とトーン重視',
    focus: '文体の切れ味と簡潔さ',
    instructions:
      '候補文の日本語表現、簡潔さ、創造的なフレーズを重視します。冗長さやトーンのズレがあれば減点理由に含めてください。',
  },
];

export function getCreativeJudgeProfiles() {
  return creativeJudgeProfiles;
}
