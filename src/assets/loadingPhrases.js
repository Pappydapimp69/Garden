const VERBS = [
  'Reticulating','Triangulating','Crossbreeding','Photosynthesizing','Pollinating',
  'Germinating','Chlorophylling','Propagating','Taxonomizing','Transpiring',
  'Rhizomatizing','Mycorrhizing','Stomating','Auxinizing','Sporulating',
  'Phenotyping','Grafting','Composting','Stratifying','Vernalizing',
];

const NOUNS = [
  'splines','root networks','leaf matrices','pollen vectors','soil horizons',
  'chloroplasts','seed banks','growth rings','vine lattices','mycelia',
  'stomatal arrays','bract formations','rhizomes','auxin gradients','spore clouds',
  'phenotype data','graft unions','humus layers','germination curves','photoperiods',
];

export function randomPhrase() {
  const v = VERBS[Math.floor(Math.random() * VERBS.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${v} ${n}…`;
}
