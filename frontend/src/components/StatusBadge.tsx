interface Props {
  status: string;
}

const config: Record<string, { color: string; bg: string; label: string }> = {
  building: { color: "text-warning", bg: "bg-warning/10", label: "building" },
  live: { color: "text-success", bg: "bg-success/10", label: "live" },
  failed: { color: "text-error", bg: "bg-error/10", label: "failed" },
};

export default function StatusBadge({ status }: Props) {
  const c = config[status] || config.building;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs ${c.color} ${c.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "live" ? "bg-success" : status === "failed" ? "bg-error" : "bg-warning"} ${status === "building" ? "animate-pulse" : ""}`} />
      {c.label}
    </span>
  );
}
