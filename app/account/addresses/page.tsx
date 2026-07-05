"use client";

import { MapPin } from "lucide-react";
import { AccountSubPage } from "@/components/account-sub-page";

export default function AddressesPage() {
  return (
    <AccountSubPage
      title="Addresses"
      icon={MapPin}
      headline="Coming Soon"
      sub="Saved delivery addresses are on the way — check back soon."
    />
  );
}
