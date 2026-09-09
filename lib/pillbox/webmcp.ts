import { AIM_BOUNDS, type PillboxBattle } from './types';

/** Optional browser actions mirror the visible controls, without debug cheats. */
export function registerPillboxTools(actions: {
  read: () => PillboxBattle;
  start: () => void;
  aim: (x: number, z: number) => void;
  trigger: (held: boolean) => void;
}) {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool: (
          tool: {
            name: string;
            description: string;
            inputSchema: object;
            annotations: {
              readOnlyHint: boolean;
              untrustedContentHint: boolean;
            };
            execute: (input: unknown) => unknown;
          },
          options: { signal: AbortSignal },
        ) => void | Promise<void>;
      };
    }
  ).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const schema = (properties: object, required: string[] = []) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  });
  const values = (input: unknown, allowed: string[]) => {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !allowed.includes(key))
    )
      throw new Error('Invalid control input.');
    return input as Record<string, unknown>;
  };
  const read = () => {
    const b = actions.read();
    return {
      status: b.status,
      wave: b.wave,
      health: b.health,
      heat: b.heat,
      overheated: b.overheated,
      shots: b.shots,
      kills: b.kills,
      message: b.message,
      jeeps: b.jeeps,
      grenades: b.grenades,
      vehiclesStopped: b.vehiclesStopped,
      aimX: b.aimX,
      aimZ: b.aimZ,
      soldiers: b.soldiers
        .filter((s) => s.phase === 'advance' || s.phase === 'cover')
        .map((s) => ({
          id: s.id,
          x: s.x,
          z: s.z,
          phase: s.phase,
          grenadeState: s.grenadeState,
        })),
    };
  };
  const tools = [
    {
      name: 'get_beach_status',
      description: 'Read Stage 2 defense status and infantry positions.',
      inputSchema: schema({}),
      readOnly: true,
      execute(input: unknown) {
        values(input, []);
        return read();
      },
    },
    {
      name: 'start_beach_defense',
      description: 'Start or retry Stage 2 from its briefing or result screen.',
      inputSchema: schema({}),
      readOnly: false,
      execute(input: unknown) {
        values(input, []);
        if (['playing', 'paused'].includes(actions.read().status))
          throw new Error('Defense is already active.');
        actions.start();
        return read();
      },
    },
    {
      name: 'aim_machine_gun',
      description:
        'Aim the machine gun at a point on the beach. Does not fire.',
      inputSchema: schema(
        {
          x: {
            type: 'number',
            minimum: AIM_BOUNDS.minX,
            maximum: AIM_BOUNDS.maxX,
          },
          z: {
            type: 'number',
            minimum: AIM_BOUNDS.minZ,
            maximum: AIM_BOUNDS.maxZ,
          },
        },
        ['x', 'z'],
      ),
      readOnly: false,
      execute(input: unknown) {
        const v = values(input, ['x', 'z']);
        if (
          typeof v.x !== 'number' ||
          !Number.isFinite(v.x) ||
          v.x < AIM_BOUNDS.minX ||
          v.x > AIM_BOUNDS.maxX ||
          typeof v.z !== 'number' ||
          !Number.isFinite(v.z) ||
          v.z < AIM_BOUNDS.minZ ||
          v.z > AIM_BOUNDS.maxZ
        )
          throw new Error('Aim is outside the beach.');
        if (actions.read().status !== 'playing')
          throw new Error('Resume defense before aiming.');
        actions.aim(v.x, v.z);
        return read();
      },
    },
    {
      name: 'set_machine_gun_trigger',
      description:
        'Hold or release automatic fire, equivalent to holding or releasing the fire control.',
      inputSchema: schema({ held: { type: 'boolean' } }, ['held']),
      readOnly: false,
      execute(input: unknown) {
        const v = values(input, ['held']);
        if (typeof v.held !== 'boolean')
          throw new Error('Provide held as a boolean.');
        if (v.held && actions.read().status !== 'playing')
          throw new Error('Resume defense before firing.');
        actions.trigger(v.held);
        return read();
      },
    },
  ];
  for (const { readOnly, ...tool } of tools) {
    try {
      void Promise.resolve(
        context.registerTool(
          {
            ...tool,
            annotations: {
              readOnlyHint: readOnly,
              untrustedContentHint: false,
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional capability. */
    }
  }
  return () => lifecycle.abort();
}
