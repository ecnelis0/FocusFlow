import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
p.on('console', m => { if (m.type()==='error') console.log('ERR:', m.text().slice(0,180)); });

// The mind map for the folder that was built with broad concepts.
await p.goto('http://localhost:3010/map?subject=Chemistry', { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
await p.screenshot({ path: '/tmp/m-map.png' });
console.log('map nodes:', await p.locator('.react-flow__node').count(),
            '| edges:', await p.locator('.react-flow__edge').count());

// The folder page.
await p.goto('http://localhost:3010/folders/cc80d6091dc64a38b30921ebb8f8ad77', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
await p.screenshot({ path: '/tmp/m-folder.png', fullPage: true });
console.log('folder: concept links', await p.locator('a[href^="/concepts/"]').count(),
            '| question cards', await p.locator('a[href^="/bank/"]').count());
await b.close();
