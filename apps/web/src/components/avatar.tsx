export function Avatar({ name, color, size = 28, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  return (
    <span
      title={name}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${ring ? "ring-2 ring-card" : ""}`}
      style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ people, max = 5, size = 24 }: { people: { name: string; color: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <span key={i} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar name={p.name} color={p.color} size={size} ring />
        </span>
      ))}
      {people.length > max && <span className="ml-1 text-xs text-muted">+{people.length - max}</span>}
    </span>
  );
}
