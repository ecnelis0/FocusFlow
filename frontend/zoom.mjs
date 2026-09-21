import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:3010/map?subject=European+History&folder=5daf3d60a03743e4825e4b316066e4a0', { waitUntil: 'networkidle' });
await p.waitForTimeout(3500);
const flow = p.locator('.react-flow').first();
await flow.screenshot({ path: '/tmp/o4-zoom.png', clip: undefined });
// Hit-test a branch card to be sure it is clickable where it is drawn.
const card = p.locator('.react-flow__node').first();
const bx = await card.boundingBox();
console.log('elementFromPoint on a card:', await p.evaluate(
  ([x,y]) => { const el = document.elementFromPoint(x,y); return el ? el.tagName + '.' + String(el.className).slice(0,40) : 'null'; },
  [bx.x + bx.width/2, bx.y + bx.height/2]));
await b.close();
