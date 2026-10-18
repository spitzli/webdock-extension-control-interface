import {test,expect} from '@playwright/test';
test('DNS table, ordinary forms, reviewed addition and deletion work in the real sandbox',async({page})=>{
 await page.goto('/');const ui=page.frameLocator('iframe');await expect(ui.getByRole('cell',{name:'192.0.2.24',exact:true})).toBeVisible();
 await page.screenshot({path:'screenshots/dns-console.png',fullPage:true});
 await ui.getByRole('button',{name:'Eintrag hinzufügen',exact:true}).click();
 const edit=ui.getByRole('dialog').last();await expect(edit).toBeVisible();
 await edit.locator('input[name=sld]').fill('browser-check');await edit.locator('input[name=data]').fill('192.0.2.77');
 await edit.getByRole('button',{name:'Änderung prüfen'}).click();
 await ui.getByRole('dialog').last().getByRole('button',{name:'Änderung bestätigen'}).click();
 await expect(ui.getByRole('cell',{name:'192.0.2.77',exact:true})).toBeVisible();
 await ui.getByRole('button',{name:'Löschen browser-check A',exact:true}).click();
 const review=ui.getByRole('dialog').last();await review.locator('input').fill('browser-check');await review.getByRole('button',{name:'Änderung bestätigen'}).click();
 await expect(ui.getByRole('cell',{name:'192.0.2.77',exact:true})).toHaveCount(0);
});
test('failed zone change cannot expose or mutate records from the previous zone',async({page})=>{
 await page.goto('/');const ui=page.frameLocator('iframe');await expect(ui.getByRole('cell',{name:'192.0.2.24',exact:true})).toBeVisible();
 await page.route('**/invoke',async route=>{const input=route.request().postDataJSON();if(input.name==='zones.get'&&Number(input.input.zone_id)===20334)await route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Fixture zone unavailable'})});else await route.continue();});
 await ui.getByRole('combobox',{name:'Zone auswählen'}).selectOption('20334');
 await expect(ui.getByRole('alert')).toContainText('Fixture zone unavailable');
 await expect(ui.getByRole('cell',{name:'192.0.2.24',exact:true})).toHaveCount(0);
 await expect(ui.getByRole('button',{name:'Bearbeiten @ A',exact:true})).toHaveCount(0);
});
test('JSON workbench highlights and folds without exposing an editable response',async({page})=>{
 await page.goto('/');const ui=page.frameLocator('iframe');await expect(ui.getByRole('cell',{name:'192.0.2.24',exact:true})).toBeVisible();
 await ui.getByRole('button',{name:'JSON',exact:true}).click();
 const dialog=ui.getByRole('dialog').last();const jsonButton=dialog.getByRole('button',{name:'JSON',exact:true});if(await jsonButton.count())await jsonButton.click();
 await expect(dialog.locator('.cm-editor')).toBeVisible();await expect(dialog.locator('.cm-content')).toHaveAttribute('contenteditable','false');
 await expect(dialog.locator('.cm-content span').first()).toBeVisible();
 await page.screenshot({path:'screenshots/json-workbench.png',fullPage:true});
});
for(const width of [320,375,414,768])test(`DNS console stays within ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.goto('/');const ui=page.frameLocator('iframe');await expect(ui.getByRole('cell',{name:'192.0.2.24',exact:true})).toBeVisible();
 const size=await ui.locator('body').evaluate(body=>({width:body.ownerDocument.documentElement.clientWidth,scroll:body.ownerDocument.documentElement.scrollWidth}));expect(size.scroll).toBeLessThanOrEqual(size.width);
 await ui.getByRole('button',{name:'Eintrag hinzufügen',exact:true}).click();await expect(ui.getByRole('dialog')).toBeVisible();
 const box=await ui.getByRole('dialog').boundingBox();expect(box!.width).toBeLessThanOrEqual(width);expect(box!.x).toBeGreaterThanOrEqual(0);
});

test('DNS form and JSON modes preserve a single draft',async({page})=>{
 await page.goto('/');const ui=page.frameLocator('iframe');await expect(ui.getByRole('cell',{name:'192.0.2.24',exact:true})).toBeVisible();
 await ui.getByRole('button',{name:'Eintrag hinzufügen',exact:true}).click();const edit=ui.getByRole('dialog').last();
 await edit.locator('input[name=sld]').fill('draft');await edit.locator('input[name=data]').fill('192.0.2.88');
 await edit.getByRole('button',{name:'Expertenmodus',exact:true}).click();
 const editor=edit.locator('.cm-content');await expect(editor).toContainText('192.0.2.88');
 await editor.fill('{"sld":"draft","type":"A","data":"192.0.2.99","ttl":300}');
 await edit.getByRole('button',{name:'Expertenmodus',exact:true}).click();await expect(editor).toContainText('192.0.2.99');
 await edit.getByRole('button',{name:'Formular',exact:true}).click();await expect(edit.locator('input[name=data]')).toHaveValue('192.0.2.99');
 await edit.locator('input[name=data]').fill('192.0.2.100');await edit.getByRole('button',{name:'Expertenmodus',exact:true}).click();await expect(edit.locator('.cm-content')).toContainText('192.0.2.100');
});

test('DNS replacement reports a partial failure and cannot blindly retry',async({page})=>{
 await page.goto('/');const ui=page.frameLocator('iframe');await expect(ui.getByRole('cell',{name:'192.0.2.24',exact:true})).toBeVisible();
 const calls:string[]=[];await page.route('**/invoke',async route=>{const body=route.request().postDataJSON();calls.push(body.name);if(body.name==='dns.delete')await route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Fixture deletion failed'})});else await route.continue();});
 await ui.getByRole('button',{name:'Bearbeiten @ A',exact:true}).click();const edit=ui.getByRole('dialog').last();await edit.locator('input[name=data]').fill('192.0.2.25');await edit.getByRole('button',{name:'Änderung prüfen'}).click();await ui.getByRole('dialog').last().getByRole('button',{name:'Änderung bestätigen'}).click();
 await expect(ui.getByRole('dialog').last().getByRole('alert')).toContainText('der alte konnte nicht gelöscht werden');
 await expect(ui.getByRole('dialog').last().getByRole('button',{name:'Änderung bestätigen'})).toHaveCount(0);
 expect(calls.filter(c=>c.startsWith('dns.'))).toEqual(['dns.add','dns.delete']);
});
