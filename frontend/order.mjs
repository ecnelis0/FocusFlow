import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
p.on('response', r => { if (r.url().includes('/capture')) console.log('  <-', r.status(), r.request().method()); });

await p.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await p.getByRole('button', { name: 'New folder' }).click();
await p.getByLabel('Subject for the folder').fill('APUSH');
await p.getByLabel('Folder name').fill('Road to Revolution');
await p.getByRole('button', { name: 'Create folder' }).click();
await p.waitForTimeout(1500);

await p.getByLabel('Choose a file of notes').setInputFiles('/tmp/apush.txt');
await p.getByLabel('File it into').selectOption({ label: 'Road to Revolution' });
await p.getByRole('button', { name: 'Scan for concepts' }).click();
console.log('reading...');
await p.getByRole('heading', { name: 'Check before filing' }).waitFor({ timeout: 300000 });
await p.waitForTimeout(800);
await p.getByRole('button', { name: /^Approve and log/ }).click();
await p.getByText(/^Filed /).waitFor({ timeout: 120000 });
console.log('toast:', (await p.getByText(/^Filed /).textContent()).trim());
await b.close();
