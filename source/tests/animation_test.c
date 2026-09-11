#include <assert.h>
#include <stdio.h>
#include "walk_animation.h"

int main(void) {
  const int expected[8] = {0, 12, 1, 13, 2, 14, 3, 15};
  for (int speed = 1; speed <= 3; speed++) {
    int dwell = 150 / speed;
    for (int cycle = 0; cycle < 3; cycle++) {
      for (int slot = 0; slot < 8; slot++) {
        unsigned int start = (unsigned int)(cycle * 8 + slot) * dwell;
        assert(walk_frame_at_time(start, speed) == expected[slot]);
        assert(walk_frame_at_time(start + dwell - 1, speed) == expected[slot]);
        assert(walk_slot_for_frame(expected[slot]) == slot);
      }
    }
    /* The actual 25 ms presentation cadence visits all eight poses evenly. */
    int counts[8] = {0};
    for (unsigned int t = 0; t < (unsigned int)(8 * dwell); t += TIMER_MS)
      counts[walk_slot_for_frame(walk_frame_at_time(t, speed))]++;
    for (int i = 0; i < 8; i++) assert(counts[i] == dwell / (int)TIMER_MS);
  }
  for (int frame = 4; frame <= 11; frame++) assert(walk_slot_for_frame(frame) == -1);
  assert(walk_slot_for_frame(-1) == -1 && walk_slot_for_frame(16) == -1);
  /* Interpolation must be monotonic in both directions, including negative
     monitor coordinates, without accelerating the original movement. */
  for (int direction = -1; direction <= 1; direction += 2) {
    for (int speed = 1; speed <= 3; speed++) {
      int last = -500;
      for (unsigned int t = 0; t < SIMULATION_MS; t++) {
        int x = interpolate_position(-500, -500 + direction * speed, t);
        assert(direction * (x - last) >= 0);
        assert(direction * (x + 500) <= speed);
        last = x;
      }
      assert(interpolate_position(-500, -500 + direction * speed, SIMULATION_MS) ==
             -500 + direction * speed);
    }
  }
  puts("animation: 8 distinct poses, uniform timing at all speeds, seamless wrap, monotonic movement passed");
  return 0;
}
