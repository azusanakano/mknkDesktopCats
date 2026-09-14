#ifndef MKNK_PET_BEHAVIOR_H
#define MKNK_PET_BEHAVIOR_H

/* Behavior uses the 50 ms simulation clock. The caller does not tick it
   while paused, hidden or dragged, so resting time resumes where it stopped. */
enum PetState {
  STATE_WALK = 0, STATE_SIT, STATE_SLEEP, STATE_STRETCH,
  STATE_PAW, STATE_JUMP, STATE_ALERT, STATE_RUN
};

#define FRAME_SIT 8
#define FRAME_SLEEP 9
#define FRAME_STRETCH 10
#define FRAME_PAW 11
#define FRAME_JUMP 12
#define FRAME_ALERT 13
#define JUMP_TICKS 40u

typedef struct PetBehavior {
  int state;
  unsigned int ticksRemaining;
  unsigned int elapsedTicks;
  unsigned int randomState;
} PetBehavior;

static unsigned int pet_behavior_random(PetBehavior* behavior) {
  behavior->randomState = behavior->randomState * 1664525u + 1013904223u;
  return behavior->randomState;
}

static void pet_behavior_begin(PetBehavior* behavior, int state) {
  if (state < STATE_WALK || state > STATE_RUN) state = STATE_WALK;
  behavior->state = state;
  behavior->elapsedTicks = 0;
  switch (state) {
    case STATE_WALK: behavior->ticksRemaining = 100u + pet_behavior_random(behavior) % 220u; break;
    case STATE_SIT: behavior->ticksRemaining = 45u + pet_behavior_random(behavior) % 70u; break;
    case STATE_SLEEP: behavior->ticksRemaining = 110u + pet_behavior_random(behavior) % 150u; break;
    case STATE_STRETCH:
    case STATE_PAW: behavior->ticksRemaining = 30u; break;
    case STATE_JUMP: behavior->ticksRemaining = JUMP_TICKS; break;
    case STATE_ALERT: behavior->ticksRemaining = 35u + pet_behavior_random(behavior) % 35u; break;
    case STATE_RUN: behavior->ticksRemaining = 45u + pet_behavior_random(behavior) % 55u; break;
  }
}

static void pet_behavior_init(PetBehavior* behavior, unsigned int seed,
                              unsigned int initialWalkTicks) {
  behavior->randomState = seed;
  pet_behavior_begin(behavior, STATE_WALK);
  if (initialWalkTicks) behavior->ticksRemaining = initialWalkTicks;
}

static void pet_behavior_tick(PetBehavior* behavior) {
  if (behavior->ticksRemaining > 1u) {
    behavior->ticksRemaining--;
    behavior->elapsedTicks++;
    return;
  }
  /* The original autonomous action mix, with a stretch after waking. */
  if (behavior->state == STATE_SLEEP) {
    pet_behavior_begin(behavior, STATE_STRETCH);
    return;
  }
  unsigned int roll = pet_behavior_random(behavior) % 100u;
  int state = roll < 46u ? STATE_WALK : roll < 61u ? STATE_SIT :
              roll < 72u ? STATE_SLEEP : roll < 82u ? STATE_STRETCH :
              roll < 90u ? STATE_PAW : roll < 95u ? STATE_ALERT :
              roll < 98u ? STATE_RUN : STATE_JUMP;
  pet_behavior_begin(behavior, state);
}

static int pet_behavior_moves(const PetBehavior* behavior) {
  return behavior->state == STATE_WALK || behavior->state == STATE_RUN;
}

static int pet_behavior_frame(const PetBehavior* behavior, int walkSlot) {
  switch (behavior->state) {
    case STATE_SIT: return FRAME_SIT;
    case STATE_SLEEP: return FRAME_SLEEP;
    case STATE_STRETCH: return FRAME_STRETCH;
    case STATE_PAW: return FRAME_PAW;
    case STATE_JUMP: return FRAME_JUMP;
    case STATE_ALERT: return FRAME_ALERT;
    default: return walkSlot >= 0 && walkSlot < 8 ? walkSlot : 0;
  }
}

static int pet_behavior_jump_offset(const PetBehavior* behavior, int size) {
  if (behavior->state != STATE_JUMP) return 0;
  unsigned int t = behavior->elapsedTicks;
  if (t >= JUMP_TICKS) return 0;
  /* Translate the complete jump image; never deform the painted body. */
  return (int)(4u * (unsigned int)(size / 3) * t * (JUMP_TICKS - t) /
               (JUMP_TICKS * JUMP_TICKS));
}

#endif
