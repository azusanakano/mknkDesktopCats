#include <assert.h>
#include <stdio.h>
#include "reference_walk.h"

int main(void) {
  for (int speed = 1; speed <= 3; speed++) {
    ReferenceWalk c = {0};
    unsigned int count = 0, distance = 0;
    for (unsigned int ms = 0; ms < 2400u; ms++) {
      int before = c.slot;
      int changed = reference_advance(&c, 1u, speed);
      if (changed) { count++; assert(c.slot == (before + 1) % 8); }
      else assert(c.slot == before);
      distance += reference_step_pixels(&c, 256);
    }
    assert(count == (unsigned int)(8 * speed));
    assert(c.slot == 0 && c.phaseUnits == 0);
    assert(distance == 48u * (unsigned int)speed);
  }
  const unsigned int intervals[] = {15, 33, 49, 75, 150, 300, 999999};
  ReferenceWalk stalled = {0};
  for (int n = 0; n < 1000; n++) {
    int old = stalled.slot;
    int changed = reference_advance(&stalled, intervals[n % 7], n % 3 + 1);
    assert(stalled.slot == (old + changed) % 8);
    assert(stalled.phaseUnits < REFERENCE_FRAME_UNITS);
    assert(reference_step_pixels(&stalled, 288) <= 14);
    assert(reference_step_pixels(&stalled, 288) == 0); /* consumed once */
  }
  ReferenceWalk speedChange = {0};
  assert(!reference_advance(&speedChange, 120, 2));
  assert(speedChange.phaseUnits == 240 && speedChange.slot == 0);
  assert(!reference_advance(&speedChange, 19, 3));
  assert(reference_advance(&speedChange, 1, 3));
  assert(speedChange.slot == 1 && speedChange.phaseUnits == 0);
  for (unsigned int size = 176; size <= 288; size += 16) {
    ReferenceWalk c = {0};
    unsigned int distance = 0;
    for (int n = 0; n < 8 * 16; n++) {
      reference_advance(&c, 150, 2);
      distance += reference_step_pixels(&c, size);
    }
    assert(distance == 16u * REFERENCE_STRIDE * size / 256u);
  }
  /* Motion must begin before a 150ms normal-speed pose boundary. */
  ReferenceWalk smooth = {0};
  assert(!reference_advance(&smooth, 33, 2));
  assert(reference_step_pixels(&smooth, 256) == 1);
  assert(smooth.slot == 0);
  /* A 33ms render cadence preserves the clock over complete cycles. */
  ReferenceWalk cadence = {0}; unsigned int distance = 0, changes = 0;
  for (int i = 0; i < 400; i++) {
    changes += reference_advance(&cadence, 33, 2);
    distance += reference_step_pixels(&cadence, 256);
  }
  assert(changes == 88 && cadence.slot == 0 && cadence.phaseUnits == 0);
  assert(distance == 528);
  puts("reference: F01..F08 order/loop, 3 speeds, timer stalls, speed continuity, continuous movement, scaled stride PASS");
  return 0;
}
