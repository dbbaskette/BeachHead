import type { Battle } from './simulation';
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute(input: unknown): unknown;
}
interface ModelContext {
  registerTool(
    tool: Tool,
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}
export function registerNavalTools(actions: {
  read: () => Battle;
  start: () => void;
  aim: (heading: number, range: number) => void;
  fire: () => void;
}) {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const read = () => {
    const b = actions.read();
    return {
      status: b.status,
      health: b.health,
      heading: b.heading,
      range: b.range,
      reload: b.reload,
      message: b.message,
      ships: b.ships.map((s) => ({
        name: s.name,
        health: s.health,
        bearing: (Math.atan2(s.x, -s.z) * 180) / Math.PI,
        range: Math.hypot(s.x, s.z),
      })),
    };
  };
  const empty = (input: unknown) => {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length
    )
      throw new Error('Expected an empty object.');
  };
  const schema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };
  const tools: Tool[] = [
    {
      name: 'get_battle_status',
      description:
        'Read the current naval battle, gun settings, and target ranges.',
      inputSchema: schema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        empty(input);
        return read();
      },
    },
    {
      name: 'start_battle',
      description:
        'Start a new naval encounter from the briefing or results screen. Does not restart an active encounter.',
      inputSchema: schema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        empty(input);
        if (['playing', 'paused'].includes(actions.read().status))
          throw new Error('A battle is already active.');
        actions.start();
        return read();
      },
    },
    {
      name: 'aim_guns',
      description:
        'Set gun bearing in degrees (-55 to 55) and range in meters (250 to 1600). Does not fire.',
      inputSchema: {
        type: 'object',
        properties: {
          heading: { type: 'number', minimum: -55, maximum: 55 },
          range: { type: 'number', minimum: 250, maximum: 1600 },
        },
        required: ['heading', 'range'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new Error('Provide heading and range.');
        const v = input as Record<string, unknown>;
        if (
          Object.keys(v).some((k) => !['heading', 'range'].includes(k)) ||
          typeof v.heading !== 'number' ||
          !Number.isFinite(v.heading) ||
          v.heading < -55 ||
          v.heading > 55 ||
          typeof v.range !== 'number' ||
          !Number.isFinite(v.range) ||
          v.range < 250 ||
          v.range > 1600
        )
          throw new Error('Heading must be -55..55 and range 250..1600.');
        if (actions.read().status !== 'playing')
          throw new Error('Start or resume the battle first.');
        actions.aim(v.heading, v.range);
        return read();
      },
    },
    {
      name: 'fire_guns',
      description:
        'Fire one salvo with the current bearing and range. Requires an active battle and reloaded guns.',
      inputSchema: schema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        empty(input);
        const b = actions.read();
        if (b.status !== 'playing' || b.reload > 0)
          throw new Error('Guns are not ready to fire.');
        actions.fire();
        return read();
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Optional browser capability; the visible game remains available. */
    }
  }
  return () => lifecycle.abort();
}
