import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const origin = import.meta.env.VITE_PARTY_API_ORIGIN as string | undefined;
createRoot(document.getElementById('root')!).render(<App origin={origin} />);
