import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";

import { generateStableSelector } from "../src/shared/dom/selectors";

test("generateStableSelector uniquely targets form-associated external submit buttons", () => {
  const { document } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <form id="search">
          <label>Query <input name="q" /></label>
          <button>Go Bare</button>
        </form>
        <form id="external">
          <label>Topic <input name="topic" /></label>
        </form>
        <button form="external">External Bare Submit</button>
      </body>
    </html>
  `);

  const target = document.querySelector("button[form='external']");
  assert.ok(target, "expected external submit button");

  const selector = generateStableSelector(target);

  assert.notEqual(selector, "button");
  assert.equal(document.querySelectorAll(selector).length, 1);
  assert.equal(document.querySelector(selector), target);
});

test("generateStableSelector does not collapse top-level buttons to a bare tag selector", () => {
  const { document } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <form>
          <button>Nested First</button>
        </form>
        <button>Top Level Target</button>
      </body>
    </html>
  `);

  const buttons = document.querySelectorAll("button");
  const target = buttons[1];
  assert.ok(target, "expected top-level target button");

  const selector = generateStableSelector(target);

  assert.notEqual(selector, "button");
  assert.equal(document.querySelectorAll(selector).length, 1);
  assert.equal(document.querySelector(selector), target);
});
