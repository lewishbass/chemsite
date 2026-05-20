import { component$, createContextId, Slot, useContext, useContextProvider, type Signal } from '@builder.io/qwik';

export const ActiveSectionCtx = createContextId<Signal<string>>('fading-display.active');

export const FadingDisplay = component$(({ active_id, }: { active_id: Signal<string> }) => {
  useContextProvider(ActiveSectionCtx, active_id);

  return (
    <div class="relative w-full">
      <Slot />
    </div>
  );
});

export const FadingSection = component$(({ id }: { id: string }) => {
  const activeCtx = useContext(ActiveSectionCtx);
  const isActive = activeCtx.value === id;

  

  return (
    <div
      style={isActive
        ? 'opacity:1;transition:opacity 0.5s ease;'
        : 'opacity:0;position:absolute;inset:0;pointer-events:none;transition:opacity 0.5s ease'}
      aria-hidden={!isActive ? 'true' : undefined}
    >
      <Slot />
    </div>
  );
});
