import type { ExpertContestRoleDefinition, ExpertContestRequest } from '@/app/agentConfigs/types';

export interface ExpertContestPreset {
  scenario: string;
  language: string;
  evaluationRubric: string;
  sharedContextBase: string[];
  experts: ExpertContestRoleDefinition[];
}

export const techContestPreset: ExpertContestPreset = {
  scenario: 'techParallelContest',
  language: 'ja-JP',
  evaluationRubric: `
- 設計の堅牢性とスケール戦略を10点満点で評価
- セキュリティ/レジリエンス配慮を10点満点で評価
- 自動化/実装計画の実現性を10点満点で評価
- 音声×MCP連携を踏まえたUX簡潔性を10点満点で評価
- 総合スコアは上記平均を基準にしつつ、整合性と根拠を加点対象とする
`,
  sharedContextBase: [
    '前提: TDD + インターフェース駆動開発を必須とし、ステップ毎にテスト戦略を明示すること。',
    '音声→MCP→音声の多層処理で生じるデバイス制約（電力/温度/接続）を常に考慮する。',
    '回答は日本語で簡潔に要約し、必要に応じて箇条書き2〜3点で実行計画を提示する。',
    '評価AIが勝者を選ぶため、各エキスパートは独自視点に集中し重複を避ける。',
  ],
  experts: [
    {
      id: 'hardware_os',
      title: 'ハード&OSアーキテクト',
      focus: '音声デバイスのSoC、センサー、OS層の最適化',
      instructions:
        '端末温度・バッテリー・マイク配列・低レイテンシOS設定にフォーカス。リアルタイムMCPパイプラインを支えるI/O割り込み管理やDSP最適化について、測定指標とテレメトリ設計を提示する。',
    },
    {
      id: 'network_security',
      title: 'ネット&セキュリティストラテジスト',
      focus: 'ネットワーク設計、ゼロトラスト、データ保護',
      instructions:
        'マルチリージョンMCP呼び出しの遅延/冗長化、音声データの暗号化、ポリシー違反検出の監査フローを提案。SLA指標とレート制御を必ず含める。',
    },
    {
      id: 'software_automation',
      title: 'ソフト開発&自動化リーダー',
      focus: 'エージェント実装、CI/CD、自動テスト',
      instructions:
        'ステップ毎のTDDシナリオ、コード生成/レビュー自動化、MCP APIコントラクトの型定義方針を提示。前提チェックリストの維持方法も含める。',
    },
    {
      id: 'workflow_optimization',
      title: 'ワークフロー最適化コンサルタント',
      focus: '運用手順、ヒューマンインザループ、可観測性',
      instructions:
        '現場オペレーション視点でオンコール手順、トライアージ、可視化ダッシュボードを提案。並列AIの勝者/準優勝を活かしたレトロスペクティブ運用も解説する。',
    },
  ],
};

export const MED_DISCLAIMER = '※ 医療行為の代替にはなりません。体調に異常がある場合や緊急症状がある場合は直ちに医療機関を受診してください。';
export const EMERGENCY_PROMPT = '救急症状（胸痛、呼吸困難、意識障害、激しい頭痛、痙攣など）がある場合は119番や最寄りの救急外来に連絡してください。';

export interface MedContestPreset extends ExpertContestPreset {
  disclaimer: string;
  emergencyPrompt: string;
}

export const medContestPreset: MedContestPreset = {
  scenario: 'medParallelContest',
  language: 'ja-JP',
  evaluationRubric: `
- 医学的正確性と最新エビデンスへの言及（0-10）
- 安全性/禁忌への配慮（0-10）
- パーソナル化と生活行動への落とし込み（0-10）
- 口頭説明のわかりやすさとフォローアップ提案（0-10）
- 合計スコアは総合理解度とリスク低減案を重視する
`,
  sharedContextBase: [
    'すべての回答に医療ディスクレーマーを含めること。',
    '緊急症状が想定される場合は即座に受診案内を優先する。',
    '睡眠・食事・運動・服薬など日常要素をバランス良く扱う。',
    'ユーザーの年齢/基礎疾患/服薬歴の有無を確認し、不確定なら慎重に記載する。',
  ],
  experts: [
    {
      id: 'internal_medicine',
      title: '内科エキスパート',
      focus: '症状評価・内科的指針・モニタリング',
      instructions:
        '症状の経過・基礎疾患・服薬状況を整理し、鑑別とセルフモニタリング項目を提示。受診タイミングと検査例も示す。',
      complianceNotes: [MED_DISCLAIMER, EMERGENCY_PROMPT],
    },
    {
      id: 'nutrition',
      title: '栄養プランナー',
      focus: '食事バランス・栄養タイミング',
      instructions:
        '既往症とアレルギーを考慮し、食事プランを3提案以内で提示。栄養素根拠と水分補給の目安を含める。',
      complianceNotes: [MED_DISCLAIMER],
    },
    {
      id: 'exercise_therapy',
      title: '運動療法スペシャリスト',
      focus: 'リハビリ・筋力トレーニング・柔軟性',
      instructions:
        '負荷レベルを段階化し、姿勢や呼吸の注意点を解説。疼痛やめまい発生時の中止ラインを必ず記載する。',
      complianceNotes: [MED_DISCLAIMER],
    },
    {
      id: 'lifestyle_safety',
      title: '生活習慣&安全性コーチ',
      focus: '睡眠/ストレス管理/環境要因/服薬遵守',
      instructions:
        '日中ルーティンとサポートネットワーク、転倒/事故リスク低減策を示す。緊急連絡体制の確認を促す。',
      complianceNotes: [MED_DISCLAIMER, EMERGENCY_PROMPT],
    },
  ],
  disclaimer: MED_DISCLAIMER,
  emergencyPrompt: EMERGENCY_PROMPT,
};

export interface ContestRequestOverrides {
  contestId?: string;
  userPrompt: string;
  relaySummary: string;
  sharedContextExtra?: string[];
  metadata?: Record<string, any>;
}

export function createContestRequestFromPreset(
  preset: ExpertContestPreset,
  overrides: ContestRequestOverrides,
): ExpertContestRequest {
  return {
    contestId: overrides.contestId ?? '',
    scenario: preset.scenario,
    language: preset.language,
    userPrompt: overrides.userPrompt,
    relaySummary: overrides.relaySummary,
    evaluationRubric: preset.evaluationRubric,
    sharedContext: [...preset.sharedContextBase, ...(overrides.sharedContextExtra ?? [])],
    experts: preset.experts,
    metadata: overrides.metadata,
  };
}
