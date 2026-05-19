import { component$, useSignal, useVisibleTask$ } from '@builder.io/qwik';

const CYCLE_MS = 5000;   // hold time before each transition
const TRANS_MS = 500;   // enter/exit overlap duration

type ScrollThroughProps = {
  word_list?: string[];
};

export const ScrollThrough = component$(({ word_list = [''] }: ScrollThroughProps) => {
  const currIdx = useSignal(0);
  const prevIdx = useSignal(-1);
  const transKey = useSignal(0);

  useVisibleTask$(({ cleanup }) => {
    const id = setInterval(() => {
      prevIdx.value = currIdx.value;
      currIdx.value = (currIdx.value + 1) % word_list.length;
      transKey.value += 1;
    }, CYCLE_MS + Math.random() * 1000);
    cleanup(() => clearInterval(id));
  });

  const ab = transKey.value % 2 === 0 ? 'a' : 'b';

  return (
    <span class="relative inline-block">
      {/* invisible placeholder — reserves width of longest word */}
      <span class="opacity-0 select-none pointer-events-none" aria-hidden="true">
        {word_list.reduce((a, b) => (a.length > b.length ? a : b))}
      </span>
      {/* exiting word — slides out downward */}
      {prevIdx.value >= 0 && (
        <span
          class="absolute inset-0 flex items-end justify-end text-accent whitespace-nowrap"
          style={`animation: word-exit-${ab} ${TRANS_MS}ms ease forwards`}
        >
          {word_list[prevIdx.value]}
        </span>
      )}
      {/* entering word — slides in from top */}
      <span
        class="absolute inset-0 flex items-end justify-end text-accent whitespace-nowrap"
        style={`animation: word-enter-${ab} ${TRANS_MS}ms ease forwards`}
      >
        {word_list[currIdx.value]}
      </span>
    </span>
  );
});
