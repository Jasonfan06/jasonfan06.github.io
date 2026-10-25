import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { loadGallery } from './gallery.js';
import './styles.css';

const Studio = lazy(() => import('./Studio.jsx'));
const isLocalStudio = () => ['127.0.0.1', 'localhost'].includes(window.location.hostname) && window.location.hash === '#studio';

function Portfolio({ collections }) {
  const [studio, setStudio] = useState(isLocalStudio);
  useEffect(() => {
    const sync = () => setStudio(isLocalStudio());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  if (studio) return <Suspense fallback={<p style={{padding:'40px',fontSize:'14px'}}>Opening Canoe Studio…</p>}><Studio /></Suspense>;
  return <App collections={collections} />;
}

loadGallery().then((collections) => {
  createRoot(document.getElementById('root')).render(<StrictMode><Portfolio collections={collections} /></StrictMode>);
});
