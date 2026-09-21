'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('public pages identify Deskprite, Justin, and transparent PNG sprites', () => {
  const home = read('docs/index.html');
  const guide = read('docs/guide/index.html');

  assert.match(home, /<title>Deskprite — Draw and Animate PNG Desktop Sprites<\/title>/);
  assert.match(home, /name="author" content="Justin Uurtsaikh"/);
  assert.match(home, /<script type="application\/ld\+json">/);
  assert.doesNotMatch(home, /class="walkthrough-demo"/);
  assert.match(home, /transparent PNG sprite sheet/);
  assert.doesNotMatch(home, /noindex/i);

  assert.match(guide, /<title>Transparent PNG Sprite Guide \| Deskprite by Justin Uurtsaikh<\/title>/);
  assert.match(guide, /rel="canonical" href="https:\/\/justin-uurtsaikh\.github\.io\/Deskprite\/guide\/"/);
  assert.doesNotMatch(guide, /noindex/i);
});

test('the homepage Sprout demo glides smoothly and respects reduced motion', () => {
  const css = read('docs/assets/site.css');
  const script = read('docs/assets/site.js');
  const petRule = css.match(/\.demo-pet\s*\{([^}]+)\}/)?.[1];

  assert.ok(petRule, 'expected the demo pet CSS rule');
  assert.match(petRule, /transition:\s*left[^;]+,\s*top[^;]+;/);
  assert.doesNotMatch(petRule, /steps\(/);
  assert.match(script, /pet\.addEventListener\("transitionend"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]+transition-duration: 0\.001ms !important;/);
});

test('structured data describes the visible software offer without fake reviews', () => {
  const home = read('docs/index.html');
  const jsonLdMatch = home.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);

  assert.ok(jsonLdMatch, 'expected SoftwareApplication JSON-LD');
  const structuredData = JSON.parse(jsonLdMatch[1]);
  const structuredDataHash = crypto.createHash('sha256').update(jsonLdMatch[1]).digest('base64');
  assert.equal(structuredData['@type'], 'SoftwareApplication');
  assert.equal(structuredData.name, 'Deskprite');
  assert.equal(structuredData.author.name, 'Justin Uurtsaikh');
  assert.equal(structuredData.offers.price, '0');
  assert.equal(structuredData.image, 'https://justin-uurtsaikh.github.io/Deskprite/assets/deskprite-demo-still.png');
  assert.equal(structuredData.aggregateRating, undefined);
  assert.equal(structuredData.review, undefined);
  assert.ok(home.includes(`'sha256-${structuredDataHash}'`), 'expected CSP to allow the JSON-LD block');
  assert.match(home, /Version 0\.3\.2\. Free and MIT licensed\./);
});

test('the sitemap lists both canonical pages and discoverable project images', () => {
  const sitemap = read('docs/sitemap.xml');
  assert.match(sitemap, /https:\/\/justin-uurtsaikh\.github\.io\/Deskprite\/<\/loc>/);
  assert.match(sitemap, /https:\/\/justin-uurtsaikh\.github\.io\/Deskprite\/guide\/<\/loc>/);
  assert.match(sitemap, /assets\/forest-home\.jpg<\/image:loc>/);
  assert.match(sitemap, /assets\/deskprite-demo-still\.png<\/image:loc>/);
  assert.match(sitemap, /assets\/sprout-sheet\.png<\/image:loc>/);
});

test('repository metadata points visitors to the public site and issue tracker', () => {
  const packageMetadata = JSON.parse(read('package.json'));
  const readme = read('README.md');

  assert.equal(packageMetadata.author, 'Justin Uurtsaikh');
  assert.equal(packageMetadata.name, 'deskprite');
  assert.equal(packageMetadata.homepage, 'https://justin-uurtsaikh.github.io/Deskprite/');
  assert.equal(packageMetadata.repository.url, 'git+https://github.com/Justin-Uurtsaikh/Deskprite.git');
  assert.equal(packageMetadata.bugs.url, 'https://github.com/Justin-Uurtsaikh/Deskprite/issues');
  assert.ok(packageMetadata.keywords.includes('desktop-sprite'));
  assert.match(readme, /\[Website\]\(https:\/\/justin-uurtsaikh\.github\.io\/Deskprite\/\)/);
  assert.match(readme, /\[Download source\]\(https:\/\/github\.com\/Justin-Uurtsaikh\/Deskprite\/archive\/refs\/heads\/main\.zip\)/);
});
