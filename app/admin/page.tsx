import Studio from "../studio";
export default function AdminPage() {
  return (
    <Studio
      initialView="admin"
      url={process.env.NEXT_PUBLIC_SUPABASE_URL || ""}
      apiKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""}
    />
  );
}
