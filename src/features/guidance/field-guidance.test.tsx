import assert from "node:assert/strict";
import test from "node:test";
import { Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GuidedField } from "../../components/field-guidance";

test("a fragment-wrapped classification input retains suggestions, styling and accessible guidance", () => {
  const html = renderToStaticMarkup(<GuidedField label="Classification" help="Choose a suggestion or write your own." controlClassName="st-control">
    <><input list="cosmic-kinds" defaultValue="Dream" /><datalist id="cosmic-kinds"><option value="Dream" /></datalist></>
  </GuidedField>);
  const input = html.match(/<input\b[^>]*>/)?.[0] ?? "";
  const labelId = html.match(/<span id="([^"]+-label)"/)?.[1];
  const helpId = html.match(/<div id="([^"]+-help)"/)?.[1];
  assert.ok(labelId);
  assert.ok(helpId);
  assert.ok(input.includes(`aria-labelledby="${labelId}"`));
  assert.ok(input.includes(`aria-describedby="${helpId}"`));
  assert.match(input, /class="st-control"/);
  assert.match(input, /list="cosmic-kinds"/);
  assert.match(input, /value="Dream"/);
  assert.match(html, /<datalist id="cosmic-kinds"><option value="Dream"><\/option><\/datalist>/);
});

test("nested keyed fragments preserve existing control attributes and adjacent content", () => {
  const html = renderToStaticMarkup(<GuidedField label="Account" help="Describe the account." controlClassName="st-control">
    <Fragment key="outer"><Fragment key="inner"><textarea className="existing" aria-labelledby="custom-label" aria-describedby="existing-note" defaultValue="Retained account" /></Fragment><p id="existing-note">Existing note</p></Fragment>
  </GuidedField>);
  const textarea = html.match(/<textarea\b[^>]*>/)?.[0] ?? "";
  assert.match(textarea, /class="existing st-control"/);
  assert.match(textarea, /aria-labelledby="custom-label"/);
  assert.match(textarea, /aria-describedby="existing-note [^"]+-help"/);
  assert.match(html, />Retained account<\/textarea>/);
  assert.match(html, /<p id="existing-note">Existing note<\/p>/);
});

test("direct and custom controls still receive field attributes", () => {
  function CustomControl(props: { className?: string; "aria-labelledby"?: string; "aria-describedby"?: string }) {
    return <input {...props} />;
  }
  for (const child of [<select key="select"><option>Saved choice</option></select>, <CustomControl key="custom" />]) {
    const html = renderToStaticMarkup(<GuidedField label="Choice" controlClassName="st-control">{child}</GuidedField>);
    const control = html.match(/<(?:input|select)\b[^>]*>/)?.[0] ?? "";
    assert.match(control, /class="st-control"/);
    assert.match(control, /aria-labelledby="[^"]+-label"/);
    assert.doesNotMatch(control, /aria-describedby/);
  }
});
