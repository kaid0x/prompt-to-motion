// The edit. data/cues.json (written by pipeline/tts.py, or by hand) lists the plates and where each
// starts: [["portfolio_intro", 0]] plays one scene module for the whole read. Several plates cross-fade
// over XF seconds. A plate id is the file name of a module in src/scenes/.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import CUES from '@root/data/cues.json';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

const XF = 0.35;

export function makeTimeline(_ly: Lyrics, au: AudioData): TimelineEntry[] {
  const plates = CUES.plates as [string, number][];
  return plates.map(([id, start], i) => {
    const end = i + 1 < plates.length ? plates[i + 1]![1] + XF : au.duration;
    return { id, load: scene(id), start, end } satisfies TimelineEntry;
  });
}
