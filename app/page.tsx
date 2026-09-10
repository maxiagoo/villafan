import Studio from './studio';
export default function Home() { return <Studio url={process.env.NEXT_PUBLIC_SUPABASE_URL || ''} apiKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''}/>; }
