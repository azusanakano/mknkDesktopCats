#include <assert.h>
#include <stdio.h>
#include "walk_animation.h"
#include "reference_walk.h"
int main(void) {
  for(int speed=1;speed<=3;speed++) {
    ReferenceWalk cats[2]={{0},{0}};
    int reached[2][8]={{0}};
    for(int event=0;event<1000;event++) for(int cat=0;cat<2;cat++) {
      int previous=cats[cat].slot;
      reference_advance(&cats[cat],TIMER_MS,speed);
      reference_step_pixels(&cats[cat], 224);
      int current=cats[cat].slot;
      assert(current==previous || current==(previous+1)%8);
      assert(walk_frames[current]==current && walk_slot_for_frame(current)==current);
      reached[cat][current]++;
    }
    for(int cat=0;cat<2;cat++) for(int n=0;n<8;n++) assert(reached[cat][n]);
  }
  assert(walk_slot_for_frame(-1)==-1 && walk_slot_for_frame(8)==-1);
  puts("animation: both cats reach every F01..F08 pose in order at all speeds PASS");
  return 0;
}
