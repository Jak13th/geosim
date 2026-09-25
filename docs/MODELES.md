# Modèles

Équations, hypothèses et limites de chaque système, tenues à jour avec le code. Chaque coefficient cité se trouve dans `config/model.yaml`.

## 0. Aléa et déterminisme (`packages/engine/src/rng.ts`)

- **Générateur** : xoshiro128** (Blackman et Vigna, 2018), état de 4 × 32 bits. Il est vérifié contre l'implémentation C de référence (vecteurs dans `rng.test.ts`).
- **Initialisation** : les 4 mots d'état sont 4 sorties SplitMix32 de la graine. L'état nul, seul état interdit, est exclu.
- **Flux** : chaque système tire dans son propre flux, `graine_flux = SplitMix32(graine XOR FNV-1a(nom_du_système))`. Ajouter un tirage dans un système ne décale donc pas les tirages des autres.
- **Lois** :
  - uniforme `[0, 1)` = entier 32 bits / 2³² ;
  - entier `[0, n)` par multiplication (biais < n / 2³², négligeable) ;
  - normale par Box-Muller, en ne gardant qu'un des deux tirages.
- **Hypothèse** : le déterminisme bit à bit est garanti au sein d'un même moteur JavaScript (V8 pour Node et Chrome) ; voir DECISIONS D8.

## Systèmes (à venir)

| Section SPEC | Système                                      | Phase                     |
| ------------ | -------------------------------------------- | ------------------------- |
| §8.1         | Démographie                                  | 3                         |
| §8.2         | Économie et finances publiques               | 3                         |
| §8.3         | Commerce, routes maritimes, marchés          | 3 (marchés simplifiés), 4 |
| §8.4         | Énergie, alimentation, eau, minerais         | 4                         |
| §8.5         | Politique intérieure                         | 4                         |
| §8.6         | Diplomatie, alliances, sanctions, ONU        | 4                         |
| §8.7         | Forces armées                                | 5                         |
| §8.8         | Guerre et fronts                             | 5                         |
| §8.9         | Nucléaire, escalade, missiles, cyber, espace | 6                         |
| §8.10        | Événements                                   | 6                         |
| §8.11        | IA des pays                                  | 7                         |
| §8.12        | Santé, climat, technologie                   | 6                         |
