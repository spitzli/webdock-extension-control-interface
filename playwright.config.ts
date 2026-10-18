import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'e2e',workers:1,retries:0,timeout:30000,use:{baseURL:'http://127.0.0.1:3494',viewport:{width:1440,height:1000},launchOptions:{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}},webServer:{command:'bun run preview',url:'http://127.0.0.1:3494',reuseExistingServer:true},reporter:'line'});
