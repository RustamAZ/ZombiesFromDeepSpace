import { tutorialLevel } from './tutorial/config';
import { firstLevel } from './firstLevel/config';
import type { LevelDefinition, LevelId } from './LevelDefinition';

export const levels:Readonly<Record<LevelId,LevelDefinition>>={tutorial:tutorialLevel,firstLevel};
