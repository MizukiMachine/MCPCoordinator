type Severity =
  | "DEFAULT"
  | "DEBUG"
  | "INFO"
  | "NOTICE"
  | "WARNING"
  | "ERROR"
  | "CRITICAL"
  | "ALERT"
  | "EMERGENCY";

type LogFields = Record<string, any>;

type LogParams = {
  message: string;
  severity?: Severity;
  component?: string;
  data?: LogFields;
  request?: Request | null;
  labels?: Record<string, string>;
};

/**
 * Cloud Logging がそのままパースできる JSON 形式で stdout へ出力する。
 * Cloud Run 上では request header の trace を付与すると、ログビューアでリクエストと紐付く。
 */
export function logStructured({
  message,
  severity = "INFO",
  component,
  data = {},
  request,
  labels,
}: LogParams) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT;
  const traceHeader = request?.headers?.get("x-cloud-trace-context");
  const [traceId] = traceHeader ? traceHeader.split("/") : [];
  const trace =
    projectId && traceId
      ? `projects/${projectId}/traces/${traceId}`
      : undefined;

  const entry: Record<string, any> = {
    severity,
    message,
    component,
    labels,
    ...data,
  };

  if (trace) {
    entry["logging.googleapis.com/trace"] = trace;
  }

  try {
    console.log(JSON.stringify(entry));
  } catch (err) {
    // JSON.stringify が失敗してもメッセージは落とさない
    console.log(
      JSON.stringify({
        severity: "ERROR",
        message: "Failed to log structured entry",
        component,
        originalMessage: message,
        error: String(err),
      }),
    );
  }
}

export function logError(message: string, data?: LogFields, request?: Request) {
  logStructured({ message, severity: "ERROR", data, request });
}

