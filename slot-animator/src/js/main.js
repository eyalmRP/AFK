import { start } from './ui/app.js';

start().catch((e) => {
  console.error(e);
  const app = document.getElementById('app');
  if (app) app.textContent = `Reel Studio could not start: ${e.message}`;
});
