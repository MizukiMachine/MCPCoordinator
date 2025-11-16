import type { MCPServer } from '@openai/agents-core';

export type McpTransportKind = 'sse' | 'stdio' | 'streamable_http';

export interface McpServerConfig {
  /** 一意なキー。シナリオ側の requiredMcpServers で参照する */
  id: string;
  /** 接続方式 */
  transport: McpTransportKind;
  /** SSE / Streamable HTTP 用のURL */
  url?: string;
  /** STDIO 用のコマンド */
  command?: string;
  /** STDIO 用の追加引数 */
  args?: string[];
  /** fetch / EventSource に渡すヘッダー */
  headers?: Record<string, string>;
  /** MCP SDK のツール一覧キャッシュ設定 */
  cacheToolsList?: boolean;
  /** 接続タイムアウト（ミリ秒） */
  timeoutMs?: number;
  /** display用の任意名。未指定なら id を使用 */
  name?: string;
}

export interface McpServerFactory {
  (config: McpServerConfig): MCPServer;
}

export interface McpRegistryLogger {
  debug?(message: string, context?: Record<string, any>): void;
  info?(message: string, context?: Record<string, any>): void;
  warn?(message: string, context?: Record<string, any>): void;
  error?(message: string, context?: Record<string, any>): void;
}
