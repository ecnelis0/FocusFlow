import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1100 } });
p.on('console', m => { if (m.type()==='error') console.log('ERR:', m.text().slice(0,180)); });

await p.goto('http://localhost:3010/map?subject=European+History&folder=5daf3d60a03743e4825e4b316066e4a0', { waitUntil: 'networkidle' });
await p.waitForTimeout(3500);
console.log('nodes:', await p.locator('.react-flow__node').count(),
            '| edges:', await p.locator('.react-flow__edge').count(),
            '| arrowed:', await p.locator('.react-flow__edge.animated').count());
await p.screenshot({ path: '/tmp/o2-map.png' });

await p.goto('http://localhost:3010/folders/5daf3d60a03743e4825e4b316066e4a0', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
await p.screenshot({ path: '/tmp/o3-folder.png', fullPage: true });
await b.close();
