import { describe, expect, it } from 'vitest';
import { composePlaceAnswer, findPlaces, registerPlaces, type Place } from '../src/core/places';

const ids = (q: string) => findPlaces(q)?.places.map(p => p.id);

describe('where-is questions: every way of asking, every place', () => {
  it.each([
    ['Unde e toaleta?', 'toilet'], ['unde găsesc o toaletă', 'toilet'], ['Unde se află baia?', 'toilet'], ['unde-i wc-ul', 'toilet'], ['Unde naiba e toaleta', 'toilet'], ['cum ajung la toalete', 'toilet'],
    ['unde sunt băile', 'toilet'], ['arată-mi unde e toaleta', 'toilet'], ['Where is the restroom?', 'toilet'], ['where can I find a bathroom', 'toilet'],
    ['Unde e zona VIP?', 'vip'], ['unde găsesc lounge-ul', 'vip'], ['unde e salonul business', 'vip'],
    ['Unde e barul lui Coco?', 'coco'], ['unde e Coco bar', 'coco'], ['unde pot bea ceva la Coco', 'coco'],
    ['Unde găsesc un bancomat?', 'atm'], ['unde e ATM-ul', 'atm'], ['unde pot scoate bani', 'atm'], ['where is the ATM', 'atm'],
    ['Unde e cabinetul medical?', 'medical'], ['unde e punctul medical', 'medical'], ['am nevoie de un doctor, unde e', 'medical'], ['where is first aid', 'medical'],
    ['Unde e rent a car?', 'rentacar'], ['unde pot închiria o mașină', 'rentacar'], ['unde sunt firmele de închirieri auto', 'rentacar'], ['unde sunt magazinele de închiriat', 'rentacar'], ['where can I rent a car', 'rentacar'],
    ['Unde e ghișeul de informații?', 'info'], ['unde găsesc informații', 'info'], ['where is the information desk', 'info'],
    ['Unde e controlul de securitate?', 'security'], ['unde sunt porțile de securitate', 'security'], ['unde e security', 'security'], ['where is security', 'security'],
    ['Unde fac check-in?', 'checkin'], ['unde e ghișeul 4', 'checkin'], ['unde pot preda bagajul', 'checkin'],
    ['Unde pot mânca?', 'cafe'], ['unde găsesc o cafea', 'cafe'], ['unde pot lua ceva de mâncare', 'cafe'],
    ['Unde e duty free?', 'dutyfree'], ['unde găsesc magazinele', 'dutyfree'],
    ['Unde pot fuma?', 'smoking'], ['Unde pot încărca telefonul?', 'power'], ['unde e liftul', 'lift'], ['unde sunt scările', 'stairs'], ['Unde e ieșirea?', 'exit'],
  ])('%s -> %s', (q, id) => {
    expect(ids(q)?.[0]).toBe(id);
  });

  it('knows gates by number', () => {
    expect(findPlaces('Unde e poarta 3?')).toEqual({ places: [], gate: '3' });
    expect(findPlaces('where is gate 12')).toEqual({ places: [], gate: '12' });
  });

  it('does not answer questions that are not "where is" or that name no place', () => {
    expect(findPlaces('Am voie cu lichide?')).toBeNull();
    expect(findPlaces('La ce oră e îmbarcarea?')).toBeNull();
    expect(findPlaces('Unde zboară avionul meu?')).toBeNull();
    expect(findPlaces('Cât durează zborul?')).toBeNull();
  });

  it('prefers the specific mention when several words match', () => {
    expect(ids('unde sunt magazinele de închiriat')).toEqual(['rentacar']);
  });

  it('does not invent a position, and says when several places fit', () => {
    const a = composePlaceAnswer({ places: findPlaces('Unde e ATM-ul?')!.places }, 'ro', 'x', true);
    expect(a.text).toMatch(/poziția exactă/);
    expect(a.open).toBeUndefined();
    const many = composePlaceAnswer({ places: [findPlaces('unde e toaleta')!.places[0]!, findPlaces('unde e liftul')!.places[0]!] }, 'ro', 'x', true);
    expect(many.text).toMatch(/mai multe locuri/);
  });

  it('answers in English too, and says "I opened the map" only when it can', () => {
    const q = findPlaces('where is the restroom')!;
    expect(composePlaceAnswer(q, 'en', 's', true).text).toMatch(/I opened the map/);
    expect(composePlaceAnswer(q, 'en', 's', false).text).not.toMatch(/opened the map/);
  });

  it('lets the map module plug in real places', () => {
    const real: Place = { id: 'atm', kind: 'atm', names: { ro: 'Bancomat', en: 'ATM' }, aliases: ['atm', 'bancomat'], nodeId: 'f0_atm', where: { ro: 'La parter, lângă intrare', en: 'On the ground floor, by the entrance' } };
    registerPlaces([real]);
    const a = composePlaceAnswer(findPlaces('Unde e ATM-ul?')!, 'ro', 's', true);
    expect(a.text).toMatch(/lângă intrare/);
    expect(a.open?.nodeId).toBe('f0_atm');
    registerPlaces([]);
  });
});

describe('places that are on the 3D terminal map', () => {
  it('open the 3D map with a route to the place, and say so only when it opened', () => {
    const q = findPlaces('Unde e salonul VIP?')!;
    const closed = composePlaceAnswer(q, 'ro', 'x', false);
    expect(closed.text).toContain('harta 3D');
    expect(closed.text).not.toContain('Am deschis harta');
    expect(closed.open).toMatchObject({ mapLabel: 'salon-vip' });
    expect(composePlaceAnswer(q, 'ro', 'x', true).text).toContain('Am deschis harta');
  });
  it("Coco's bar says where it is (right as you enter) and opens its label", () => {
    const a = composePlaceAnswer(findPlaces('Unde e barul lui Coco?')!, 'ro', 'x', true);
    expect(a.text).toMatch(/dreapta/);
    expect(a.open).toMatchObject({ mapLabel: 'la-coco' });
  });
});
