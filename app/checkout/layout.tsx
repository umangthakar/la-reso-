// Checkout segment layout (server component).
//
// The checkout page itself is a client component, so it can't carry route
// segment config. This layout forces the whole /checkout segment to render
// dynamically so nothing (incl. delivery settings) is ever statically cached
// on Vercel. The page's own data is fetched client-side with cache:"no-store".
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
