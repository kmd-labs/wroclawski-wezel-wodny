import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

async function cleanupStaleServiceWorkers(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    } catch {
      // ignore service worker cleanup failures
    }
  }
  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(n => n.startsWith('kmd-wildfires-'))
          .map(n => caches.delete(n))
      );
    } catch {
      // ignore cache cleanup failures
    }
  }
}

void cleanupStaleServiceWorkers();

bootstrapApplication(AppComponent).catch(err => console.error(err));
