import { beforeEach, describe, expect, it } from 'vitest';
import { useApp } from './store.ts';

describe('sélection', () => {
  beforeEach(() => useApp.getState().clearSelection());

  it('sélectionne au clic et choisit un second pays au Maj+clic', () => {
    const app = useApp.getState();
    app.select(10);
    app.select(20, true);
    expect(useApp.getState()).toMatchObject({ selected: 10, second: 20 });
  });

  it('repart de zéro au clic simple sur un autre pays ou sur la mer', () => {
    const app = useApp.getState();
    app.select(10);
    app.select(20, true);
    app.select(30);
    expect(useApp.getState()).toMatchObject({ selected: 30, second: 0 });
    app.select(0);
    expect(useApp.getState()).toMatchObject({ selected: 0, second: 0 });
  });

  it('ignore un Maj+clic sans sélection ou sur le pays déjà sélectionné', () => {
    const app = useApp.getState();
    app.select(10, true);
    expect(useApp.getState()).toMatchObject({ selected: 10, second: 0 });
    app.select(10, true);
    expect(useApp.getState()).toMatchObject({ selected: 10, second: 0 });
  });

  it('inverse A et B', () => {
    const app = useApp.getState();
    app.select(10);
    app.select(20, true);
    app.swapPair();
    expect(useApp.getState()).toMatchObject({ selected: 20, second: 10 });
  });
});
