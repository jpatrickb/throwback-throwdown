import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Tv } from './screens/Tv.tsx';
import { Play } from './screens/Play.tsx';
import { Host } from './screens/Host.tsx';
import './styles.css';

// Tiny path router: /tv, /host, everything else is the player screen.
const path = window.location.pathname.replace(/\/+$/, '');
const Screen = path === '/tv' ? Tv : path === '/host' ? Host : Play;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Screen />
  </StrictMode>,
);
