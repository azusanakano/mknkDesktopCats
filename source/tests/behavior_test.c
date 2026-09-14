#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "walk_animation.h"
#include "pet_behavior.h"

int main(void) {
  assert(FRAME_COUNT == 14 && WALK_FRAME_COUNT == 8);
  const int restStates[] = {STATE_SIT, STATE_SLEEP, STATE_STRETCH, STATE_PAW, STATE_JUMP, STATE_ALERT};
  const int restFrames[] = {8, 9, 10, 11, 12, 13};
  PetBehavior b;
  pet_behavior_init(&b, 42, 120);
  assert(b.state == STATE_WALK && b.ticksRemaining == 120 && b.elapsedTicks == 0);
  for (int i = 0; i < 6; i++) {
    pet_behavior_begin(&b, restStates[i]);
    unsigned int duration = b.ticksRemaining;
    assert(duration > 0 && !pet_behavior_moves(&b));
    for (unsigned int tick = 0; tick < duration; tick++) {
      assert(b.state == restStates[i]);
      assert(b.elapsedTicks == tick && b.ticksRemaining == duration - tick);
      for (int slot = 0; slot < 8; slot++) assert(pet_behavior_frame(&b, slot) == restFrames[i]);
      assert(walk_slot_for_frame(pet_behavior_frame(&b, 0)) == -1);
      pet_behavior_tick(&b);
    }
    assert(b.ticksRemaining > 0 && b.elapsedTicks == 0);
    if (restStates[i] == STATE_SLEEP) assert(b.state == STATE_STRETCH);
  }
  for (int moving = 0; moving < 2; moving++) {
    pet_behavior_begin(&b, moving ? STATE_RUN : STATE_WALK);
    assert(pet_behavior_moves(&b));
    for (int slot = 0; slot < 8; slot++) assert(pet_behavior_frame(&b, slot) == slot);
    assert(pet_behavior_frame(&b, -1) == 0 && pet_behavior_frame(&b, 8) == 0);
  }
  /* Jump is bounded, starts/finishes at the baseline, and leaves the painted
     body untouched: only an integer offset is returned to the window code. */
  for (int size = 176; size <= 288; size += 56) {
    pet_behavior_begin(&b, STATE_JUMP);
    int peak = 0;
    for (unsigned int tick = 0; tick <= JUMP_TICKS; tick++) {
      b.elapsedTicks = tick;
      int offset = pet_behavior_jump_offset(&b, size);
      assert(offset >= 0 && offset <= size / 3);
      if (tick == 0 || tick == JUMP_TICKS) assert(offset == 0);
      if (offset > peak) peak = offset;
    }
    assert(peak == size / 3);
    pet_behavior_begin(&b, STATE_SIT);
    assert(pet_behavior_jump_offset(&b, size) == 0);
  }
  /* Across independent cat seeds, every action is reachable autonomously;
     each rest eventually exits and returns to walking (no stuck sleepers). */
  for (unsigned int seed = 0; seed < 8; seed++) {
    PetBehavior first, repeat;
    pet_behavior_init(&first, seed, 1);
    pet_behavior_init(&repeat, seed, 1);
    int reached[8] = {0}, walkedAfterRest[8] = {0}, pendingRest[8] = {0};
    for (int tick = 0; tick < 200000; tick++) {
      assert(first.state >= STATE_WALK && first.state <= STATE_RUN);
      assert(first.ticksRemaining > 0 && first.ticksRemaining <= 320);
      assert(pet_behavior_frame(&first, tick % 8) >= 0 && pet_behavior_frame(&first, tick % 8) < FRAME_COUNT);
      reached[first.state]++;
      if (!pet_behavior_moves(&first)) pendingRest[first.state] = 1;
      else if (first.state == STATE_WALK) {
        for (int state = 0; state < 8; state++) { walkedAfterRest[state] += pendingRest[state]; pendingRest[state] = 0; }
      }
      pet_behavior_tick(&first); pet_behavior_tick(&repeat);
      assert(memcmp(&first, &repeat, sizeof(first)) == 0);
    }
    for (int state = STATE_WALK; state <= STATE_RUN; state++) assert(reached[state] > 0);
    for (int i = 0; i < 6; i++) assert(walkedAfterRest[restStates[i]] > 0);
  }
  puts("behavior: all six restored poses, exact walk mapping, autonomous recovery, sleep-to-stretch, jump bounds and deterministic seeds PASS");
  return 0;
}
