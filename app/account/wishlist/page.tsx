"use client";

import { Heart } from "lucide-react";
import { AccountSubPage } from "@/components/account-sub-page";

export default function WishlistPage() {
  return (
    <AccountSubPage
      title="Wishlist"
      icon={Heart}
      headline="No saved items"
      sub="Tap the heart on any treat to save it here for later."
    />
  );
}
