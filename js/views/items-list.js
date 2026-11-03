// En lista med redigerbara kort. Delas av loggning, sparade måltider och recept.

import { h } from '../ui.js';
import { parseInput } from '../parser.js';
import { findMealByName } from '../recipes.js';
import { itemFromParsed, itemFromEntry, createItemEditor, toEntryFields, currentNutrients } from './item-editor.js';

export function createItemsList({ onChange = () => {}, allowAi = true, expandMeals = true } = {}) {
  const el = h('<div class="items"></div>');
  const editors = [];

  const changed = () => onChange(editors.map(e => e.item));

  function add(item, before = null) {
    const ed = createItemEditor(item, {
      allowAi,
      onChange: changed,
      onRemove: () => remove(ed),
      onSplit: (it, parts) => {
        // Ersätt AI-kortet med ett kort per del.
        for (const p of parts) add(itemFromEntry(p), ed.el);
        remove(ed);
      },
    });
    if (before) {
      el.insertBefore(ed.el, before);
      editors.splice(editors.findIndex(e => e.el === before), 0, ed);
    } else {
      el.append(ed.el);
      editors.push(ed);
    }
    changed();
    return ed;
  }

  function remove(ed) {
    const i = editors.indexOf(ed);
    if (i >= 0) editors.splice(i, 1);
    ed.el.remove();
    changed();
  }

  // Tolkar text. En rad som heter som en sparad måltid läggs in med alla måltidens delar.
  async function addText(text) {
    const used = [];
    for (const p of parseInput(text)) {
      const meal = expandMeals ? await findMealByName(p.raw) : null;
      if (meal) { addEntries(meal.items); used.push(meal); continue; }
      add(await itemFromParsed(p));
    }
    return used;
  }

  function addEntries(entries) {
    for (const e of entries) add(itemFromEntry(e));
  }

  // Samlar fälten för alla kort. Returnerar { fields: [[item, fields]] } eller { error, el }.
  async function collect() {
    const out = [];
    for (const ed of editors) {
      const f = await toEntryFields(ed.item);
      if (f.error) return { error: f.error, el: ed.el };
      out.push([ed.item, f]);
    }
    return { fields: out };
  }

  return {
    el,
    addText,
    addEntries,
    collect,
    items: () => editors.map(e => e.item),
    nutrients: () => editors.map(e => currentNutrients(e.item)).filter(Boolean),
    get length() { return editors.length; },
  };
}
