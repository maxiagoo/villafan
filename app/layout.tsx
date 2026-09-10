import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Villafan Planejados', description: 'Inspirações para seu ambiente e solicitações de móveis sob medida.' };
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="pt-BR"><body>{children}</body></html>; }
